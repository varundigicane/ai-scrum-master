import 'package:flutter/material.dart';
import '../api.dart';

class AgentScreen extends StatefulWidget {
  const AgentScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<AgentScreen> createState() => _AgentScreenState();
}

class _AgentScreenState extends State<AgentScreen> {
  Map<String, dynamic>? data;
  String? error;
  bool loading = true;
  String? runningJob;

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
      final res = await widget.api.agentJobs();
      setState(() => data = res);
    } catch (e) {
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _run(String job) async {
    setState(() => runningJob = job);
    try {
      final res = await widget.api.runAgentJob(job);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res['message']?.toString() ?? 'Done')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => runningJob = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final jobs = (data?['jobs'] as List<dynamic>?) ?? [];
    final canRun = data?['canRun'] == true;

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
                      Text(
                        canRun
                            ? 'Manual triggers for status chase and reports.'
                            : 'You can view jobs but need Run agent permission to execute them.',
                        style: TextStyle(color: Colors.blueGrey.shade700),
                      ),
                      const SizedBox(height: 12),
                      for (final j in jobs)
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  (j as Map)['title']?.toString() ?? '',
                                  style: const TextStyle(fontWeight: FontWeight.w600),
                                ),
                                const SizedBox(height: 4),
                                Text(j['desc']?.toString() ?? ''),
                                const SizedBox(height: 8),
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: ElevatedButton(
                                    onPressed: !canRun || runningJob != null
                                        ? null
                                        : () => _run(j['job'].toString()),
                                    child: runningJob == j['job']
                                        ? const SizedBox(
                                            width: 18,
                                            height: 18,
                                            child: CircularProgressIndicator(strokeWidth: 2),
                                          )
                                        : const Text('Run now'),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
    );
  }
}
