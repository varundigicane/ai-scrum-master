import 'package:flutter/material.dart';

class OverviewScreen extends StatelessWidget {
  const OverviewScreen({super.key, required this.me, required this.onRefresh});

  final Map<String, dynamic>? me;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final kpis = (me?['kpis'] as Map<String, dynamic>?) ?? {};
    final cards = [
      ('Accounts', kpis['accounts']),
      ('Projects', kpis['projects']),
      ('Resources', kpis['resources']),
      ('Pending status', kpis['pendingStatus']),
      ('Overdue tasks', kpis['overdueTasks']),
    ];

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Company matrix', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text('Tap Menu (top-left) to open the collapsible drawer.', style: TextStyle(color: Colors.blueGrey.shade600)),
          const SizedBox(height: 16),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              for (final c in cards)
                SizedBox(
                  width: 160,
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(c.$1, style: TextStyle(color: Colors.blueGrey.shade600, fontSize: 12)),
                          const SizedBox(height: 8),
                          Text('${c.$2 ?? '—'}', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
