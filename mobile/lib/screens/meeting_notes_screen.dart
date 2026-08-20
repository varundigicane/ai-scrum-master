import 'package:flutter/material.dart';

import '../api.dart';
import '../offline_store.dart';
import '../widgets/rich_notes_field.dart';
import '../widgets/speech_mic_button.dart';
import 'meeting_note_detail_screen.dart';

class MeetingNotesScreen extends StatefulWidget {
  const MeetingNotesScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<MeetingNotesScreen> createState() => _MeetingNotesScreenState();
}

class _MeetingNotesScreenState extends State<MeetingNotesScreen> {
  late Future<List<dynamic>> future;
  final searchCtrl = TextEditingController();
  String status = '';
  late final OfflineStore store;

  @override
  void initState() {
    super.initState();
    store = OfflineStore(widget.api);
    future = _fetch();
  }

  @override
  void dispose() {
    searchCtrl.dispose();
    super.dispose();
  }

  Future<List<dynamic>> _fetch() async {
    try {
      final notes = await widget.api.meetingNotes(q: searchCtrl.text.trim(), status: status);
      await store.putCache('meeting-notes', notes);
      await store.flush();
      return notes;
    } catch (_) {
      final cached = await store.getCache('meeting-notes');
      if (cached is List) return cached;
      rethrow;
    }
  }

  Future<void> refresh() async {
    setState(() => future = _fetch());
    await future;
  }

  Future<void> createNote() async {
    final titleCtrl = TextEditingController();
    final attendeesCtrl = TextEditingController();
    final notesCtrl = TextEditingController();
    String? templateKey;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('New meeting note'),
          content: SizedBox(
            width: 420,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: templateKey ?? '',
                    decoration: const InputDecoration(labelText: 'Template'),
                    items: const [
                      DropdownMenuItem(value: '', child: Text('Blank')),
                      DropdownMenuItem(value: 'standup', child: Text('Standup')),
                      DropdownMenuItem(value: 'discovery', child: Text('Discovery')),
                      DropdownMenuItem(value: 'retrospective', child: Text('Retrospective')),
                    ],
                    onChanged: (v) => setLocal(() => templateKey = v?.isEmpty == true ? null : v),
                  ),
                  const SizedBox(height: 12),
                  TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Title')),
                  const SizedBox(height: 12),
                  TextField(controller: attendeesCtrl, decoration: const InputDecoration(labelText: 'Attendees')),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Expanded(child: Text('Notes', style: TextStyle(fontWeight: FontWeight.w600))),
                      SpeechMicButton(onText: (t) => appendPlainToNotes(notesCtrl, t)),
                    ],
                  ),
                  RichNotesField(controller: notesCtrl, minHeight: 120),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    try {
      final created = await widget.api.createMeetingNote(
        title: titleCtrl.text.trim(),
        rawNotes: editableToHtmlish(notesCtrl.text),
        attendees: attendeesCtrl.text.trim(),
        templateKey: templateKey,
      );
      await refresh();
      final id = (created['note'] as Map?)?['id']?.toString();
      if (id != null && mounted) {
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => MeetingNoteDetailScreen(api: widget.api, noteId: id),
          ),
        );
        await refresh();
      }
    } catch (e) {
      await store.enqueue({
        'type': 'meeting_create',
        'title': titleCtrl.text.trim(),
        'rawNotes': editableToHtmlish(notesCtrl.text),
        'attendees': attendeesCtrl.text.trim(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Queued offline. ${e.toString().replaceFirst('Exception: ', '')}')),
      );
    } finally {
      notesCtrl.dispose();
      titleCtrl.dispose();
      attendeesCtrl.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: createNote,
        child: const Icon(Icons.add),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: searchCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Search title / ID / body',
                      prefixIcon: Icon(Icons.search),
                    ),
                    onSubmitted: (_) => refresh(),
                  ),
                ),
                const SizedBox(width: 8),
                DropdownButton<String>(
                  value: status,
                  items: const [
                    DropdownMenuItem(value: '', child: Text('All')),
                    DropdownMenuItem(value: 'todo', child: Text('ToDo')),
                    DropdownMenuItem(value: 'in_progress', child: Text('In Progress')),
                    DropdownMenuItem(value: 'blocker', child: Text('Blocker')),
                    DropdownMenuItem(value: 'done', child: Text('Done')),
                  ],
                  onChanged: (v) {
                    status = v ?? '';
                    refresh();
                  },
                ),
              ],
            ),
          ),
          Expanded(
            child: FutureBuilder<List<dynamic>>(
              future: future,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snap.hasError) {
                  return Center(child: Text(snap.error.toString().replaceFirst('Exception: ', '')));
                }
                final items = snap.data ?? [];
                if (items.isEmpty) {
                  return const Center(child: Text('No meeting notes yet. Tap + to add one.'));
                }
                return RefreshIndicator(
                  onRefresh: refresh,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, i) {
                      final n = items[i] as Map<String, dynamic>;
                      final hasSummary = n['summary'] != null;
                      final fid = n['functionalId']?.toString();
                      return Card(
                        child: ListTile(
                          title: Text(
                            '${fid != null && fid.isNotEmpty ? '$fid · ' : ''}${n['title'] ?? ''}',
                          ),
                          subtitle: Text(
                            'Status: ${n['noteStatus'] ?? 'todo'} · Summary: ${hasSummary ? 'Yes' : 'No'}\n'
                            'Created: ${n['createdAt'] ?? '—'} · Updated: ${n['updatedAt'] ?? '—'}',
                          ),
                          isThreeLine: true,
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () async {
                            await Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => MeetingNoteDetailScreen(
                                  api: widget.api,
                                  noteId: n['id'].toString(),
                                ),
                              ),
                            );
                            await refresh();
                          },
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
