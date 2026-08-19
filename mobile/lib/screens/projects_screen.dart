import 'package:flutter/material.dart';
import '../api.dart';

class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  late Future<List<dynamic>> future;

  @override
  void initState() {
    super.initState();
    future = widget.api.projects();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<dynamic>>(
      future: future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) {
          return Center(child: Text(snap.error.toString().replaceFirst('Exception: ', '')));
        }
        final items = snap.data ?? [];
        if (items.isEmpty) return const Center(child: Text('No projects'));
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: items.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (context, i) {
            final p = items[i] as Map<String, dynamic>;
            return Card(
              child: ListTile(
                title: Text(p['name']?.toString() ?? ''),
                subtitle: Text('${p['accountName'] ?? ''} · ${p['phase'] ?? ''}'),
              ),
            );
          },
        );
      },
    );
  }
}
