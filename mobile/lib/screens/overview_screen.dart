import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../overview_palette.dart';

class OverviewScreen extends StatelessWidget {
  const OverviewScreen({
    super.key,
    required this.me,
    required this.onRefresh,
    this.onOpenNote,
  });

  final Map<String, dynamic>? me;
  final Future<void> Function() onRefresh;
  final void Function(String noteId)? onOpenNote;

  List<Map<String, dynamic>> _slices(Map<String, dynamic>? charts, String key) {
    final raw = charts?[key];
    if (raw is! List) return [];
    return raw.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  int _sum(List<Map<String, dynamic>> rows) =>
      rows.fold<int>(0, (a, r) => a + ((r['value'] as num?)?.toInt() ?? 0));

  @override
  Widget build(BuildContext context) {
    final kpis = (me?['kpis'] as Map<String, dynamic>?) ?? {};
    final charts = me?['charts'] as Map<String, dynamic>?;
    final rem = charts?['reminders'] as Map<String, dynamic>?;
    final remItems = ((rem?['items'] as List<dynamic>?) ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    final cards = [
      ('Accounts', kpis['accounts']),
      ('Projects', kpis['projects']),
      ('Resources', kpis['resources']),
      ('Due soon', kpis['dueSoonReminders'] ?? rem?['dueSoon']),
      ('Overdue reminders', kpis['overdueReminders'] ?? rem?['overdue']),
      ('Pending status', kpis['pendingStatus']),
      ('Overdue tasks', kpis['overdueTasks']),
      ('Open defects', kpis['openDefects']),
    ];

    final rag = _slices(charts, 'rag');
    final severity = _slices(charts, 'defectSeverity');
    final phases = _slices(charts, 'phases');
    final taskStatus = _slices(charts, 'taskStatus');
    final statusToday = _slices(charts, 'statusToday');

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 600;
          final kpiCross = wide ? 4 : 2;
          final chartCross = wide ? 2 : 1;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text('Company matrix', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Text(
                'Delivery health — pull to refresh.',
                style: TextStyle(color: Colors.blueGrey.shade600),
              ),
              const SizedBox(height: 16),
              GridView.count(
                crossAxisCount: kpiCross,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: wide ? 1.6 : 1.35,
                children: [
                  for (final c in cards)
                    _KpiCard(
                      label: c.$1,
                      value: c.$2,
                      color: OverviewPalette.kpiTone(c.$1, (c.$2 is num) ? c.$2 as num : 0),
                    ),
                ],
              ),
              if (remItems.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text('Due & overdue', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                const SizedBox(height: 8),
                for (final item in remItems)
                  Card(
                    child: ListTile(
                      title: Text(item['noteTitle']?.toString() ?? ''),
                      subtitle: Text(
                        '${item['kind'] ?? 'reminder'} · ${item['note'] ?? ''}\n'
                        '${item['dueAt'] != null ? DateTime.tryParse(item['dueAt'].toString())?.toLocal() : ''}',
                      ),
                      isThreeLine: true,
                      leading: Icon(
                        item['overdue'] == true ? Icons.warning_amber : Icons.schedule,
                        color: item['overdue'] == true ? OverviewPalette.danger : OverviewPalette.warn,
                      ),
                      onTap: () {
                        final id = item['noteId']?.toString() ?? '';
                        if (id.isNotEmpty) onOpenNote?.call(id);
                      },
                    ),
                  ),
              ],
              const SizedBox(height: 16),
              GridView.count(
                crossAxisCount: chartCross,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: wide ? 1.15 : 1.05,
                children: [
                  _ChartCard(
                    title: 'Project RAG',
                    child: _PieChart(rows: rag, colors: OverviewPalette.rag),
                  ),
                  _ChartCard(
                    title: 'Defects by severity',
                    child: _PieChart(rows: severity, colors: OverviewPalette.severity),
                  ),
                  _ChartCard(
                    title: 'Projects by phase',
                    child: _BarChart(rows: phases, colors: OverviewPalette.phase, horizontal: true),
                  ),
                  _ChartCard(
                    title: 'Task status',
                    child: _BarChart(rows: taskStatus, colors: OverviewPalette.taskStatus, horizontal: false),
                  ),
                  _ChartCard(
                    title: 'Status today',
                    child: _BarChart(rows: statusToday, colors: OverviewPalette.statusState, horizontal: false),
                  ),
                ],
              ),
              if (charts == null ||
                  (_sum(rag) == 0 &&
                      _sum(severity) == 0 &&
                      _sum(phases) == 0 &&
                      _sum(taskStatus) == 0 &&
                      _sum(statusToday) == 0))
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'Charts populate after data sync. Open other menus online once, then Overview works offline.',
                    style: TextStyle(color: Colors.blueGrey.shade600, fontSize: 12),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({required this.label, required this.value, required this.color});

  final String label;
  final Object? value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Container(
        decoration: BoxDecoration(
          border: Border(left: BorderSide(color: color, width: 4)),
          borderRadius: BorderRadius.circular(14),
        ),
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(color: Colors.blueGrey.shade600, fontSize: 12)),
            const Spacer(),
            Text(
              '${value ?? '—'}',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: color),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChartCard extends StatelessWidget {
  const _ChartCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Expanded(child: child),
          ],
        ),
      ),
    );
  }
}

class _PieChart extends StatelessWidget {
  const _PieChart({required this.rows, required this.colors});

