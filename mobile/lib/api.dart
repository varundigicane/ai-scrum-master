import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

class ApiClient {
  ApiClient({required this.baseUrl, this.token});

  final String baseUrl;
  final String? token;

  static const Duration _timeout = Duration(seconds: 45);

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Uri _u(String path, [Map<String, String>? query]) {
    final base = baseUrl.replaceAll(RegExp(r'/+$'), '');
    return Uri.parse('$base$path').replace(queryParameters: query);
  }

  Never _rethrowFriendly(Object error) {
    if (error is TimeoutException) {
      throw Exception('Cannot reach the server. Check your internet connection and try again.');
    }
    if (error is SocketException) {
      throw Exception('Cannot reach the server. Check your internet connection and try again.');
    }
    if (error is http.ClientException) {
      throw Exception('Cannot reach the server. Check your internet connection and try again.');
    }
    if (error is FormatException) {
      throw Exception('Unexpected response from the server. Please try again.');
    }
    if (error is Exception) {
      throw error;
    }
    throw Exception('Something went wrong. Please try again.');
  }

  Future<http.Response> _send(Future<http.Response> Function() call) async {
    try {
      return await call().timeout(_timeout);
    } catch (error) {
      _rethrowFriendly(error);
    }
  }

  Future<Map<String, dynamic>> _json(http.Response res, {String fallback = 'Request failed'}) async {
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(body['error']?.toString() ?? fallback);
    }
    return body;
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await _send(
      () => http.post(
        _u('/api/mobile/login'),
        headers: _headers,
        body: jsonEncode({'email': email, 'password': password}),
      ),
    );
    return _json(res, fallback: 'Sign in failed');
  }

  Future<Map<String, dynamic>> me() async {
    final res = await _send(() => http.get(_u('/api/mobile/me'), headers: _headers));
    return _json(res, fallback: 'Session expired');
  }

  Future<List<dynamic>> meetingNotes({String q = '', String status = ''}) async {
    final query = <String, String>{};
    if (q.isNotEmpty) query['q'] = q;
    if (status.isNotEmpty) query['status'] = status;
    final res = await _send(
      () => http.get(_u('/api/mobile/meeting-notes', query.isEmpty ? null : query), headers: _headers),
    );
    final body = await _json(res, fallback: 'Could not load notes');
    return (body['notes'] as List<dynamic>?) ?? [];
  }

  Future<Map<String, dynamic>> createMeetingNote({
    required String title,
    required String rawNotes,
    String attendees = '',
    String? templateKey,
    String? noteStatus,
  }) async {
    final res = await _send(
      () => http.post(
        _u('/api/mobile/meeting-notes'),
        headers: _headers,
        body: jsonEncode({
          'title': title,
          'rawNotes': rawNotes,
          'attendees': attendees,
          if (templateKey != null && templateKey.isNotEmpty) 'templateKey': templateKey,
          if (noteStatus != null) 'noteStatus': noteStatus,
        }),
      ),
    );
    return _json(res, fallback: 'Could not save note');
  }

  Future<Map<String, dynamic>> meetingNoteDetail(String id) async {
    final res = await _send(() => http.get(_u('/api/mobile/meeting-notes/$id'), headers: _headers));
    return _json(res, fallback: 'Could not load note');
  }

  Future<Map<String, dynamic>> updateMeetingNote(
    String id, {
    required String title,
    required String rawNotes,
    String attendees = '',
    String? noteStatus,
    List<String>? resourceIds,
  }) async {
    final res = await _send(
      () => http.patch(
        _u('/api/mobile/meeting-notes/$id'),
        headers: _headers,
        body: jsonEncode({
          'title': title,
          'rawNotes': rawNotes,
          'attendees': attendees,
          if (noteStatus != null) 'noteStatus': noteStatus,
          if (resourceIds != null) 'resourceIds': resourceIds,
        }),
      ),
    );
    return _json(res, fallback: 'Could not update note');
  }

  Future<Map<String, dynamic>> meetingAction(String id, String action, [Map<String, dynamic>? body]) async {
    final res = await _send(
      () => http.post(
        _u('/api/mobile/meeting-notes/$id', {'action': action}),
        headers: _headers,
        body: jsonEncode(body ?? {}),
      ),
    );
    return _json(res, fallback: 'Action failed');
  }

  Future<Map<String, dynamic>> meetingProviders() async {
    final res = await _send(() => http.get(_u('/api/mobile/meeting-providers'), headers: _headers));
    return _json(res, fallback: 'Could not load providers');
  }

  Future<Map<String, dynamic>> settings() async {
    final res = await _send(() => http.get(_u('/api/mobile/settings'), headers: _headers));
    return _json(res, fallback: 'Could not load settings');
  }

  Future<Map<String, dynamic>> saveSettings(Map<String, dynamic> body) async {
    final res = await _send(
      () => http.patch(_u('/api/mobile/settings'), headers: _headers, body: jsonEncode(body)),
    );
    return _json(res, fallback: 'Could not save settings');
  }

  Future<Map<String, dynamic>> testEmail(String testTo) async {
    final res = await _send(
      () => http.patch(
        _u('/api/mobile/settings'),
        headers: _headers,
        body: jsonEncode({'action': 'test-email', 'testTo': testTo}),
      ),
    );
    return _json(res, fallback: 'Test email failed');
  }

  Future<List<dynamic>> projects() async {
    final res = await _send(() => http.get(_u('/api/mobile/projects'), headers: _headers));
    final body = await _json(res, fallback: 'Could not load projects');
    return (body['projects'] as List<dynamic>?) ?? [];
  }

  Future<Map<String, dynamic>> billing({required int year, required int month}) async {
    final res = await _send(
      () => http.get(
        _u('/api/mobile/billing', {'year': '$year', 'month': '$month'}),
        headers: _headers,
      ),
    );
    return _json(res, fallback: 'Could not load billing');
  }

  Future<Map<String, dynamic>> saveBillingOverride({
    required int year,
    required int month,
    required int totalWorkingDays,
    String note = '',
  }) async {
    final res = await _send(
      () => http.post(
        _u('/api/mobile/billing'),
        headers: _headers,
        body: jsonEncode({
          'year': year,
          'month': month,
          'totalWorkingDays': totalWorkingDays,
          'note': note,
        }),
      ),
    );
    return _json(res, fallback: 'Could not save override');
  }

  Future<Map<String, dynamic>> gts({String? accountId, required int year, required int month}) async {
    final query = <String, String>{'year': '$year', 'month': '$month'};
    if (accountId != null && accountId.isNotEmpty) query['accountId'] = accountId;
    final res = await _send(() => http.get(_u('/api/mobile/gts', query), headers: _headers));
    return _json(res, fallback: 'Could not load GTS');
  }

  Future<Map<String, dynamic>> gtsAction(Map<String, dynamic> body) async {
    final res = await _send(
      () => http.post(_u('/api/mobile/gts'), headers: _headers, body: jsonEncode(body)),
    );
    return _json(res, fallback: 'GTS action failed');
  }

  Future<Map<String, dynamic>> agentJobs() async {
    final res = await _send(() => http.get(_u('/api/mobile/agent'), headers: _headers));
    return _json(res, fallback: 'Could not load agent jobs');
  }

  Future<Map<String, dynamic>> runAgentJob(String job) async {
    final res = await _send(
      () => http.post(_u('/api/mobile/agent'), headers: _headers, body: jsonEncode({'job': job})),
    );
    return _json(res, fallback: 'Agent job failed');
  }

  Future<Map<String, dynamic>> menuData(String key, {String? projectId}) async {
    final query = <String, String>{'key': key};
    if (projectId != null && projectId.isNotEmpty) query['projectId'] = projectId;
    final res = await _send(() => http.get(_u('/api/mobile/menu-data', query), headers: _headers));
    return _json(res, fallback: 'Could not load data');
  }

  Future<Map<String, dynamic>> mutate(Map<String, dynamic> body) async {
    final res = await _send(
      () => http.post(_u('/api/mobile/mutate'), headers: _headers, body: jsonEncode(body)),
    );
    return _json(res, fallback: 'Could not save');
  }
}
