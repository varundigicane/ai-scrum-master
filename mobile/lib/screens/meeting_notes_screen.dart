import 'package:flutter/material.dart';

import '../api.dart';
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

  @override
  void initState() {
    super.initState();
    future = widget.api.meetingNotes();
  }

  Future<void> refresh() async {
    setState(() => future = widget.api.meetingNotes());
    await future;
  }

  Future<void> createNote() async {
    final titleCtrl = TextEditingController();
    final attendeesCtrl = TextEditingController();
    final notesCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New meeting note'),
        content: SizedBox(
          width: 420,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
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
    );
    if (ok != true) return;
    try {
      final created = await widget.api.createMeetingNote(
        title: titleCtrl.text.trim(),
        rawNotes: editableToHtmlish(notesCtrl.text),
        attendees: attendeesCtrl.text.trim(),
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
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
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
      body: FutureBuilder<List<dynamic>>(
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
                final hasProposal = n['proposal'] != null;
                return Card(
                  child: ListTile(
                    title: Text(n['title']?.toString() ?? ''),
                    subtitle: Text(
                      'Summary: ${hasSummary ? 'Yes' : 'No'} · Proposal: ${hasProposal ? 'Yes' : 'No'}',
                    ),
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
    );
  }
}
