import 'dart:convert';

import 'package:sqflite/sqflite.dart';

/// Durable offline store backed by SQLite (sqflite).
///
/// Two tables:
///  - `cached_response`: last-known JSON for each read endpoint (offline reads).
///  - `outbox`: queued writes replayed when connectivity returns.
class LocalDb {
  LocalDb._();
  static final LocalDb instance = LocalDb._();

  Database? _db;

  Future<Database> get _database async {
    final existing = _db;
    if (existing != null) return existing;
    final dir = await getDatabasesPath();
    final path = '$dir/ai_scrum_offline.db';
    _db = await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE cached_response (
            key TEXT PRIMARY KEY,
            json TEXT NOT NULL,
            fetched_at INTEGER NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            query TEXT,
            body TEXT,
            label TEXT,
            created_at INTEGER NOT NULL,
            tries INTEGER NOT NULL DEFAULT 0,
            last_error TEXT
          )
        ''');
      },
    );
    return _db!;
  }

  // ---- cache ----

  Future<void> putCache(String key, Object? data) async {
    final db = await _database;
    await db.insert(
      'cached_response',
      {
        'key': key,
        'json': jsonEncode(data),
        'fetched_at': DateTime.now().millisecondsSinceEpoch,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Returns decoded cached data or null when missing / expired.
  Future<dynamic> getCache(String key, {Duration? maxAge}) async {
    final db = await _database;
    final rows = await db.query(
      'cached_response',
      where: 'key = ?',
      whereArgs: [key],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    final row = rows.first;
    if (maxAge != null) {
      final at = (row['fetched_at'] as int?) ?? 0;
      if (DateTime.now().millisecondsSinceEpoch - at > maxAge.inMilliseconds) {
        return null;
      }
    }
    try {
      return jsonDecode(row['json'] as String);
    } catch (_) {
      return null;
    }
  }

  // ---- outbox ----

  Future<int> enqueue({
    required String method,
    required String path,
    Map<String, String>? query,
    Object? body,
    String? label,
  }) async {
    final db = await _database;
    return db.insert('outbox', {
      'method': method,
      'path': path,
      'query': query == null ? null : jsonEncode(query),
      'body': body == null ? null : jsonEncode(body),
      'label': label,
      'created_at': DateTime.now().millisecondsSinceEpoch,
      'tries': 0,
    });
  }

  Future<List<Map<String, dynamic>>> pending() async {
    final db = await _database;
    return db.query('outbox', orderBy: 'created_at ASC');
  }

  Future<int> pendingCount() async {
    final db = await _database;
    final rows = await db.rawQuery('SELECT COUNT(*) AS c FROM outbox');
    return Sqflite.firstIntValue(rows) ?? 0;
  }

  Future<void> deleteOutbox(int id) async {
    final db = await _database;
    await db.delete('outbox', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> markFailure(int id, String error) async {
    final db = await _database;
    await db.rawUpdate(
      'UPDATE outbox SET tries = tries + 1, last_error = ? WHERE id = ?',
      [error, id],
    );
  }

  /// Wipe everything (used on sign-out so a new user never sees stale data).
  Future<void> clearAll() async {
    final db = await _database;
    await db.delete('cached_response');
    await db.delete('outbox');
  }
}
