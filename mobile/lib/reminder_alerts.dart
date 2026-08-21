import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'api.dart';
import 'db/local_db.dart';
import 'repository.dart';
import 'screens/meeting_note_detail_screen.dart';

/// Local notifications + due/overdue popup queue (no FCM cost).
class ReminderAlerts {
  ReminderAlerts._();
  static final ReminderAlerts instance = ReminderAlerts._();

  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;
  bool _showing = false;

  Future<void> init() async {
    if (_ready) return;
    tzdata.initializeTimeZones();
    try {
      final info = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(info.identifier));
    } catch (_) {
      tz.setLocalLocation(tz.getLocation('Asia/Kolkata'));
    }

    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings();
    await _plugin.initialize(
      settings: const InitializationSettings(android: android, iOS: ios),
      onDidReceiveNotificationResponse: (_) {},
    );

    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();

    _ready = true;
  }

  int _notifId(String reminderId) => reminderId.hashCode & 0x7fffffff;

  Future<void> scheduleReminder({
    required String reminderId,
    required String title,
    required String body,
    required DateTime dueAt,
    required String noteId,
  }) async {
    await init();
    if (dueAt.isBefore(DateTime.now())) return;
    final when = tz.TZDateTime.from(dueAt.toLocal(), tz.local);
    await _plugin.zonedSchedule(
      id: _notifId(reminderId),
      title: title,
      body: body,
      scheduledDate: when,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'meeting_reminders',
          'Meeting reminders',
          channelDescription: 'Due follow-ups on meeting notes',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      payload: jsonEncode({'noteId': noteId, 'reminderId': reminderId}),
    );
    await _cacheReminder({
      'id': reminderId,
      'noteId': noteId,
      'noteTitle': title,
      'dueAt': dueAt.toIso8601String(),
      'note': body,
      'done': false,
    });
  }

  Future<void> cancelReminder(String reminderId) async {
    await init();
    await _plugin.cancel(id: _notifId(reminderId));
  }

  Future<void> _cacheReminder(Map<String, dynamic> item) async {
    final existing = await LocalDb.instance.getCache('due-reminders');
    final list = <Map<String, dynamic>>[];
    if (existing is List) {
      for (final e in existing) {
        if (e is Map) list.add(Map<String, dynamic>.from(e));
      }
    }
    list.removeWhere((e) => e['id'] == item['id']);
    list.add(item);
    await LocalDb.instance.putCache('due-reminders', list);
  }

  Future<void> _removeCached(String reminderId) async {
    final existing = await LocalDb.instance.getCache('due-reminders');
    if (existing is! List) return;
    final list = existing
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((e) => e['id'] != reminderId)
        .toList();
    await LocalDb.instance.putCache('due-reminders', list);
  }

  /// Merge overview reminder items into local cache for offline popup.
  Future<void> syncFromOverview(List<dynamic>? items) async {
    if (items == null) return;
    final list = <Map<String, dynamic>>[];
    for (final raw in items) {
      if (raw is! Map) continue;
      final m = Map<String, dynamic>.from(raw);
      if (m['kind'] != null && m['kind'] != 'reminder') continue;
      list.add({
        'id': m['id'],
        'noteId': m['noteId'],
        'noteTitle': m['noteTitle'],
        'dueAt': m['dueAt'],
        'note': m['note'],
        'done': false,
      });
      final due = DateTime.tryParse(m['dueAt']?.toString() ?? '');
      if (due != null && due.isAfter(DateTime.now())) {
        await scheduleReminder(
          reminderId: m['id'].toString(),
          title: m['noteTitle']?.toString() ?? 'Reminder',
          body: m['note']?.toString() ?? 'Follow-up',
          dueAt: due,
          noteId: m['noteId']?.toString() ?? '',
        );
      }
    }
    await LocalDb.instance.putCache('due-reminders', list);
  }

  Future<List<Map<String, dynamic>>> dueOrOverdue() async {
    final now = DateTime.now();
    final fromMe = <Map<String, dynamic>>[];
    try {
      final me = await repo.me();
      final charts = me['charts'] as Map<String, dynamic>?;
      final rem = charts?['reminders'] as Map<String, dynamic>?;
      final items = rem?['items'] as List<dynamic>?;
      if (items != null) {
        for (final raw in items) {
          if (raw is! Map) continue;
          final m = Map<String, dynamic>.from(raw);
          if (m['kind'] != null && m['kind'] != 'reminder') continue;
          final due = DateTime.tryParse(m['dueAt']?.toString() ?? '');
          if (due == null) continue;
          if (!due.isAfter(now)) {
            fromMe.add({
              'id': m['id'],
              'noteId': m['noteId'],
              'noteTitle': m['noteTitle'],
              'dueAt': m['dueAt'],
              'note': m['note'],
            });
          }
        }
      }
      await syncFromOverview(items);
    } catch (_) {}

    if (fromMe.isNotEmpty) return fromMe;

    final cached = await LocalDb.instance.getCache('due-reminders');
    if (cached is! List) return [];
    final out = <Map<String, dynamic>>[];
    for (final e in cached) {
      if (e is! Map) continue;
      final m = Map<String, dynamic>.from(e);
      if (m['done'] == true) continue;
      final due = DateTime.tryParse(m['dueAt']?.toString() ?? '');
      if (due == null) continue;
      if (!due.isAfter(now)) out.add(m);
    }
    return out;
  }

  Future<void> showDuePopups(BuildContext context, {ApiClient? api}) async {
    if (_showing || !context.mounted) return;
    final due = await dueOrOverdue();
    if (due.isEmpty || !context.mounted) return;
    _showing = true;
    try {
      for (final item in due) {
        if (!context.mounted) break;
        await showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (ctx) {
            final dueAt = DateTime.tryParse(item['dueAt']?.toString() ?? '');
            return PopScope(
              canPop: false,
              child: AlertDialog(
                title: Text(item['overdue'] == true || (dueAt?.isBefore(DateTime.now()) ?? false)
                    ? 'Overdue reminder'
                    : 'Reminder due'),
                content: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item['noteTitle']?.toString() ?? 'Meeting note',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    Text(item['note']?.toString() ?? 'Follow-up'),
                    if (dueAt != null) ...[
                      const SizedBox(height: 8),
                      Text('Due: ${dueAt.toLocal()}', style: TextStyle(color: Colors.blueGrey.shade700, fontSize: 12)),
                    ],
                  ],
                ),
                actions: [
                  if ((item['noteId']?.toString() ?? '').isNotEmpty)
                    TextButton(
                      onPressed: () async {
                        Navigator.of(ctx).pop();
                        final noteId = item['noteId'].toString();
                        final client = api ?? repo.api;
                        if (context.mounted) {
                          await Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => MeetingNoteDetailScreen(api: client, noteId: noteId),
                            ),
                          );
                        }
                      },
                      child: const Text('Open note'),
                    ),
                  ElevatedButton(
                    onPressed: () async {
                      final noteId = item['noteId']?.toString() ?? '';
                      final reminderId = item['id']?.toString() ?? '';
                      try {
                        if (noteId.isNotEmpty && reminderId.isNotEmpty) {
                          await repo.meetingAction(noteId, 'complete-reminder', {'reminderId': reminderId});
                        }
                      } catch (_) {}
                      await cancelReminder(reminderId);
                      await _removeCached(reminderId);
                      if (ctx.mounted) Navigator.of(ctx).pop();
                    },
                    child: const Text('Mark done'),
                  ),
                ],
              ),
            );
          },
        );
      }
    } finally {
      _showing = false;
    }
  }
}