  final List<Map<String, dynamic>> rows;
  final Map<String, Color> colors;

  @override
  Widget build(BuildContext context) {
    final nonzero = rows.where((r) => ((r['value'] as num?)?.toDouble() ?? 0) > 0).toList();
    if (nonzero.isEmpty) {
      return const Center(child: Text('No data yet', style: TextStyle(color: OverviewPalette.muted, fontSize: 12)));
    }
    return PieChart(
      PieChartData(
        sectionsSpace: 2,
        centerSpaceRadius: 28,
        sections: [
          for (final r in nonzero)
            PieChartSectionData(
              value: (r['value'] as num).toDouble(),
              title: '${r['value']}',
              color: colors[r['name']?.toString()] ?? OverviewPalette.muted,
              radius: 42,
              titleStyle: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
            ),
        ],
      ),
    );
  }
}

class _BarChart extends StatelessWidget {
  const _BarChart({required this.rows, required this.colors, required this.horizontal});

  final List<Map<String, dynamic>> rows;
  final Map<String, Color> colors;
  final bool horizontal;

  @override
  Widget build(BuildContext context) {
    final maxY = rows.fold<double>(0, (a, r) {
      final v = (r['value'] as num?)?.toDouble() ?? 0;
      return v > a ? v : a;
    });
    if (maxY <= 0) {
      return const Center(child: Text('No data yet', style: TextStyle(color: OverviewPalette.muted, fontSize: 12)));
    }

    if (horizontal) {
      return BarChart(
        BarChartData(
          alignment: BarChartAlignment.spaceAround,
          maxY: maxY * 1.15,
          barTouchData: const BarTouchData(enabled: true),
          titlesData: FlTitlesData(
            leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 28,
                getTitlesWidget: (v, _) {
                  final i = v.toInt();
                  if (i < 0 || i >= rows.length) return const SizedBox.shrink();
                  final name = rows[i]['name']?.toString() ?? '';
                  final short = name.length > 4 ? name.substring(0, 4) : name;
                  return Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(short, style: const TextStyle(fontSize: 9, color: OverviewPalette.muted)),
                  );
                },
              ),
            ),
          ),
          gridData: const FlGridData(show: false),
          borderData: FlBorderData(show: false),
          barGroups: [
            for (var i = 0; i < rows.length; i++)
              BarChartGroupData(
                x: i,
                barRods: [
                  BarChartRodData(
                    toY: (rows[i]['value'] as num?)?.toDouble() ?? 0,
                    color: colors[rows[i]['name']?.toString()] ?? OverviewPalette.accent,
                    width: 14,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                  ),
                ],
              ),
          ],
        ),
      );
    }

    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceAround,
        maxY: maxY * 1.15,
        titlesData: FlTitlesData(
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 28,
              getTitlesWidget: (v, _) => Text(
                v.toInt().toString(),
                style: const TextStyle(fontSize: 9, color: OverviewPalette.muted),
              ),
            ),
          ),
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 28,
              getTitlesWidget: (v, _) {
                final i = v.toInt();
                if (i < 0 || i >= rows.length) return const SizedBox.shrink();
                final name = (rows[i]['name']?.toString() ?? '').replaceAll('_', ' ');
                final short = name.length > 6 ? '${name.substring(0, 5)}…' : name;
                return Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(short, style: const TextStyle(fontSize: 9, color: OverviewPalette.muted)),
                );
              },
            ),
          ),
        ),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) => FlLine(color: Colors.blueGrey.shade100, strokeWidth: 1),
        ),
        borderData: FlBorderData(show: false),
        barGroups: [
          for (var i = 0; i < rows.length; i++)
            BarChartGroupData(
              x: i,
              barRods: [
                BarChartRodData(
                  toY: (rows[i]['value'] as num?)?.toDouble() ?? 0,
                  color: colors[rows[i]['name']?.toString()] ?? OverviewPalette.accent,
                  width: 16,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
