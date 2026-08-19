import 'package:flutter/material.dart';
import '../api.dart';

/// Generic read-only list for catalog menus (parity with web lists).
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
      final res = await widget.api.menuData(widget.menuKey, projectId: projectId);
      if (!mounted) return;
      setState(() {
        data = res;
        projectId = res['projectId']?.toString() ?? projectId;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (error != null) {
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

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(widget.title, style: Theme.of(context).textTheme.titleLarge),
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
              value: projectId,
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
              child: Text('No data yet.'),
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
    );
  }
}
