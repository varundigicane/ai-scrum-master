import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../widgets/quill_notes_field.dart';

class MeetingNoteDetailScreen extends StatefulWidget {
  const MeetingNoteDetailScreen({super.key, required this.api, required this.noteId});

  final ApiClient api;
  final String noteId;

  @override
  State<MeetingNoteDetailScreen> createState() => _MeetingNoteDetailScreenState();
}

class _MeetingNoteDetailScreenState extends State<MeetingNoteDetailScreen> {
  Map<String, dynamic>? note;
  Map<String, dynamic>? providers;
  List<dynamic> projects = [];
  String? error;
  bool loading = true;
  bool busy = false;

  late QuillController notesController;
  late TextEditingController titleCtrl;
  late TextEditingController attendeesCtrl;
  late QuillController proposalController;
  late TextEditingController proposalTitleCtrl;

  @override
  void initState() {
    super.initState();
    notesController = QuillController.basic();
    proposalController = QuillController.basic();
    titleCtrl = TextEditingController();
    attendeesCtrl = TextEditingController();
    proposalTitleCtrl = TextEditingController();
    _load();
  }

  @override
  void dispose() {
    notesController.dispose();
    proposalController.dispose();
    titleCtrl.dispose();
    attendeesCtrl.dispose();
    proposalTitleCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await widget.api.meetingNoteDetail(widget.noteId);
      final n = data['note'] as Map<String, dynamic>;
      final p = await widget.api.meetingProviders();
      List<dynamic> projs = [];
      try {
        projs = await widget.api.projects();
      } catch (_) {}

      notesController.dispose();
      notesController = quillFromPlainOrHtml(n['rawNotes']?.toString());
      titleCtrl.text = n['title']?.toString() ?? '';
      attendeesCtrl.text = n['attendees']?.toString() ?? '';

      final proposal = n['proposal'] as Map<String, dynamic>?;
      proposalController.dispose();
      if (proposal != null) {
        proposalTitleCtrl.text = proposal['title']?.toString() ?? '';
        proposalController = quillFromPlainOrHtml(proposal['bodyHtml']?.toString());
      } else {
        proposalTitleCtrl.clear();
        proposalController = QuillController.basic();
      }

      setState(() {
        note = n;
        providers = p;
        projects = projs;
      });
    } catch (e) {
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _run(Future<Map<String, dynamic>> Function() fn) async {
    setState(() => busy = true);
    try {
      final res = await fn();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res['message']?.toString() ?? 'Done')),
      );
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

  Future<void> _saveNotes() async {
    await _run(
      () => widget.api.updateMeetingNote(
        widget.noteId,
        title: titleCtrl.text.trim(),
        attendees: attendeesCtrl.text.trim(),
        rawNotes: quillToHtmlish(notesController),
      ),
    );
  }

