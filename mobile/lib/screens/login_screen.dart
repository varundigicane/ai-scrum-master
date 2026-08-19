import 'package:flutter/material.dart';
import '../api.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api, required this.onLoggedIn});

  final ApiClient api;
  final Future<void> Function(String token, String baseUrl) onLoggedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final emailCtrl = TextEditingController(text: 'admin@acme.local');
  final passwordCtrl = TextEditingController(text: 'password123');
  late final baseUrlCtrl = TextEditingController(text: widget.api.baseUrl);
  String? error;
  bool loading = false;

  @override
  void dispose() {
    emailCtrl.dispose();
    passwordCtrl.dispose();
    baseUrlCtrl.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final client = ApiClient(baseUrl: baseUrlCtrl.text.trim(), token: null);
      final result = await client.login(emailCtrl.text.trim(), passwordCtrl.text);
      final token = result['token']?.toString();
      if (token == null || token.isEmpty) throw Exception('No session token returned');
      await widget.onLoggedIn(token, baseUrlCtrl.text.trim());
    } catch (e) {
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Text('AI SCRUM MASTER', style: TextStyle(color: Theme.of(context).colorScheme.primary, letterSpacing: 1.4, fontSize: 12)),
                const SizedBox(height: 8),
                const Text('Sign in', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Text('Delivery HQ on mobile', style: TextStyle(color: Colors.blueGrey.shade600)),
                const SizedBox(height: 24),
                if (error != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF1F2),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFFECDD3)),
                    ),
                    child: Text(error!, style: const TextStyle(color: Color(0xFF9F1239))),
                  ),
                TextField(controller: baseUrlCtrl, decoration: const InputDecoration(labelText: 'API base URL')),
                const SizedBox(height: 12),
                TextField(controller: emailCtrl, decoration: const InputDecoration(labelText: 'Email'), keyboardType: TextInputType.emailAddress),
                const SizedBox(height: 12),
                TextField(controller: passwordCtrl, decoration: const InputDecoration(labelText: 'Password'), obscureText: true),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: loading ? null : submit,
                  child: Text(loading ? 'Signing in…' : 'Continue'),
                ),
                const SizedBox(height: 12),
                Text('Emulator tip: use http://10.0.2.2:3000 to reach host localhost.', style: TextStyle(fontSize: 12, color: Colors.blueGrey.shade500)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
