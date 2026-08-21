import 'package:flutter/material.dart';
import '../api.dart';
import '../repository.dart';

class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  Map<String, dynamic>? data;
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
      final res = await repo.menuData('projects');
      if (!mounted) return;
      setState(() => data = res);
    } catch (e) {
      if (!mounted) return;
      if (data == null) setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  bool get canEdit => data?['canEdit'] == true;

  List<Map<String, dynamic>> _list(String key) =>
      ((data?[key] as List<dynamic>?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();

  Future<void> _submit(Map<String, dynamic> body) async {
    try {
      final res = await repo.mutate(body);
      if (!mounted) return;
      final msg = res['queued'] == true ? 'Saved offline — will sync' : (res['message']?.toString() ?? 'Saved');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  Future<void> _projectForm({Map<String, dynamic>? item}) async {
    final accounts = _list('accounts');
    final nameCtrl = TextEditingController(text: item?['name']?.toString() ?? '');
    final startCtrl = TextEditingController(text: item?['startDate']?.toString() ?? '');
    final endCtrl = TextEditingController(text: item?['endDate']?.toString() ?? '');
    String? accountId = item?['accountId']?.toString() ?? (accounts.isNotEmpty ? accounts.first['id']?.toString() : null);
    String phase = item?['phase']?.toString() ?? 'Requirements';
    bool billable = item?['billable'] != false;
    const phases = ['Requirements', 'Design', 'Dev', 'Test', 'UAT', 'Closed'];

    Future<void> pickDate(TextEditingController c) async {
      final picked = await showDatePicker(
        context: context,
        initialDate: DateTime.tryParse(c.text) ?? DateTime.now(),
        firstDate: DateTime(2020),
        lastDate: DateTime(2100),
      );
      if (picked != null) c.text = picked.toIso8601String().split('T').first;
    }

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text(item == null ? 'New project' : 'Edit project'),
          content: SizedBox(
            width: MediaQuery.of(ctx).size.width,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (item == null)
                    DropdownButtonFormField<String>(
                      initialValue: accountId,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Account'),
                      items: accounts
                          .map((a) => DropdownMenuItem(value: a['id']?.toString(), child: Text(a['name']?.toString() ?? '')))
                          .toList(),
                      onChanged: (v) => setLocal(() => accountId = v),
                    ),
                  TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Name')),
                  DropdownButtonFormField<String>(
                    initialValue: phase,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Phase'),
                    items: phases.map((p) => DropdownMenuItem(value: p, child: Text(p))).toList(),
                    onChanged: (v) => setLocal(() => phase = v ?? 'Requirements'),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Billable'),
                    value: billable,
                    onChanged: (v) => setLocal(() => billable = v),
                  ),
                  TextField(
                    controller: startCtrl,
                    readOnly: true,
                    decoration: const InputDecoration(labelText: 'Start date', suffixIcon: Icon(Icons.calendar_today)),
                    onTap: () async {
                      await pickDate(startCtrl);
                      setLocal(() {});
                    },
                  ),
                  TextField(
                    controller: endCtrl,
                    readOnly: true,
                    decoration: const InputDecoration(labelText: 'End date', suffixIcon: Icon(Icons.calendar_today)),
                    onTap: () async {
                      await pickDate(endCtrl);
                      setLocal(() {});
                    },
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
          ],
        ),
      ),
    );
    final startVal = startCtrl.text.trim();
    final endVal = endCtrl.text.trim();
    final nameVal = nameCtrl.text.trim();
    nameCtrl.dispose();
    startCtrl.dispose();
    endCtrl.dispose();
    if (ok != true) return;
    await _submit({
      'menu': 'projects',
      'action': item == null ? 'create' : 'update',
      if (item != null) 'id': item['id'],
      if (item == null) 'accountId': accountId,
      'name': nameVal,
      'phase': phase,
      'billable': billable,
      'startDate': startVal,
      'endDate': endVal,
    });
  }

  Future<void> _assignForm(Map<String, dynamic> project) async {
    final resources = _list('resources');
    String? resourceId = resources.isNotEmpty ? resources.first['id']?.toString() : null;
    final capacityCtrl = TextEditingController(text: '100');
    final rateCtrl = TextEditingController(text: '0');
    bool billable = true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text('Assign to ${project['name'] ?? ''}'),
          content: SizedBox(
            width: MediaQuery.of(ctx).size.width,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: resourceId,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Resource'),
                    items: resources
                        .map((r) => DropdownMenuItem(value: r['id']?.toString(), child: Text(r['name']?.toString() ?? '')))
                        .toList(),
                    onChanged: (v) => setLocal(() => resourceId = v),
                  ),
                  TextField(
                    controller: capacityCtrl,
                    decoration: const InputDecoration(labelText: 'Capacity %'),
                    keyboardType: TextInputType.number,
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Billable'),
                    value: billable,
                    onChanged: (v) => setLocal(() => billable = v),
                  ),
                  TextField(
                    controller: rateCtrl,
                    decoration: const InputDecoration(labelText: 'Hourly rate'),
                    keyboardType: TextInputType.number,
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Assign')),
          ],
        ),
      ),
    );
    final cap = int.tryParse(capacityCtrl.text.trim()) ?? 100;
    final rate = double.tryParse(rateCtrl.text.trim()) ?? 0;
    capacityCtrl.dispose();
    rateCtrl.dispose();
    if (ok != true || resourceId == null) return;
    await _submit({
      'menu': 'projects',
      'action': 'assign',
      'projectId': project['id'],
      'resourceId': resourceId,
      'capacityPct': cap,
      'billable': billable,
      'hourlyRate': rate,
    });
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
    final items = _list('items');
    return Scaffold(
      floatingActionButton: canEdit
          ? FloatingActionButton(onPressed: () => _projectForm(), child: const Icon(Icons.add))
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: items.isEmpty
            ? ListView(
                children: const [Padding(padding: EdgeInsets.all(40), child: Center(child: Text('No projects')))],
              )
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  final p = items[i];
                  final assignments = ((p['assignments'] as List<dynamic>?) ?? [])
                      .map((e) => Map<String, dynamic>.from(e as Map))
                      .toList();
                  return Card(
                    child: Column(
                      children: [
                        ListTile(
                          title: Text(p['title']?.toString() ?? ''),
                          subtitle: Text(p['subtitle']?.toString() ?? ''),
                          trailing: canEdit
                              ? PopupMenuButton<String>(
                                  onSelected: (v) {
                                    if (v == 'edit') _projectForm(item: p);
                                    if (v == 'assign') _assignForm(p);
                                    if (v == 'delete') {
                                      _submit({'menu': 'projects', 'action': 'delete', 'id': p['id']});
                                    }
                                  },
                                  itemBuilder: (_) => const [
                                    PopupMenuItem(value: 'edit', child: Text('Edit')),
                                    PopupMenuItem(value: 'assign', child: Text('Assign resource')),
                                    PopupMenuItem(value: 'delete', child: Text('Deactivate')),
                                  ],
                                )
                              : null,
                        ),
                        if (assignments.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                            child: Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                for (final a in assignments)
                                  Chip(
                                    label: Text('${a['resourceName'] ?? ''} · ${a['capacityPct'] ?? 0}%'),
                                    onDeleted: canEdit
                                        ? () => _submit({
                                              'menu': 'projects',
                                              'action': 'unassign',
                                              'projectId': p['id'],
                                              'resourceId': a['resourceId'],
                                            })
                                        : null,
                                  ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}
