import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../reminder_alerts.dart';
import '../repository.dart';
import '../widgets/quill_notes_editor.dart';
import '../widgets/speech_mic_button.dart';

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
  String? myUserId;
  bool loading = true;
  bool busy = false;

  late QuillController notesController;
  late QuillController proposalController;
  late TextEditingController titleCtrl;
  late TextEditingController attendeesCtrl;
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
      final data = await repo.meetingNoteDetail(widget.noteId);
      final n = data['note'] as Map<String, dynamic>;
      Map<String, dynamic> p = {};
      try {
        p = await repo.meetingProviders();
      } catch (_) {}
      List<dynamic> projs = [];
      try {
        projs = await repo.projects();
      } catch (_) {}

      if (!mounted) return;
      notesController.document = quillDocumentFromHtml(n['rawNotes']?.toString());
      titleCtrl.text = n['title']?.toString() ?? '';
      attendeesCtrl.text = n['attendees']?.toString() ?? '';

      final proposal = n['proposal'] as Map<String, dynamic>?;
      if (proposal != null) {
        proposalTitleCtrl.text = proposal['title']?.toString() ?? '';
        proposalController.document = quillDocumentFromHtml(proposal['bodyHtml']?.toString());
      } else {
        proposalTitleCtrl.clear();
        proposalController.document = Document();
      }

      String? uid;
      try {
        final me = await repo.me();
        uid = (me['user'] as Map?)?['id']?.toString();
      } catch (_) {}
      setState(() {
        note = n;
        providers = p;
        projects = projs;
        myUserId = uid;
      });
      final reminders = (n['reminders'] as List<dynamic>?) ?? [];
      for (final raw in reminders) {
        if (raw is! Map) continue;
        final r = Map<String, dynamic>.from(raw);
        if (r['done'] == true) continue;
        if (uid != null && r['createdById']?.toString() != uid) continue;
        final due = DateTime.tryParse(r['dueAt']?.toString() ?? '');
        if (due == null || !due.isAfter(DateTime.now())) continue;
        await ReminderAlerts.instance.scheduleReminder(
          reminderId: r['id'].toString(),
          title: n['title']?.toString() ?? 'Meeting reminder',
          body: (r['note']?.toString().isNotEmpty == true) ? r['note'].toString() : 'Follow-up',
          dueAt: due,
          noteId: widget.noteId,
        );
      }
    } catch (e) {
      if (!mounted) return;
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
      final msg = res['queued'] == true ? 'Saved offline — will sync' : (res['message']?.toString() ?? 'Done');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
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
      () => repo.updateMeetingNote(
        widget.noteId,
        title: titleCtrl.text.trim(),
        attendees: attendeesCtrl.text.trim(),
        rawNotes: quillControllerToHtml(notesController),
        noteStatus: note?['noteStatus']?.toString(),
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
                    const SizedBox(height: 8),
                    TextField(controller: teamsUrl, decoration: const InputDecoration(labelText: 'Teams URL (optional)')),
                    const SizedBox(height: 8),
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
      () => repo.meetingAction(widget.noteId, 'events', {
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
    await _run(() => repo.meetingAction(widget.noteId, 'push-backlog', {'projectId': projectId}));
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
              const SizedBox(height: 12),
              Text(
                'ID: ${note!['functionalId'] ?? '—'} · Status: ${note!['noteStatus'] ?? 'todo'}\n'
                'Created: ${note!['createdAt']} · Updated: ${note!['updatedAt']}',
                style: TextStyle(color: Colors.blueGrey.shade700, fontSize: 12),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: (note!['noteStatus']?.toString() ?? 'todo'),
                decoration: const InputDecoration(labelText: 'Status'),
                items: const [
                  DropdownMenuItem(value: 'todo', child: Text('ToDo')),
                  DropdownMenuItem(value: 'in_progress', child: Text('In Progress')),
                  DropdownMenuItem(value: 'blocker', child: Text('Blocker')),
                  DropdownMenuItem(value: 'done', child: Text('Done')),
                ],
                onChanged: (v) => note!['noteStatus'] = v,
              ),
              const SizedBox(height: 12),
              TextField(controller: attendeesCtrl, decoration: const InputDecoration(labelText: 'Attendees')),
              const SizedBox(height: 12),
              if (note!['isOwner'] == false) ...[
                Text(
                  'Shared mode — raw notes are private to the creator. Work summary / proposal and later stages below.',
                  style: TextStyle(color: Colors.blueGrey.shade700, fontSize: 13),
                ),
              ] else ...[
                Row(
                  children: [
                    const Expanded(child: Text('Notes', style: TextStyle(fontWeight: FontWeight.w600))),
                    SpeechMicButton(onText: (t) => insertTextIntoQuill(notesController, t)),
                  ],
                ),
                QuillNotesEditor(controller: notesController, minHeight: 260),
                const SizedBox(height: 8),
                ElevatedButton(onPressed: busy ? null : _saveNotes, child: const Text('Save notes')),
              ],
              const SizedBox(height: 8),
              if (note!['isOwner'] == true && summary != null)
                OutlinedButton(
                  onPressed: busy
                      ? null
                      : () async {
                          final users = ((await repo.meetingNoteDetail(widget.noteId))['companyUsers'] as List?) ?? [];
                          final selected = <String>{
                            for (final s in ((note!['shares'] as List?) ?? []))
                              if (s is Map && s['userId'] != null) s['userId'].toString(),
                          };
                          if (!mounted) return;
                          final ok = await showDialog<bool>(
                            context: context,
                            builder: (ctx) => StatefulBuilder(
                              builder: (ctx, setLocal) => AlertDialog(
                                title: const Text('Share workflow'),
                                content: SizedBox(
                                  width: 360,
                                  child: users.isEmpty
                                      ? const Text('No other company users.')
                                      : ListView(
                                          shrinkWrap: true,
                                          children: [
                                            for (final raw in users)
                                              CheckboxListTile(
                                                dense: true,
                                                value: selected.contains((raw as Map)['id']?.toString()),
                                                title: Text('${raw['name']} (${raw['email']})'),
                                                onChanged: (v) {
                                                  setLocal(() {
                                                    final id = raw['id']?.toString() ?? '';
                                                    if (v == true) {
                                                      selected.add(id);
                                                    } else {
                                                      selected.remove(id);
                                                    }
                                                  });
                                                },
                                              ),
                                          ],
                                        ),
                                ),
                                actions: [
                                  TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                                  ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
                                ],
                              ),
                            ),
                          );
                          if (ok == true) {
                            await _run(
                              () => repo.meetingAction(widget.noteId, 'share', {'userIds': selected.toList()}),
                            );
                          }
                        },
                  child: const Text('Share workflow'),
                ),
              OutlinedButton(
                onPressed: busy
                    ? null
                    : () async {
                        final body = TextEditingController();
                        final ok = await showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: const Text('Add comment'),
                            content: TextField(
                              controller: body,
                              maxLines: 3,
                              decoration: const InputDecoration(hintText: 'Comment (@Name to mention)'),
                            ),
                            actions: [
                              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                              ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Post')),
                            ],
                          ),
                        );
                        if (ok == true) {
                          await _run(() => repo.meetingAction(widget.noteId, 'comment', {'body': body.text}));
                        }
                        body.dispose();
                      },
                child: const Text('Add comment'),
              ),
              OutlinedButton(
                onPressed: busy
                    ? null
                    : () async {
                        DateTime dueAt = DateTime.now().add(const Duration(hours: 1));
                        final noteText = TextEditingController();
                        final ok = await showDialog<bool>(
                          context: context,
                          builder: (ctx) => StatefulBuilder(
                            builder: (ctx, setLocal) => AlertDialog(
                              title: const Text('Add reminder'),
                              content: SingleChildScrollView(
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(
                                        'Date: ${dueAt.toLocal().toString().split(' ').first}',
                                      ),
                                      trailing: const Icon(Icons.calendar_today),
                                      onTap: () async {
                                        final d = await showDatePicker(
                                          context: ctx,
                                          initialDate: dueAt,
                                          firstDate: DateTime(2020),
                                          lastDate: DateTime(2100),
                                        );
                                        if (d != null) {
                                          setLocal(() {
                                            dueAt = DateTime(d.year, d.month, d.day, dueAt.hour, dueAt.minute);
                                          });
                                        }
                                      },
                                    ),
                                    ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(
                                        'Time: ${dueAt.hour.toString().padLeft(2, '0')}:${dueAt.minute.toString().padLeft(2, '0')}',
                                      ),
                                      trailing: const Icon(Icons.access_time),
                                      onTap: () async {
                                        final t = await showTimePicker(
                                          context: ctx,
                                          initialTime: TimeOfDay.fromDateTime(dueAt),
                                        );
                                        if (t != null) {
                                          setLocal(() {
                                            dueAt = DateTime(dueAt.year, dueAt.month, dueAt.day, t.hour, t.minute);
                                          });
                                        }
                                      },
                                    ),
                                    TextField(
                                      controller: noteText,
                                      decoration: const InputDecoration(labelText: 'Note'),
                                    ),
                                  ],
                                ),
                              ),
                              actions: [
                                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                                ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
                              ],
                            ),
                          ),
                        );
                        if (ok == true) {
                          final messenger = ScaffoldMessenger.of(context);
                          final res = await repo.meetingAction(widget.noteId, 'reminder', {
                            'dueAt': dueAt.toUtc().toIso8601String(),
                            'note': noteText.text.trim(),
                          });
                          final rem = res['reminder'] as Map?;
                          if (rem != null && rem['id'] != null) {
                            await ReminderAlerts.instance.scheduleReminder(
                              reminderId: rem['id'].toString(),
                              title: titleCtrl.text.trim().isEmpty ? 'Meeting reminder' : titleCtrl.text.trim(),
                              body: noteText.text.trim().isEmpty ? 'Follow-up' : noteText.text.trim(),
                              dueAt: dueAt,
                              noteId: widget.noteId,
                            );
                          }
                          if (mounted) {
                            final msg = res['queued'] == true
                                ? 'Saved offline — will sync'
                                : (res['message']?.toString() ?? 'Done');
                            messenger.showSnackBar(SnackBar(content: Text(msg)));
                            await _load();
                          }
                        }
                        noteText.dispose();
                      },
                child: const Text('Add reminder'),
              ),
              Builder(
                builder: (context) {
                  final reminders = (note?['reminders'] as List<dynamic>?) ?? [];
                  if (reminders.isEmpty) return const SizedBox.shrink();
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 12),
                      const Text('Reminders', style: TextStyle(fontWeight: FontWeight.w600)),
                      for (final raw in reminders)
                        Builder(
                          builder: (_) {
                            final r = Map<String, dynamic>.from(raw as Map);
                            final due = DateTime.tryParse(r['dueAt']?.toString() ?? '');
                            final done = r['done'] == true;
                            final overdue = !done && due != null && due.isBefore(DateTime.now());
                            return ListTile(
                              contentPadding: EdgeInsets.zero,
                              dense: true,
                              title: Text(r['note']?.toString().isNotEmpty == true ? r['note'].toString() : 'Follow-up'),
                              subtitle: Text(
                                '${due?.toLocal() ?? r['dueAt']}${done ? ' · done' : overdue ? ' · overdue' : ''}',
                                style: TextStyle(
                                  color: done
                                      ? Colors.blueGrey
                                      : overdue
                                          ? const Color(0xFFE11D48)
                                          : const Color(0xFFD97706),
                                  fontSize: 12,
                                ),
                              ),
                              trailing: done || (myUserId != null && r['createdById']?.toString() != myUserId)
                                  ? null
                                  : TextButton(
                                      onPressed: busy
                                          ? null
                                          : () async {
                                              await _run(
                                                () => repo.meetingAction(
                                                  widget.noteId,
                                                  'complete-reminder',
                                                  {'reminderId': r['id']},
                                                ),
                                              );
                                              await ReminderAlerts.instance.cancelReminder(r['id'].toString());
                                            },
                                      child: const Text('Done'),
                                    ),
                            );
                          },
                        ),
                    ],
                  );
                },
              ),
              const Divider(height: 32),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ElevatedButton(
                    onPressed: busy || note?['isOwner'] == false
                        ? null
                        : () => _run(() => repo.meetingAction(widget.noteId, 'summary')),
                    child: const Text('Generate summary'),
                  ),
                  ElevatedButton(
                    onPressed: busy || summary == null
                        ? null
                        : () => _run(() => repo.meetingAction(widget.noteId, 'proposal')),
                    child: const Text('Create proposal'),
                  ),
                  ElevatedButton(
                    onPressed: busy || proposal == null
                        ? null
                        : () => _run(() => repo.meetingAction(widget.noteId, 'frs')),
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
                const SizedBox(height: 8),
                QuillNotesEditor(controller: proposalController, minHeight: 160),
                ElevatedButton(
                  onPressed: busy
                      ? null
                      : () => _run(
                            () => repo.meetingAction(widget.noteId, 'save-proposal', {
                              'title': proposalTitleCtrl.text.trim(),
                              'bodyHtml': quillControllerToHtml(proposalController),
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
                      mainAxisSize: MainAxisSize.min,
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
