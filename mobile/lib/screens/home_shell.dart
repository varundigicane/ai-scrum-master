import 'package:flutter/material.dart';
import '../api.dart';
import 'meeting_notes_screen.dart';
import 'overview_screen.dart';
import 'projects_screen.dart';
import 'placeholder_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.api, required this.onLogout});

  final ApiClient api;
  final Future<void> Function() onLogout;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  String? selectedKey = 'overview';
  Map<String, dynamic>? me;
  String? error;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await widget.api.me();
      setState(() => me = data);
    } catch (e) {
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  List<Map<String, dynamic>> get menus {
    final raw = me?['menus'];
    if (raw is List) {
      return raw.cast<Map<String, dynamic>>();
    }
    return [
      {'key': 'overview', 'label': 'Overview'},
      {'key': 'projects', 'label': 'Projects'},
      {'key': 'meeting_notes', 'label': 'Meeting Notes'},
    ];
  }

  Widget get body {
    switch (selectedKey) {
      case 'projects':
        return ProjectsScreen(api: widget.api);
      case 'meeting_notes':
        return MeetingNotesScreen(api: widget.api);
      case 'overview':
        return OverviewScreen(me: me, onRefresh: _load);
      default:
        final label = menus.firstWhere(
          (m) => m['key'] == selectedKey,
          orElse: () => {'label': selectedKey ?? 'Screen'},
        )['label'];
        return PlaceholderScreen(title: label?.toString() ?? 'Screen', message: 'Connected via mobile API. Open this area on web for full editors, or extend the mobile route for this menu.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = me?['user'] as Map<String, dynamic>?;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Delivery HQ'),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      drawer: Drawer(
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DrawerHeader(
                decoration: const BoxDecoration(color: Color(0xFFEEF4FA)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('AI Scrum Master', style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    Text(user?['name']?.toString() ?? '…'),
                    Text(user?['roleLabel']?.toString() ?? user?['role']?.toString() ?? '', style: TextStyle(color: Colors.blueGrey.shade600, fontSize: 12)),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  children: [
                    for (final m in menus)
                      ListTile(
                        selected: selectedKey == m['key'],
                        title: Text(m['label']?.toString() ?? m['key']?.toString() ?? ''),
                        onTap: () {
                          setState(() => selectedKey = m['key']?.toString());
                          Navigator.of(context).pop();
                        },
                      ),
                  ],
                ),
              ),
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('Sign out'),
                onTap: () async {
                  Navigator.of(context).pop();
                  await widget.onLogout();
                },
              ),
            ],
          ),
        ),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(error!, textAlign: TextAlign.center)))
              : body,
    );
  }
}
