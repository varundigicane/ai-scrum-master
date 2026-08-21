import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

import 'api.dart';
import 'db/local_db.dart';

/// Tracks connectivity + pending outbox count and flushes queued writes.
class SyncService extends ChangeNotifier {
  SyncService(this._db);

  final LocalDb _db;
  ApiClient? _api;
  StreamSubscription? _sub;

  bool online = true;
  int pending = 0;
  bool _flushing = false;

  void attach(ApiClient api) {
    _api = api;
  }

  Future<void> start() async {
    await refreshPending();
    try {
      final current = await Connectivity().checkConnectivity();
      online = _isOnline(current);
    } catch (_) {
      online = true;
    }
    _sub ??= Connectivity().onConnectivityChanged.listen((result) async {
      final wasOnline = online;
      online = _isOnline(result);
      notifyListeners();
      if (!wasOnline && online) {
        await flush();
      }
    });
    if (online) unawaited(flush());
  }

  bool _isOnline(List<ConnectivityResult> results) {
    return results.any((r) => r != ConnectivityResult.none);
  }

  Future<void> refreshPending() async {
    pending = await _db.pendingCount();
    notifyListeners();
  }

  /// Replay every queued write in order. Server rejections (4xx) are dropped
  /// so a single bad request cannot block the queue forever; network errors
  /// keep the item for the next attempt.
  Future<void> flush() async {
    final api = _api;
    if (api == null || _flushing) return;
    _flushing = true;
    try {
      final ops = await _db.pending();
      for (final op in ops) {
        final id = op['id'] as int;
        try {
          await api.rawJson(
            op['method'] as String,
            op['path'] as String,
            query: _decodeQuery(op['query'] as String?),
            body: _decodeBody(op['body'] as String?),
          );
          await _db.deleteOutbox(id);
        } on NetworkException {
          break; // still offline; retry later
        } on ApiException catch (e) {
          await _db.markFailure(id, e.message);
          await _db.deleteOutbox(id);
        } catch (e) {
          await _db.markFailure(id, e.toString());
          await _db.deleteOutbox(id);
        }
      }
    } finally {
      _flushing = false;
      await refreshPending();
    }
  }

  Map<String, String>? _decodeQuery(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final map = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      return map.map((k, v) => MapEntry(k, v.toString()));
    } catch (_) {
      return null;
    }
  }

  Object? _decodeBody(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    return jsonDecode(raw);
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}

/// Offline-first data access: cache-first reads with revalidation, and writes
/// that fall back to a durable queue when the network is unreachable.
///
/// A process-wide singleton keeps wiring simple; call [initRepository] once at
/// startup and again whenever the auth token changes.
class Repository {
  Repository(this.api, this.db, this.sync);

  ApiClient api;
  final LocalDb db;
  final SyncService sync;

  static Repository? _instance;
  static Repository get instance {
    final i = _instance;
    if (i == null) {
      throw StateError('Repository not initialised. Call initRepository() first.');
    }
    return i;
  }

  static Future<Repository> init(ApiClient api) async {
    final db = LocalDb.instance;
    final existing = _instance;
    if (existing != null) {
      existing.api = api;
      existing.sync.attach(api);
      unawaited(existing.sync.start());
      return existing;
    }
    final sync = SyncService(db)..attach(api);
    final repo = Repository(api, db, sync);
    _instance = repo;
    unawaited(sync.start());
    return repo;
  }

  // ---- reads (cache-first fallback) ----

  Future<dynamic> _read(String key, Future<dynamic> Function() fetch) async {
    try {
      final value = await fetch();
      await db.putCache(key, value);
      return value;
    } on NetworkException {
      final cached = await db.getCache(key);
      if (cached != null) return cached;
      rethrow;
    }
  }

  Future<Map<String, dynamic>> me() async =>
      Map<String, dynamic>.from(await _read('me', () => api.me()));

  Future<List<dynamic>> projects() async {
    final v = await _read('projects', () async => await api.projects());
    return (v as List<dynamic>);
  }

  Future<List<dynamic>> meetingNotes({String q = '', String status = ''}) async {
    final key = 'meeting-notes:$q:$status';
    final v = await _read(key, () async => await api.meetingNotes(q: q, status: status));
    return (v as List<dynamic>);
  }

  Future<Map<String, dynamic>> meetingNoteDetail(String id) async =>
      Map<String, dynamic>.from(await _read('meeting-note:$id', () => api.meetingNoteDetail(id)));

  Future<Map<String, dynamic>> settings() async =>
      Map<String, dynamic>.from(await _read('settings', () => api.settings()));