  Future<void> _schedule() async {
    final title = TextEditingController(text: titleCtrl.text);
    final meetUrl = TextEditingController();
    final teamsUrl = TextEditingController();
    final room = TextEditingController();
    var date = DateTime.now();
    var startHour = 10;
    var startMinute = 0;
    var endHour = 11;
    var endMinute = 0;
    var timezone = 'Asia/Kolkata';
    var createMeet = providers?['google'] == true;
    var createTeams = providers?['teams'] == true;

    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
              ),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Schedule meeting', style: Theme.of(ctx).textTheme.titleLarge),
                    TextField(controller: title, decoration: const InputDecoration(labelText: 'Title')),
                    const SizedBox(height: 8),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('Date: ${date.toIso8601String().split('T').first}'),
                      trailing: const Icon(Icons.calendar_today),
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: ctx,
                          initialDate: date,
                          firstDate: DateTime(2020),
                          lastDate: DateTime(2100),
                        );
                        if (picked != null) setLocal(() => date = picked);
                      },
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: DropdownButtonFormField<int>(
                            value: startHour,
                            decoration: const InputDecoration(labelText: 'Start hour'),
                            items: List.generate(24, (i) => DropdownMenuItem(value: i, child: Text('$i'.padLeft(2, '0')))),
                            onChanged: (v) => setLocal(() => startHour = v ?? 10),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: DropdownButtonFormField<int>(
                            value: startMinute,
                            decoration: const InputDecoration(labelText: 'Start min'),
                            items: const [0, 15, 30, 45]
                                .map((m) => DropdownMenuItem(value: m, child: Text('$m'.padLeft(2, '0'))))
                                .toList(),
                            onChanged: (v) => setLocal(() => startMinute = v ?? 0),
                          ),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: DropdownButtonFormField<int>(
                            value: endHour,
                            decoration: const InputDecoration(labelText: 'End hour'),
                            items: List.generate(24, (i) => DropdownMenuItem(value: i, child: Text('$i'.padLeft(2, '0')))),
                            onChanged: (v) => setLocal(() => endHour = v ?? 11),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: DropdownButtonFormField<int>(
                            value: endMinute,
                            decoration: const InputDecoration(labelText: 'End min'),
                            items: const [0, 15, 30, 45]
                                .map((m) => DropdownMenuItem(value: m, child: Text('$m'.padLeft(2, '0'))))
                                .toList(),
                            onChanged: (v) => setLocal(() => endMinute = v ?? 0),
                          ),
                        ),
                      ],
                    ),
                    DropdownButtonFormField<String>(
                      value: timezone,
                      decoration: const InputDecoration(labelText: 'Timezone'),
                      items: const [
                        'Asia/Kolkata',
                        'UTC',
                        'America/New_York',
                        'Europe/London',
                        'Asia/Singapore',
                      ].map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                      onChanged: (v) => setLocal(() => timezone = v ?? 'Asia/Kolkata'),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Create Google Meet'),
                      subtitle: Text(providers?['google'] == true ? 'Configured' : 'Not configured'),
                      value: createMeet && providers?['google'] == true,
                      onChanged: providers?['google'] == true
                          ? (v) => setLocal(() => createMeet = v)
                          : null,
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Create Teams meeting'),
                      subtitle: Text(providers?['teams'] == true ? 'Configured' : 'Not configured'),
                      value: createTeams && providers?['teams'] == true,
                      onChanged: providers?['teams'] == true
                          ? (v) => setLocal(() => createTeams = v)
                          : null,
                    ),
                    TextField(controller: meetUrl, decoration: const InputDecoration(labelText: 'Meet URL (optional)')),
                    TextField(controller: teamsUrl, decoration: const InputDecoration(labelText: 'Teams URL (optional)')),
                    TextField(controller: room, decoration: const InputDecoration(labelText: 'Room (optional)')),
                    const SizedBox(height: 12),
                    ElevatedButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Save schedule'),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (ok != true) return;

    String pad(int n) => n.toString().padLeft(2, '0');
    final day = '${date.year}-${pad(date.month)}-${pad(date.day)}';
    final startsAt = '$day${'T'}${pad(startHour)}:${pad(startMinute)}:00';
    final endsAt = '$day${'T'}${pad(endHour)}:${pad(endMinute)}:00';

    await _run(
      () => widget.api.meetingAction(widget.noteId, 'events', {
        'title': title.text.trim(),
        'startsAt': startsAt,
        'endsAt': endsAt,
        'timezone': timezone,
        'attendees': attendeesCtrl.text.trim(),
        'createGoogleMeet': createMeet,
        'createTeamsMeeting': createTeams,
        'googleMeetUrl': meetUrl.text.trim(),
        'teamsJoinUrl': teamsUrl.text.trim(),
        'room': room.text.trim(),
      }),
    );
  }

  Future<void> _pushBacklog() async {
    String? projectId = projects.isNotEmpty ? (projects.first as Map)['id']?.toString() : null;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Push to backlog'),
        content: DropdownButtonFormField<String>(
          value: projectId,
          items: projects
              .map((p) {
                final m = p as Map<String, dynamic>;
                final label = '${m['accountName'] ?? m['account']?['name'] ?? ''} / ${m['name'] ?? ''}';
                return DropdownMenuItem(value: m['id']?.toString(), child: Text(label));
              })
              .toList(),
          onChanged: (v) => projectId = v,
          decoration: const InputDecoration(labelText: 'Project'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Push')),
        ],
      ),
    );
    if (ok != true || projectId == null) return;
    await _run(() => widget.api.meetingAction(widget.noteId, 'push-backlog', {'projectId': projectId}));
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Meeting note')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (error != null || note == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Meeting note')),
        body: Center(child: Text(error ?? 'Not found')),
      );
    }

    final summary = note!['summary'] as Map<String, dynamic>?;
    final proposal = note!['proposal'] as Map<String, dynamic>?;
    final requirements = (proposal?['requirements'] as List<dynamic>?) ?? [];
    final events = (note!['events'] as List<dynamic>?) ?? [];

    final steps = [
      ('Capture', note!['rawNotes']?.toString().trim().isNotEmpty == true),
      ('Summary', summary != null),
      ('Proposal', proposal != null),
      ('FRs', requirements.isNotEmpty),
      ('Backlog', false),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Meeting pipeline'),
        actions: [
          IconButton(onPressed: busy ? null : _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (var i = 0; i < steps.length; i++)
                    Chip(
                      avatar: Icon(
                        steps[i].$2 ? Icons.check_circle : Icons.radio_button_unchecked,
                        size: 18,
                        color: steps[i].$2 ? Colors.green : Colors.blueGrey,
                      ),
                      label: Text('${i + 1}. ${steps[i].$1}'),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Title')),
              TextField(controller: attendeesCtrl, decoration: const InputDecoration(labelText: 'Attendees')),
              const SizedBox(height: 8),
              const Text('Notes', style: TextStyle(fontWeight: FontWeight.w600)),
              QuillNotesField(controller: notesController),
              const SizedBox(height: 8),
              ElevatedButton(onPressed: busy ? null : _saveNotes, child: const Text('Save notes')),
              const Divider(height: 32),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ElevatedButton(
                    onPressed: busy ? null : () => _run(() => widget.api.meetingAction(widget.noteId, 'summary')),
                    child: const Text('Generate summary'),
                  ),
                  ElevatedButton(
                    onPressed: busy || summary == null
                        ? null
                        : () => _run(() => widget.api.meetingAction(widget.noteId, 'proposal')),
                    child: const Text('Create proposal'),
                  ),
                  ElevatedButton(
                    onPressed: busy || proposal == null
                        ? null
                        : () => _run(() => widget.api.meetingAction(widget.noteId, 'frs')),
                    child: const Text('Generate FRs'),
                  ),
                  ElevatedButton(
                    onPressed: busy || requirements.isEmpty ? null : _pushBacklog,
                    child: const Text('Push backlog'),
                  ),
                  OutlinedButton(onPressed: busy ? null : _schedule, child: const Text('Schedule')),
                ],
              ),
              if (summary != null) ...[
                const SizedBox(height: 16),
                const Text('Summary', style: TextStyle(fontWeight: FontWeight.w600)),
                Text(summary['summaryMd']?.toString() ?? ''),
              ],
              if (proposal != null) ...[
                const SizedBox(height: 16),
                const Text('Proposal', style: TextStyle(fontWeight: FontWeight.w600)),
                TextField(controller: proposalTitleCtrl, decoration: const InputDecoration(labelText: 'Proposal title')),
                QuillNotesField(controller: proposalController, minHeight: 120),
                ElevatedButton(
                  onPressed: busy
                      ? null
                      : () => _run(
                            () => widget.api.meetingAction(widget.noteId, 'save-proposal', {
                              'title': proposalTitleCtrl.text.trim(),
                              'bodyHtml': quillToHtmlish(proposalController),
                            }),
                          ),
                  child: const Text('Save proposal'),
                ),
              ],
              if (requirements.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text('FRs (${requirements.length})', style: const TextStyle(fontWeight: FontWeight.w600)),
                for (final r in requirements)
                  ListTile(
                    dense: true,
                    title: Text((r as Map)['title']?.toString() ?? ''),
                    subtitle: Text(r['description']?.toString() ?? ''),
                  ),
              ],
              const SizedBox(height: 16),
              const Text('Scheduled meetings', style: TextStyle(fontWeight: FontWeight.w600)),
              if (events.isEmpty) const Text('None yet.'),
              for (final e in events)
                Card(
                  child: ListTile(
                    title: Text((e as Map)['title']?.toString() ?? ''),
                    subtitle: Text(
                      '${e['startsAt']} → ${e['endsAt']}\n${e['timezone'] ?? ''}',
                    ),
                    isThreeLine: true,
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (e['googleMeetUrl'] != null)
                          TextButton(
                            onPressed: () => launchUrl(Uri.parse(e['googleMeetUrl'].toString())),
                            child: const Text('Meet'),
                          ),
                        if (e['teamsJoinUrl'] != null)
                          TextButton(
                            onPressed: () => launchUrl(Uri.parse(e['teamsJoinUrl'].toString())),
                            child: const Text('Teams'),
                          ),
                      ],
                    ),
                  ),
                ),
            ],
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
