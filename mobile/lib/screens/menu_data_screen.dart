import 'package:flutter/material.dart';
import '../api.dart';
import '../offline_store.dart';

/// List + create/edit for catalog menus (parity with web writes where mutate supports it).
class MenuDataScreen extends StatefulWidget {
  const MenuDataScreen({
    super.key,
    required this.api,
    required this.menuKey,
    required this.title,
  });

  final ApiClient api;
  final String menuKey;
  final String title;

  @override
  State<MenuDataScreen> createState() => _MenuDataScreenState();
}

class _MenuDataScreenState extends State<MenuDataScreen> {
  Map<String, dynamic>? data;
  String? error;
  bool loading = true;
  String? projectId;
  bool offlineQueued = false;
  late final OfflineStore store;

  @override
  void initState() {
    super.initState();
    store = OfflineStore(widget.api);
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final cached = await store.getCache('menu:${widget.menuKey}');
      if (cached is Map && mounted) {
        setState(() => data = Map<String, dynamic>.from(cached));
      }
      final res = await widget.api.menuData(widget.menuKey, projectId: projectId);
      await store.putCache('menu:${widget.menuKey}', res);
      if (!mounted) return;
      setState(() {
        data = res;
        projectId = res['projectId']?.toString() ?? projectId;
      });
      await store.flush();
    } catch (e) {
      if (!mounted) return;
      if (data == null) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      } else {
        setState(() => offlineQueued = true);
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  bool get canCreate =>
      {'accounts', 'resources', 'users', 'leaves', 'quality'}.contains(widget.menuKey);

  Future<void> _create() async {
    final fields = <String, TextEditingController>{};
    String? leaveType = 'internal';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        Widget field(String key, String label, {bool obscure = false}) {
          fields.putIfAbsent(key, () => TextEditingController());
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: TextField(
              controller: fields[key],
              obscureText: obscure,
              decoration: InputDecoration(labelText: label),
            ),
          );
        }

        return StatefulBuilder(
          builder: (ctx, setLocal) {
            return AlertDialog(
              title: Text('New ${widget.title}'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (widget.menuKey == 'accounts') ...[
                      field('name', 'Name'),
                      field('code', 'Code'),
                    ],
                    if (widget.menuKey == 'resources') ...[
                      field('employeeId', 'Employee ID'),
                      field('name', 'Name'),
                      field('email', 'Email'),
                    ],
                    if (widget.menuKey == 'users') ...[
                      field('name', 'Name'),
                      field('email', 'Email'),
                      field('password', 'Password', obscure: true),
                      field('role', 'Role (e.g. Employee)'),
                    ],
                    if (widget.menuKey == 'leaves') ...[
                      field('resourceId', 'Resource ID'),
                      field('startDate', 'Start (YYYY-MM-DD)'),
                      field('endDate', 'End (YYYY-MM-DD)'),
                      field('reason', 'Reason'),
                      DropdownButtonFormField<String>(
                        value: leaveType,
                        items: const [
                          DropdownMenuItem(value: 'internal', child: Text('internal')),
                          DropdownMenuItem(value: 'client_informed', child: Text('client_informed')),
                        ],
                        onChanged: (v) => setLocal(() => leaveType = v),
                        decoration: const InputDecoration(labelText: 'Type'),
                      ),
                    ],
                    if (widget.menuKey == 'quality') ...[
                      field('projectId', 'Project ID'),
                      field('title', 'Title'),
                      field('description', 'Description'),
                    ],
                  ],
                ),
              ),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
              ],
            );
          },
        );
      },
    );
    if (ok != true) return;
    final body = <String, dynamic>{
      'menu': widget.menuKey,
      'action': 'create',
      for (final e in fields.entries) e.key: e.value.text.trim(),
      if (widget.menuKey == 'leaves') 'type': leaveType,
    };
    try {
      await widget.api.mutate(body);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved')));
      await _load();
    } catch (e) {
      await store.enqueue({'type': 'mutate', 'body': body});
      if (!mounted) return;
      setState(() => offlineQueued = true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Saved offline — will sync. (${e.toString().replaceFirst('Exception: ', '')})')),
      );
    } finally {
      for (final c in fields.values) {
        c.dispose();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading && data == null) return const Center(child: CircularProgressIndicator());
    if (error != null && data == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    final items = (data?['items'] as List<dynamic>?) ?? [];
    final projects = (data?['projects'] as List<dynamic>?) ?? [];
    final summary = data?['summary'] as Map<String, dynamic>?;

    return Scaffold(
      floatingActionButton: canCreate
          ? FloatingActionButton(onPressed: _create, child: const Icon(Icons.add))
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(widget.title, style: Theme.of(context).textTheme.titleLarge),
            if (offlineQueued)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('Offline changes queued — will sync when online.', style: TextStyle(color: Colors.orange)),
              ),
            if (summary != null) ...[
              const SizedBox(height: 8),
              Text(
                summary.entries.map((e) => '${e.key}: ${e.value}').join(' · '),
                style: TextStyle(color: Colors.blueGrey.shade700, fontSize: 12),
              ),
            ],
            if (projects.isNotEmpty) ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: projectId,
                decoration: const InputDecoration(labelText: 'Project'),
                items: projects
                    .map((p) {
                      final m = Map<String, dynamic>.from(p as Map);
                      return DropdownMenuItem(
                        value: m['id']?.toString(),
                        child: Text(m['name']?.toString() ?? ''),
                      );
                    })
                    .toList(),
                onChanged: (v) {
                  projectId = v;
                  _load();
                },
              ),
            ],
            const SizedBox(height: 12),
            if (items.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 24),
                child: Text('No data yet. Tap + to add when available.'),
              ),
            for (final raw in items)
              Card(
                child: ListTile(
                  title: Text((raw as Map)['title']?.toString() ?? ''),
                  subtitle: Text(raw['subtitle']?.toString() ?? ''),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
