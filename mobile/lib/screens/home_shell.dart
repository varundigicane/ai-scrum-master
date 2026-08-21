import 'package:flutter/material.dart';
import '../api.dart';
import '../repository.dart';
import '../widgets/offline_banner.dart';
import 'meeting_notes_screen.dart';
import 'overview_screen.dart';
import 'projects_screen.dart';
import 'billing_screen.dart';
import 'gts_screen.dart';
import 'agent_screen.dart';
import 'settings_screen.dart';
import 'menu_data_screen.dart';
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

  static const _listMenus = {
    'accounts',
    'resources',
    'users',
    'permissions',
    'status',
    'leaves',
    'reports',
    'backlog',
    'workboard',
    'quality',
    'teams',
  };

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
      final data = await repo.me();
      if (!mounted) return;
      setState(() => me = data);
    } catch (e) {
      if (!mounted) return;
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  List<Map<String, dynamic>> get menus {
    final raw = me?['menus'];
    if (raw is! List) {
      return [
        {'key': 'overview', 'label': 'Overview'},
        {'key': 'projects', 'label': 'Projects'},
        {'key': 'meeting_notes', 'label': 'Meeting Notes'},
      ];
    }
    final out = <Map<String, dynamic>>[];
    for (final item in raw) {
      if (item is Map) {
        out.add(Map<String, dynamic>.from(item));
      }
    }
    if (out.isEmpty) {
      return [
        {'key': 'overview', 'label': 'Overview'},
        {'key': 'projects', 'label': 'Projects'},
        {'key': 'meeting_notes', 'label': 'Meeting Notes'},
      ];
    }
    return out;
  }

  Widget get body {
    final key = selectedKey;
    switch (key) {
      case 'projects':
        return ProjectsScreen(api: widget.api);
      case 'meeting_notes':
        return MeetingNotesScreen(api: widget.api);
      case 'billing':
        return BillingScreen(api: widget.api);
      case 'gts_report':
        return GtsScreen(api: widget.api);
      case 'agent':
        return AgentScreen(api: widget.api);
      case 'settings':
        return SettingsScreen(api: widget.api);
      case 'overview':
        return OverviewScreen(me: me, onRefresh: _load);
      default:
        if (key != null && _listMenus.contains(key)) {
          final label = menus.firstWhere(
            (m) => m['key'] == key,
            orElse: () => {'label': key},
          )['label'];
          return MenuDataScreen(
            api: widget.api,
            menuKey: key,
            title: label?.toString() ?? key,
          );
        }
        final label = menus.firstWhere(
          (m) => m['key'] == selectedKey,
          orElse: () => {'label': selectedKey ?? 'Screen'},
        )['label'];
        return PlaceholderScreen(
          title: label?.toString() ?? 'Screen',
          message: 'This menu is not available on mobile yet.',
        );
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
                    Text(
                      'AI Scrum Master',
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.primary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(user?['name']?.toString() ?? '…'),
                    Text(
                      user?['roleLabel']?.toString() ?? user?['role']?.toString() ?? '',
                      style: TextStyle(color: Colors.blueGrey.shade600, fontSize: 12),
                    ),
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
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(error!, textAlign: TextAlign.center),
                        ),
                      )
                    : body,
          ),
        ],
      ),
    );
  }
}
