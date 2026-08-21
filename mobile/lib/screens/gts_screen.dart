import 'package:flutter/material.dart';
import '../api.dart';
import '../repository.dart';

class GtsScreen extends StatefulWidget {
  const GtsScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<GtsScreen> createState() => _GtsScreenState();
}

class _GtsScreenState extends State<GtsScreen> {
  late int year;
  late int month;
  String? accountId;
  Map<String, dynamic>? data;
  String? error;
  bool loading = true;
  bool busy = false;

  final projectNameCtrl = TextEditingController();
  final pmCtrl = TextEditingController();
  final techCtrl = TextEditingController();
  final domainCtrl = TextEditingController();
  final utilCtrl = TextEditingController();
  final availCtrl = TextEditingController();
  final remarksCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    year = now.year;
    month = now.month;
    _load();
  }

  @override
  void dispose() {
    projectNameCtrl.dispose();
    pmCtrl.dispose();
    techCtrl.dispose();
    domainCtrl.dispose();
    utilCtrl.dispose();
    availCtrl.dispose();
    remarksCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final res = await repo.gts(accountId: accountId, year: year, month: month);
      final report = res['report'] as Map<String, dynamic>?;
      projectNameCtrl.text = report?['projectName']?.toString() ?? '';
      pmCtrl.text = report?['projectManagers']?.toString() ?? '';
      techCtrl.text = report?['technology']?.toString() ?? '';
      domainCtrl.text = report?['domain']?.toString() ?? '';
      utilCtrl.text = report?['utilizationPct']?.toString() ?? '';
      availCtrl.text = report?['availabilityPct']?.toString() ?? '';
      remarksCtrl.text = report?['remarks']?.toString() ?? '';
      setState(() => data = res);
    } catch (e) {
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _generate() async {
    if (accountId == null || accountId!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select an account')));
      return;
    }
    setState(() => busy = true);
    try {
      final res = await repo.gtsAction({
        'action': 'generate',
        'accountId': accountId,
        'year': year,
        'month': month,
        'replaceLines': true,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res['message']?.toString() ?? 'Done')));
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _saveHeader() async {
    final report = data?['report'] as Map<String, dynamic>?;
    if (report == null) return;
    setState(() => busy = true);
    try {
      final res = await repo.gtsAction({
        'action': 'save-header',
        'reportId': report['id'],
        'projectName': projectNameCtrl.text.trim(),
        'projectManagers': pmCtrl.text.trim(),
        'technology': techCtrl.text.trim(),
        'domain': domainCtrl.text.trim(),
        'utilizationPct': double.tryParse(utilCtrl.text.trim()) ?? 0,
        'availabilityPct': double.tryParse(availCtrl.text.trim()) ?? 0,
        'remarks': remarksCtrl.text.trim(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res['message']?.toString() ?? 'Saved')));
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final accounts = (data?['accounts'] as List<dynamic>?) ?? [];
    final report = data?['report'] as Map<String, dynamic>?;
    final lines = (report?['lines'] as List<dynamic>?) ?? [];
    final canEdit = data?['canEdit'] == true;

    return Scaffold(
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: Text(error!))
              : Stack(
                  children: [
                    RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          DropdownButtonFormField<String>(
                            value: accountId ?? '',
                            decoration: const InputDecoration(labelText: 'Account'),
                            items: [
                              const DropdownMenuItem(value: '', child: Text('Select account')),
                              ...accounts.map((a) {
                                final m = a as Map<String, dynamic>;
                                return DropdownMenuItem(
                                  value: m['id']?.toString() ?? '',
                                  child: Text(m['name']?.toString() ?? ''),
                                );
                              }),
                            ],
                            onChanged: (v) {
                              accountId = (v == null || v.isEmpty) ? null : v;
                              _load();
                            },
                          ),
                          Row(
                            children: [
                              Expanded(
                                child: DropdownButtonFormField<int>(
                                  value: month,
                                  decoration: const InputDecoration(labelText: 'Month'),
                                  items: List.generate(
                                    12,
                                    (i) => DropdownMenuItem(value: i + 1, child: Text('${i + 1}')),
                                  ),
                                  onChanged: (v) {
                                    if (v == null) return;
                                    month = v;
                                    _load();
                                  },
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: TextFormField(
                                  initialValue: '$year',
                                  decoration: const InputDecoration(labelText: 'Year'),
                                  keyboardType: TextInputType.number,
                                  onFieldSubmitted: (v) {
                                    year = int.tryParse(v) ?? year;
                                    _load();
                                  },
                                ),
                              ),
                            ],
                          ),
                          if (canEdit) ...[
                            const SizedBox(height: 12),
                            ElevatedButton(
                              onPressed: busy ? null : _generate,
                              child: const Text('Generate / refresh month'),
                            ),
                          ],
                          if (report != null) ...[
                            const Divider(height: 32),
                            TextField(controller: projectNameCtrl, decoration: const InputDecoration(labelText: 'Project name'), enabled: canEdit),
                            TextField(controller: pmCtrl, decoration: const InputDecoration(labelText: 'Project managers'), enabled: canEdit),
                            TextField(controller: techCtrl, decoration: const InputDecoration(labelText: 'Technology'), enabled: canEdit),
                            TextField(controller: domainCtrl, decoration: const InputDecoration(labelText: 'Domain'), enabled: canEdit),
                            TextField(controller: utilCtrl, decoration: const InputDecoration(labelText: 'Utilization %'), enabled: canEdit),
                            TextField(controller: availCtrl, decoration: const InputDecoration(labelText: 'Availability %'), enabled: canEdit),
                            TextField(controller: remarksCtrl, decoration: const InputDecoration(labelText: 'Remarks'), enabled: canEdit),
                            if (canEdit)
                              ElevatedButton(onPressed: busy ? null : _saveHeader, child: const Text('Save header')),
                            const SizedBox(height: 12),
                            Text('Lines (${lines.length})', style: Theme.of(context).textTheme.titleMedium),
                            for (final line in lines)
                              ListTile(
                                title: Text((line as Map)['subProjectName']?.toString() ?? ''),
                                subtitle: Text(
                                  '${line['featureName'] ?? ''} · UAT ${line['uatDefects'] ?? 0} · ${line['actualEffortHrs'] ?? 0}h',
                                ),
                              ),
                          ] else if (accountId != null)
                            const Padding(
                              padding: EdgeInsets.only(top: 24),
                              child: Text('No report for this month yet. Generate one to start.'),
                            ),
                        ],
                      ),
                    ),
                    if (busy)
                      Container(
                        color: Colors.black26,
                        child: const Center(child: CircularProgressIndicator()),
                      ),
                  ],
                ),
    );
  }
}
