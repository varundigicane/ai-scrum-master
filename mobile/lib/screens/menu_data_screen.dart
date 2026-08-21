import 'package:flutter/material.dart';
import '../api.dart';
import '../repository.dart';

/// Field descriptor for generated create/edit forms.
class _Field {
  const _Field(
    this.key,
    this.label, {
    this.type = 'text',
    this.options = const [],
  });
  final String key;
  final String label;
  final String type; // text | multiline | password | date | dropdown | switch
  final List<Map<String, String>> options; // for dropdown: [{value,label}]
}

/// List + full create/edit/delete for catalog menus (parity with web writes).
class MenuDataScreen extends StatefulWidget {
  const MenuDataScreen({
    super.key,
    required this.api,
    required this.menuKey,
    required this.title,
  });

  final ApiClient api;
  final String menuKey;
  final String title;

  @override
  State<MenuDataScreen> createState() => _MenuDataScreenState();
}

class _MenuDataScreenState extends State<MenuDataScreen> {
  Map<String, dynamic>? data;
  String? error;
  bool loading = true;
  String? projectId;
  bool offlineQueued = false;

  static const _flatMenus = {'accounts', 'resources', 'users', 'leaves', 'quality'};

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
      final res = await repo.menuData(widget.menuKey, projectId: projectId);
      if (!mounted) return;
      setState(() {
        data = res;
        projectId = res['projectId']?.toString() ?? projectId;
      });
    } catch (e) {
      if (!mounted) return;
      if (data == null) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      } else {
        setState(() => offlineQueued = true);
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  bool get canEdit => data?['canEdit'] == true;

  bool get canCreate =>
      canEdit &&
      (_flatMenus.contains(widget.menuKey) || widget.menuKey == 'backlog');

  List<Map<String, String>> _opts(String listKey, {String valueKey = 'id', String labelKey = 'name'}) {
    final list = (data?[listKey] as List<dynamic>?) ?? [];
    return list
        .map((e) => Map<String, dynamic>.from(e as Map))
        .map((m) => {'value': m[valueKey]?.toString() ?? '', 'label': m[labelKey]?.toString() ?? ''})
        .toList();
  }

  List<_Field> _createFields() {
    switch (widget.menuKey) {
      case 'accounts':
        return const [
          _Field('name', 'Name'),
          _Field('code', 'Code'),
          _Field('technology', 'Technology'),
          _Field('domain', 'Domain'),
          _Field('projectManagers', 'Project managers'),
        ];
      case 'resources':
        return const [
          _Field('employeeId', 'Employee ID'),
          _Field('name', 'Name'),
          _Field('email', 'Email'),
        ];
      case 'users':
        return [
          const _Field('name', 'Name'),
          const _Field('email', 'Email'),
          const _Field('password', 'Password', type: 'password'),
          _Field('role', 'Role', type: 'dropdown', options: _opts('roles')),
        ];
      case 'leaves':
        return [
          _Field('resourceId', 'Resource', type: 'dropdown', options: _opts('resources')),
          const _Field('startDate', 'Start date', type: 'date'),
          const _Field('endDate', 'End date', type: 'date'),
          const _Field('type', 'Type', type: 'dropdown', options: [
            {'value': 'internal', 'label': 'Internal'},
            {'value': 'client_informed', 'label': 'Client informed'},
          ]),
          const _Field('reason', 'Reason'),
        ];
      case 'quality':
        return [
          _Field('projectId', 'Project', type: 'dropdown', options: _opts('projects')),
          const _Field('title', 'Title'),
          const _Field('description', 'Description', type: 'multiline'),
          const _Field('severity', 'Severity', type: 'dropdown', options: [
            {'value': 'low', 'label': 'Low'},
            {'value': 'medium', 'label': 'Medium'},
            {'value': 'high', 'label': 'High'},
            {'value': 'critical', 'label': 'Critical'},
          ]),
          const _Field('status', 'Status', type: 'dropdown', options: [
            {'value': 'open', 'label': 'Open'},
            {'value': 'in_progress', 'label': 'In progress'},
            {'value': 'resolved', 'label': 'Resolved'},
            {'value': 'closed', 'label': 'Closed'},
          ]),
        ];
      default:
        return const [];
    }
  }

  List<_Field> _editFields() {
    switch (widget.menuKey) {
      case 'accounts':
        return const [
          _Field('name', 'Name'),
          _Field('code', 'Code'),
          _Field('technology', 'Technology'),
          _Field('domain', 'Domain'),
          _Field('projectManagers', 'Project managers'),
        ];
      case 'resources':
        return const [
          _Field('employeeId', 'Employee ID'),
          _Field('name', 'Name'),
          _Field('email', 'Email'),
        ];
      case 'users':
        return [_Field('role', 'Role', type: 'dropdown', options: _opts('roles'))];
      case 'quality':
        return const [
          _Field('title', 'Title'),
          _Field('description', 'Description', type: 'multiline'),
          _Field('severity', 'Severity', type: 'dropdown', options: [
            {'value': 'low', 'label': 'Low'},
            {'value': 'medium', 'label': 'Medium'},
            {'value': 'high', 'label': 'High'},
            {'value': 'critical', 'label': 'Critical'},
          ]),
          _Field('status', 'Status', type: 'dropdown', options: [
            {'value': 'open', 'label': 'Open'},
            {'value': 'in_progress', 'label': 'In progress'},
            {'value': 'resolved', 'label': 'Resolved'},
            {'value': 'closed', 'label': 'Closed'},
          ]),
        ];
      default:
        return const [];
    }
  }

  bool get _supportsEdit => {'accounts', 'resources', 'users', 'quality'}.contains(widget.menuKey);
  bool get _supportsDelete => {'accounts', 'resources', 'leaves'}.contains(widget.menuKey);

  String _actionFor({required bool isEdit}) {
    if (!isEdit) return 'create';
    if (widget.menuKey == 'users') return 'updateRole';
    return 'update';
  }

  Future<void> _submit(Map<String, dynamic> body) async {
    try {
      final res = await repo.mutate(body);
      if (!mounted) return;
      if (res['queued'] == true) {
        setState(() => offlineQueued = true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Saved offline — will sync when online.')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res['message']?.toString() ?? 'Saved')),
        );
      }
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  /// Generic create/edit form. Returns the collected values, or null if cancelled.
  Future<Map<String, dynamic>?> _showForm({
    required String title,
    required List<_Field> fields,
    Map<String, dynamic>? initial,
  }) async {
    final values = <String, dynamic>{};
    final controllers = <String, TextEditingController>{};
    for (final f in fields) {
      if (f.type == 'dropdown' || f.type == 'switch') {
        values[f.key] = initial?[f.key] ??
            (f.type == 'switch' ? false : (f.options.isNotEmpty ? f.options.first['value'] : ''));
      } else {
        controllers[f.key] = TextEditingController(text: initial?[f.key]?.toString() ?? '');
      }
    }

    Widget buildField(_Field f, void Function(void Function()) setLocal) {
      switch (f.type) {
        case 'dropdown':
          final current = values[f.key]?.toString();
          final valid = f.options.any((o) => o['value'] == current);
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: DropdownButtonFormField<String>(
              initialValue: valid ? current : (f.options.isNotEmpty ? f.options.first['value'] : null),
              isExpanded: true,
              decoration: InputDecoration(labelText: f.label),
              items: f.options
                  .map((o) => DropdownMenuItem(value: o['value'], child: Text(o['label'] ?? '')))
                  .toList(),
              onChanged: (v) => setLocal(() => values[f.key] = v),
            ),
          );
        case 'switch':
          return SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(f.label),
            value: values[f.key] == true,
            onChanged: (v) => setLocal(() => values[f.key] = v),
          );
        case 'date':
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: TextField(
              controller: controllers[f.key],
              readOnly: true,
              decoration: InputDecoration(labelText: f.label, suffixIcon: const Icon(Icons.calendar_today)),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: DateTime.tryParse(controllers[f.key]!.text) ?? DateTime.now(),
                  firstDate: DateTime(2020),
                  lastDate: DateTime(2100),
                );
                if (picked != null) {
                  controllers[f.key]!.text = picked.toIso8601String().split('T').first;
                }
              },
            ),
          );
        default:
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: TextField(
              controller: controllers[f.key],
              obscureText: f.type == 'password',
              maxLines: f.type == 'multiline' ? 3 : 1,
              decoration: InputDecoration(labelText: f.label),
            ),
          );
      }
    }

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text(title),
          content: SizedBox(
            width: MediaQuery.of(ctx).size.width,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [for (final f in fields) buildField(f, setLocal)]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
          ],
        ),
      ),
    );

    Map<String, dynamic>? result;
    if (ok == true) {
      result = {...values};
      for (final e in controllers.entries) {
        result[e.key] = e.value.text.trim();
      }
    }
    for (final c in controllers.values) {
      c.dispose();
    }
    return result;
  }

  Future<void> _createFlat() async {
    final values = await _showForm(title: 'New ${widget.title}', fields: _createFields());
    if (values == null) return;
    await _submit({'menu': widget.menuKey, 'action': 'create', ...values});
  }

  Future<void> _editFlat(Map<String, dynamic> item) async {
    final values = await _showForm(
      title: 'Edit ${widget.title}',
      fields: _editFields(),
      initial: item,
    );
    if (values == null) return;
    await _submit({'menu': widget.menuKey, 'action': _actionFor(isEdit: true), 'id': item['id'], ...values});
  }

  Future<void> _delete(Map<String, dynamic> item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete?'),
        content: Text('Remove "${item['title'] ?? ''}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    await _submit({'menu': widget.menuKey, 'action': 'delete', 'id': item['id']});
  }

  @override
  Widget build(BuildContext context) {
    if (loading && data == null) return const Center(child: CircularProgressIndicator());
    if (error != null && data == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    if (widget.menuKey == 'permissions') return _buildPermissions();
    if (widget.menuKey == 'teams') return _buildTeams();
    if (widget.menuKey == 'backlog') return _buildBacklog();

    final items = (data?['items'] as List<dynamic>?) ?? [];
    final summary = data?['summary'] as Map<String, dynamic>?;

    return Scaffold(
      floatingActionButton: canCreate
          ? FloatingActionButton(onPressed: _createFlat, child: const Icon(Icons.add))
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(widget.title, style: Theme.of(context).textTheme.titleLarge),
            if (offlineQueued)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('Offline changes queued — will sync when online.', style: TextStyle(color: Colors.orange)),
              ),
            if (summary != null) ...[
              const SizedBox(height: 8),
              Text(
                summary.entries.map((e) => '${e.key}: ${e.value}').join(' · '),
                style: TextStyle(color: Colors.blueGrey.shade700, fontSize: 12),
              ),
            ],
            const SizedBox(height: 12),
            if (items.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 24),
                child: Text('No data yet.'),
              ),
            for (final raw in items)
              _itemCard(Map<String, dynamic>.from(raw as Map)),
          ],
        ),
      ),
    );
  }

  Widget _itemCard(Map<String, dynamic> item) {
    final actions = <PopupMenuEntry<String>>[];
    if (canEdit && _supportsEdit) actions.add(const PopupMenuItem(value: 'edit', child: Text('Edit')));
    if (canEdit && _supportsDelete) actions.add(const PopupMenuItem(value: 'delete', child: Text('Delete')));
    return Card(
      child: ListTile(
        title: Text(item['title']?.toString() ?? ''),
        subtitle: Text(item['subtitle']?.toString() ?? ''),
        trailing: actions.isEmpty
            ? null
            : PopupMenuButton<String>(
                onSelected: (v) {
                  if (v == 'edit') _editFlat(item);
                  if (v == 'delete') _delete(item);
                },
                itemBuilder: (_) => actions,
              ),
      ),
    );
  }

  // ---------------- permissions ----------------
  Widget _buildPermissions() {
    final roles = (data?['roles'] as List<dynamic>?) ?? [];
    final features = (data?['features'] as List<dynamic>?) ?? [];
    final matrix = (data?['matrix'] as Map<String, dynamic>?) ?? {};
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Feature access', style: Theme.of(context).textTheme.titleLarge),
          if (!canEdit)
            const Padding(padding: EdgeInsets.only(top: 8), child: Text('View only — your role cannot edit access.')),
          const SizedBox(height: 12),
          for (final r in roles)
            ExpansionTile(
              title: Text((r as Map)['name']?.toString() ?? ''),
              children: [
                for (final f in features)
                  SwitchListTile(
                    dense: true,
                    title: Text((f as Map)['label']?.toString() ?? ''),
                    subtitle: Text('${f['kind']} · ${f['key']}'),
                    value: ((matrix[r['id']] as Map?)?[f['key']] == true),
                    onChanged: (canEdit && r['id'] != 'CompanyAdmin')
                        ? (v) async {
                            await _submit({
                              'menu': 'permissions',
                              'action': 'setRole',
                              'role': r['id'],
                              'feature': f['key'],
                              'enabled': v,
                            });
                          }
                        : null,
                  ),
              ],
            ),
        ],
      ),
    );
  }

  // ---------------- teams ----------------
  Widget _buildTeams() {
    final items = (data?['items'] as List<dynamic>?) ?? [];
    final summary = data?['summary'] as Map<String, dynamic>?;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('MS Teams', style: Theme.of(context).textTheme.titleLarge),
          if (summary != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'Enabled: ${summary['enabled']} · Chase: ${summary['chaseEnabled']} · '
                '${summary['identities']} identities · ${summary['channels']} channels',
                style: TextStyle(color: Colors.blueGrey.shade700, fontSize: 12),
              ),
            ),
          const SizedBox(height: 12),
          for (final raw in items) _teamsCard(Map<String, dynamic>.from(raw as Map)),
        ],
      ),
    );
  }

  Widget _teamsCard(Map<String, dynamic> item) {
    final isIdentity = item['kind'] == 'identity';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(item['title']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
            Text(item['subtitle']?.toString() ?? '', style: TextStyle(color: Colors.blueGrey.shade700, fontSize: 12)),
            if (canEdit) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  if (isIdentity)
                    OutlinedButton(
                      onPressed: () => _submit({
                        'menu': 'teams',
                        'action': 'muteIdentity',
                        'id': item['id'],
                        'muted': item['muted'] != true,
                      }),
                      child: Text(item['muted'] == true ? 'Unmute' : 'Mute'),
                    ),
                  if (isIdentity)
                    OutlinedButton(onPressed: () => _linkIdentity(item), child: const Text('Link resource')),
                  OutlinedButton(
                    onPressed: () => _submit({
                      'menu': 'teams',
                      'action': isIdentity ? 'deleteIdentity' : 'deleteChannel',
                      'id': item['id'],
                    }),
                    child: const Text('Delete'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _linkIdentity(Map<String, dynamic> item) async {
    final options = [
      {'value': '', 'label': 'Unlink'},
      ..._opts('resources'),
    ];
    String? selected = item['resourceId']?.toString() ?? '';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Link to resource'),
          content: DropdownButtonFormField<String>(
            initialValue: options.any((o) => o['value'] == selected) ? selected : '',
            isExpanded: true,
            items: options.map((o) => DropdownMenuItem(value: o['value'], child: Text(o['label'] ?? ''))).toList(),
            onChanged: (v) => setLocal(() => selected = v),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    await _submit({'menu': 'teams', 'action': 'linkResource', 'id': item['id'], 'resourceId': selected});
  }

  // ---------------- backlog ----------------
  Widget _buildBacklog() {
    final projects = (data?['projects'] as List<dynamic>?) ?? [];
    final requirements = (data?['items'] as List<dynamic>?) ?? [];
    final tasks = (data?['tasks'] as List<dynamic>?) ?? [];
    return Scaffold(
      floatingActionButton: (canEdit && projectId != null)
          ? FloatingActionButton(onPressed: _newBacklogItem, child: const Icon(Icons.add))
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Backlog', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            if (projects.isNotEmpty)
              DropdownButtonFormField<String>(
                initialValue: projectId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Project'),
                items: projects
                    .map((p) => Map<String, dynamic>.from(p as Map))
                    .map((m) => DropdownMenuItem(value: m['id']?.toString(), child: Text(m['name']?.toString() ?? '')))
                    .toList(),
                onChanged: (v) {
                  projectId = v;
                  _load();
                },
              ),
            const SizedBox(height: 12),
            Text('Requirements (${requirements.length})', style: Theme.of(context).textTheme.titleMedium),
            for (final raw in requirements) _backlogCard(Map<String, dynamic>.from(raw as Map), isTask: false),
            const SizedBox(height: 16),
            Text('Tasks (${tasks.length})', style: Theme.of(context).textTheme.titleMedium),
            for (final raw in tasks) _backlogCard(Map<String, dynamic>.from(raw as Map), isTask: true),
          ],
        ),
      ),
    );
  }

  Widget _backlogCard(Map<String, dynamic> item, {required bool isTask}) {
    return Card(
      child: ListTile(
        title: Text(item['title']?.toString() ?? ''),
        subtitle: Text(item['subtitle']?.toString() ?? ''),
        trailing: canEdit
            ? PopupMenuButton<String>(
                onSelected: (v) {
                  if (v == 'edit') _editBacklog(item, isTask: isTask);
                  if (v == 'delete') {
                    _submit({
                      'menu': 'backlog',
                      'action': isTask ? 'deleteTask' : 'deleteRequirement',
                      'id': item['id'],
                    });
                  }
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'edit', child: Text('Edit')),
                  PopupMenuItem(value: 'delete', child: Text('Delete')),
                ],
              )
            : null,
      ),
    );
  }

  Future<void> _newBacklogItem() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.list_alt),
              title: const Text('New requirement'),
              onTap: () => Navigator.pop(ctx, 'requirement'),
            ),
            ListTile(
              leading: const Icon(Icons.check_box_outlined),
              title: const Text('New task'),
              onTap: () => Navigator.pop(ctx, 'task'),
            ),
          ],
        ),
      ),
    );
    if (choice == 'requirement') await _editBacklog(null, isTask: false);
    if (choice == 'task') await _editBacklog(null, isTask: true);
  }

  Future<void> _editBacklog(Map<String, dynamic>? item, {required bool isTask}) async {
    final isEdit = item != null;
    final fields = isTask
        ? [
            const _Field('title', 'Title'),
            const _Field('description', 'Description', type: 'multiline'),
            const _Field('status', 'Status', type: 'dropdown', options: [
              {'value': 'todo', 'label': 'ToDo'},
              {'value': 'in_progress', 'label': 'In progress'},
              {'value': 'blocked', 'label': 'Blocked'},
              {'value': 'done', 'label': 'Done'},
            ]),
            _Field('resourceId', 'Assignee', type: 'dropdown', options: [
              {'value': '', 'label': 'Unassigned'},
              ..._opts('resources'),
            ]),
          ]
        : [
            const _Field('title', 'Title'),
            const _Field('kind', 'Kind', type: 'dropdown', options: [
              {'value': 'epic', 'label': 'Epic'},
              {'value': 'feature', 'label': 'Feature'},
              {'value': 'story', 'label': 'Story'},
            ]),
            const _Field('description', 'Description', type: 'multiline'),
            if (item != null) const _Field('closed', 'Closed', type: 'switch'),
          ];
    final values = await _showForm(
      title: isEdit ? (isTask ? 'Edit task' : 'Edit requirement') : (isTask ? 'New task' : 'New requirement'),
      fields: fields,
      initial: item,
    );
    if (values == null) return;
    final action = isTask
        ? (isEdit ? 'updateTask' : 'createTask')
        : (isEdit ? 'updateRequirement' : 'createRequirement');
    await _submit({
      'menu': 'backlog',
      'action': action,
      if (isEdit) 'id': item['id'] else 'projectId': projectId,
      ...values,
    });
  }
}
