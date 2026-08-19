import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

class ApiClient {
  ApiClient({required this.baseUrl, this.token});

  final String baseUrl;
  final String? token;

  static const Duration _timeout = Duration(seconds: 20);

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Uri _u(String path) => Uri.parse('${baseUrl.replaceAll(RegExp(r'/+$'), '')}$path');

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

  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await _send(
      () => http.post(
        _u('/api/mobile/login'),
        headers: _headers,
        body: jsonEncode({'email': email, 'password': password}),
      ),
    );
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(body['error']?.toString() ?? 'Sign in failed');
    }
    return body;
  }

  Future<Map<String, dynamic>> me() async {
    final res = await _send(() => http.get(_u('/api/mobile/me'), headers: _headers));
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(body['error']?.toString() ?? 'Session expired');
    }
    return body;
  }

  Future<List<dynamic>> meetingNotes() async {
    final res = await _send(() => http.get(_u('/api/mobile/meeting-notes'), headers: _headers));
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(body['error']?.toString() ?? 'Could not load notes');
    }
    return (body['notes'] as List<dynamic>?) ?? [];
  }

  Future<Map<String, dynamic>> createMeetingNote({
    required String title,
    required String rawNotes,
    String attendees = '',
  }) async {
    final res = await _send(
      () => http.post(
        _u('/api/mobile/meeting-notes'),
        headers: _headers,
        body: jsonEncode({'title': title, 'rawNotes': rawNotes, 'attendees': attendees}),
      ),
    );
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(body['error']?.toString() ?? 'Could not save note');
    }
    return body;
  }

  Future<List<dynamic>> projects() async {
    final res = await _send(() => http.get(_u('/api/mobile/projects'), headers: _headers));
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(body['error']?.toString() ?? 'Could not load projects');
    }
    return (body['projects'] as List<dynamic>?) ?? [];
  }
}
