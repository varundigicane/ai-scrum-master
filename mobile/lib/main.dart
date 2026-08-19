import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'theme.dart';
import 'screens/login_screen.dart';
import 'screens/home_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final token = prefs.getString('token');
  final baseUrl = prefs.getString('baseUrl') ?? 'http://10.0.2.2:3000';
  runApp(AiScrumApp(initialToken: token, initialBaseUrl: baseUrl));
}

class AiScrumApp extends StatefulWidget {
  const AiScrumApp({super.key, this.initialToken, required this.initialBaseUrl});

  final String? initialToken;
  final String initialBaseUrl;

  @override
  State<AiScrumApp> createState() => _AiScrumAppState();
}

class _AiScrumAppState extends State<AiScrumApp> {
  late ApiClient api;
  String? token;

  @override
  void initState() {
    super.initState();
    token = widget.initialToken;
    api = ApiClient(baseUrl: widget.initialBaseUrl, token: token);
  }

  Future<void> onLoggedIn(String newToken, String baseUrl) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', newToken);
    await prefs.setString('baseUrl', baseUrl);
    setState(() {
      token = newToken;
      api = ApiClient(baseUrl: baseUrl, token: newToken);
    });
  }

  Future<void> onLogout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    setState(() {
      token = null;
      api = ApiClient(baseUrl: api.baseUrl, token: null);
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AI Scrum Master',
      debugShowCheckedModeBanner: false,
      theme: digicaneLightTheme,
      home: token == null
          ? LoginScreen(api: api, onLoggedIn: onLoggedIn)
          : HomeShell(api: api, onLogout: onLogout),
    );
  }
}
