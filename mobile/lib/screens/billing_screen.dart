import 'package:flutter/material.dart';
import '../api.dart';

class BillingScreen extends StatefulWidget {
  const BillingScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<BillingScreen> createState() => _BillingScreenState();
}

class _BillingScreenState extends State<BillingScreen> {
  late int year;
  late int month;
  Map<String, dynamic>? data;
  String? error;
  bool loading = true;
  final yearCtrl = TextEditingController();
  final daysCtrl = TextEditingController();
  final noteCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    year = now.year;
    month = now.month;
    yearCtrl.text = '$year';
    _load();
  }

  @override
  void dispose() {
    yearCtrl.dispose();
    daysCtrl.dispose();
    noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final res = await widget.api.billing(year: year, month: month);
      final override = res['override'] as Map<String, dynamic>?;
      daysCtrl.text = override?['totalWorkingDays']?.toString() ?? '';
      noteCtrl.text = override?['note']?.toString() ?? '';
      yearCtrl.text = '$year';
      setState(() => data = res);
    } catch (e) {
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _saveOverride() async {
    try {
      final days = int.tryParse(daysCtrl.text.trim());
      if (days == null) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter total working days')));
        return;
      }
      final res = await widget.api.saveBillingOverride(
        year: year,
        month: month,
        totalWorkingDays: days,
        note: noteCtrl.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res['message']?.toString() ?? 'Saved')));
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  String money(dynamic n) {
    final v = (n is num) ? n.toDouble() : double.tryParse('$n') ?? 0;
    return v.toStringAsFixed(2);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: Text(error!))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: yearCtrl,
                              decoration: const InputDecoration(labelText: 'Year'),
                              keyboardType: TextInputType.number,
                              onSubmitted: (v) {
                                year = int.tryParse(v) ?? year;
                                _load();
                              },
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: DropdownButtonFormField<int>(
                              initialValue: month,
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
                        ],
                      ),
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          onPressed: () {
                            year = int.tryParse(yearCtrl.text.trim()) ?? year;
                            _load();
                          },
                          icon: const Icon(Icons.refresh),
                          label: const Text('View month'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Card(
                        child: ListTile(
                          title: const Text('Grand total'),
                          trailing: Text(
                            money(data?['grandTotal']),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text('By account', style: Theme.of(context).textTheme.titleMedium),
                      for (final a in (data?['byAccount'] as List<dynamic>? ?? []))
                        ListTile(
                          title: Text((a as Map)['accountName']?.toString() ?? ''),
                          trailing: Text(money(a['totalBilling'])),
                        ),
                      Text('By project', style: Theme.of(context).textTheme.titleMedium),
                      for (final p in (data?['byProject'] as List<dynamic>? ?? []))
                        ListTile(
                          title: Text((p as Map)['projectName']?.toString() ?? ''),
                          subtitle: Text(p['accountName']?.toString() ?? ''),
                          trailing: Text(money(p['totalBilling'])),
                        ),
                      Text('By resource', style: Theme.of(context).textTheme.titleMedium),
                      for (final r in (data?['byResource'] as List<dynamic>? ?? []))
                        ListTile(
                          title: Text((r as Map)['resourceName']?.toString() ?? ''),
                          subtitle: Text(r['employeeId']?.toString() ?? ''),
                          trailing: Text(money(r['totalBilling'])),
                        ),
                      if (data?['canEdit'] == true) ...[
                        const Divider(),
                        Text('Working days override', style: Theme.of(context).textTheme.titleMedium),
                        TextField(
                          controller: daysCtrl,
                          decoration: const InputDecoration(labelText: 'Total working days'),
                          keyboardType: TextInputType.number,
                        ),
                        TextField(controller: noteCtrl, decoration: const InputDecoration(labelText: 'Note')),
                        const SizedBox(height: 8),
                        ElevatedButton(onPressed: _saveOverride, child: const Text('Save override')),
                      ],
                    ],
                  ),
                ),
    );
  }
}
