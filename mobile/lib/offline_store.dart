import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../api.dart';

/// Lightweight offline-first cache + outbox (local prefs).
/// UI reads cache first; mutations enqueue and flush when online.
class OfflineStore {
  OfflineStore(this.api);
  final ApiClient api;

  static const _cachePrefix = 'offline_cache:';
  static const _outboxKey = 'offline_outbox';

  Future<void> putCache(String key, Object data) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('$_cachePrefix$key', jsonEncode({'at': DateTime.now().toIso8601String(), 'data': data}));
  }

  Future<dynamic> getCache(String key, {Duration maxAge = const Duration(hours: 24)}) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_cachePrefix$key');
    if (raw == null) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final at = DateTime.tryParse(map['at']?.toString() ?? '');
      if (at != null && DateTime.now().difference(at) > maxAge) return null;
      return map['data'];
    } catch (_) {
      return null;
    }
  }

  Future<List<Map<String, dynamic>>> outbox() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_outboxKey);
    if (raw == null || raw.isEmpty) return [];
    final list = jsonDecode(raw) as List<dynamic>;
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> enqueue(Map<String, dynamic> op) async {
    final prefs = await SharedPreferences.getInstance();
    final list = await outbox();
    list.add({...op, 'enqueuedAt': DateTime.now().toIso8601String()});
    await prefs.setString(_outboxKey, jsonEncode(list));
  }

  Future<void> _saveOutbox(List<Map<String, dynamic>> list) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_outboxKey, jsonEncode(list));
  }

  /// Flush mutate outbox; returns remaining count.
  Future<int> flush() async {
    var list = await outbox();
    final remaining = <Map<String, dynamic>>[];
    for (final op in list) {
      try {
        final type = op['type']?.toString();
        if (type == 'mutate') {
          await api.mutate(Map<String, dynamic>.from(op['body'] as Map));
        } else if (type == 'meeting_create') {
          await api.createMeetingNote(
            title: op['title']?.toString() ?? '',
            rawNotes: op['rawNotes']?.toString() ?? '',
            attendees: op['attendees']?.toString() ?? '',
          );
        } else {
          remaining.add(op);
        }
      } catch (_) {
        remaining.add(op);
      }
    }
    await _saveOutbox(remaining);
    return remaining.length;
  }
}
