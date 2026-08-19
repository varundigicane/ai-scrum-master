import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  ApiClient({required this.baseUrl, this.token});

  final String baseUrl;
  final String? token;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Uri _u(String path) => Uri.parse('${baseUrl.replaceAll(RegExp(r'/+\$'), '')}$path');

  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await http.post(
      _u('/api/mobile/login'),
      headers: _headers,
      body: jsonEncode({'email': email, 'password': password}),
    );
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(body['error']?.toString() ?? 'Sign in failed');
    }
    return body;
  }

  Future<Map<String, dynamic>> me() async {
    final res = await http.get(_u('/api/mobile/me'), headers: _headers);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(body['error']?.toString() ?? 'Session expired');
    }
    return body;
  }

  Future<List<dynamic>> meetingNotes() async {
    final res = await http.get(_u('/api/mobile/meeting-notes'), headers: _headers);
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
    final res = await http.post(
      _u('/api/mobile/meeting-notes'),
      headers: _headers,
      body: jsonEncode({'title': title, 'rawNotes': rawNotes, 'attendees': attendees}),
    );
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(body['error']?.toString() ?? 'Could not save note');
    }
    return body;
  }

  Future<List<dynamic>> projects() async {
    final res = await http.get(_u('/api/mobile/projects'), headers: _headers);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(body['error']?.toString() ?? 'Could not load projects');
    }
    return (body['projects'] as List<dynamic>?) ?? [];
  }
}