  Future<Map<String, dynamic>> meetingProviders() async =>
      Map<String, dynamic>.from(await _read('meeting-providers', () => api.meetingProviders()));

  Future<Map<String, dynamic>> billing({required int year, required int month}) async =>
      Map<String, dynamic>.from(await _read('billing:$year-$month', () => api.billing(year: year, month: month)));

  Future<Map<String, dynamic>> gts({String? accountId, required int year, required int month}) async =>
      Map<String, dynamic>.from(
        await _read('gts:${accountId ?? ''}:$year-$month', () => api.gts(accountId: accountId, year: year, month: month)),
      );

  Future<Map<String, dynamic>> agentJobs() async =>
      Map<String, dynamic>.from(await _read('agent', () => api.agentJobs()));

  Future<Map<String, dynamic>> menuData(String key, {String? projectId}) async =>
      Map<String, dynamic>.from(
        await _read('menu:$key:${projectId ?? ''}', () => api.menuData(key, projectId: projectId)),
      );

  // ---- writes (queue on network failure) ----

  /// Runs a write online; if the network is unreachable, the request is queued
  /// and `{queued:true}` is returned so the UI can confirm optimistically.
  Future<Map<String, dynamic>> _write({
    required String method,
    required String path,
    Map<String, String>? query,
    Object? body,
    String? label,
  }) async {
    try {
      return await api.rawJson(method, path, query: query, body: body);
    } on NetworkException {
      await db.enqueue(method: method, path: path, query: query, body: body, label: label);
      await sync.refreshPending();
      return {'queued': true};
    }
  }

  Future<Map<String, dynamic>> mutate(Map<String, dynamic> body) =>
      _write(method: 'POST', path: '/api/mobile/mutate', body: body, label: '${body['menu']}/${body['action']}');

  Future<Map<String, dynamic>> createMeetingNote({
    required String title,
    required String rawNotes,
    String attendees = '',
    String? templateKey,
    String? noteStatus,
  }) =>
      _write(
        method: 'POST',
        path: '/api/mobile/meeting-notes',
        body: {
          'title': title,
          'rawNotes': rawNotes,
          'attendees': attendees,
          if (templateKey != null && templateKey.isNotEmpty) 'templateKey': templateKey,
          if (noteStatus != null) 'noteStatus': noteStatus,
        },
        label: 'Meeting note',
      );

  Future<Map<String, dynamic>> updateMeetingNote(
    String id, {
    required String title,
    required String rawNotes,
    String attendees = '',
    String? noteStatus,
    List<String>? resourceIds,
  }) =>
      _write(
        method: 'PATCH',
        path: '/api/mobile/meeting-notes/$id',
        body: {
          'title': title,
          'rawNotes': rawNotes,
          'attendees': attendees,
          if (noteStatus != null) 'noteStatus': noteStatus,
          if (resourceIds != null) 'resourceIds': resourceIds,
        },
        label: 'Update note',
      );

  Future<Map<String, dynamic>> meetingAction(String id, String action, [Map<String, dynamic>? body]) =>
      _write(
        method: 'POST',
        path: '/api/mobile/meeting-notes/$id',
        query: {'action': action},
        body: body ?? {},
        label: 'Note $action',
      );

  Future<Map<String, dynamic>> saveSettings(Map<String, dynamic> body) =>
      _write(method: 'PATCH', path: '/api/mobile/settings', body: body, label: 'Settings');

  Future<Map<String, dynamic>> saveBillingOverride({
    required int year,
    required int month,
    required int totalWorkingDays,
    String note = '',
  }) =>
      _write(
        method: 'POST',
        path: '/api/mobile/billing',
        body: {'year': year, 'month': month, 'totalWorkingDays': totalWorkingDays, 'note': note},
        label: 'Billing override',
      );

  Future<Map<String, dynamic>> gtsAction(Map<String, dynamic> body) =>
      _write(method: 'POST', path: '/api/mobile/gts', body: body, label: 'GTS');

  Future<Map<String, dynamic>> runAgentJob(String job) =>
      _write(method: 'POST', path: '/api/mobile/agent', body: {'job': job}, label: 'Agent $job');

  /// Online-only passthrough (e.g. test email) — no value in queuing.
  Future<Map<String, dynamic>> testEmail(String testTo) => api.testEmail(testTo);

  Future<void> clearOffline() => db.clearAll();
}

/// Convenience accessor.
Repository get repo => Repository.instance;

Future<Repository> initRepository(ApiClient api) => Repository.init(api);
