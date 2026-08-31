import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_quill/flutter_quill.dart' as quill;
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'config.dart';
import 'reminder_alerts.dart';
import 'repository.dart';
import 'theme.dart';
import 'screens/login_screen.dart';
import 'screens/home_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  // Drop any legacy saved base URL (e.g. 10.0.2.2) so devices always hit production.
  await prefs.remove('baseUrl');
  final token = prefs.getString('token');
  final api = ApiClient(baseUrl: kApiBaseUrl, token: token);
  await initRepository(api);
  await ReminderAlerts.instance.init();
  runApp(AiScrumApp(initialToken: token));
}

class AiScrumApp extends StatefulWidget {
  const AiScrumApp({super.key, this.initialToken});

  final String? initialToken;

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
    api = ApiClient(baseUrl: kApiBaseUrl, token: token);
  }

  Future<void> onLoggedIn(String newToken) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', newToken);
    await prefs.remove('baseUrl');
    await repo.clearOffline();
    final newApi = ApiClient(baseUrl: kApiBaseUrl, token: newToken);
    await initRepository(newApi);
    setState(() {
      token = newToken;
      api = newApi;
    });
  }

  Future<void> onLogout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    await repo.clearOffline();
    final newApi = ApiClient(baseUrl: kApiBaseUrl, token: null);
    await initRepository(newApi);
    setState(() {
      token = null;
      api = newApi;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AI Scrum Master',
      debugShowCheckedModeBanner: false,
      theme: digicaneLightTheme,
      localizationsDelegates: const [
        quill.FlutterQuillLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en')],
      home: token == null
          ? LoginScreen(api: api, onLoggedIn: onLoggedIn)
          : HomeShell(api: api, onLogout: onLogout),
    );
  }
}
