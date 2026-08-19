import 'package:flutter/material.dart';
import '../api.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  Map<String, dynamic>? data;
  String? error;
  bool loading = true;
  bool saving = false;

  final ctrls = <String, TextEditingController>{};

  TextEditingController c(String key, [String initial = '']) {
    return ctrls.putIfAbsent(key, () => TextEditingController(text: initial));
  }

  bool meetGoogle = true;
  bool meetTeams = true;
  bool aiParse = false;
  bool teamsAgent = false;
  bool teamsChase = true;
  String mailProvider = '';

  Map<String, dynamic> get configured {
    final s = data?['settings'];
    if (s is Map && s['configured'] is Map) {
      return Map<String, dynamic>.from(s['configured'] as Map);
    }
    return {};
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final x in ctrls.values) {
      x.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final res = await widget.api.settings();
      if (!mounted) return;
      final s = res['settings'] as Map<String, dynamic>? ?? {};
      void fill(String k) {
        final text = s[k]?.toString() ?? '';
        if (ctrls.containsKey(k)) {
          ctrls[k]!.text = text;
        } else {
          c(k, text);
        }
      }

      for (final k in [
        'timezone',
        'statusWindowStart',
        'statusWindowHours',
        'weeklyReportTime',
        'weeklyReportDay',
        'deadlineWarnDays',
        'emailFrom',
        'gmailUserEmail',
        'gmailClientEmail',
        'gmailPrivateKey',
        'gmailClientId',
        'gmailClientSecret',
        'gmailRefreshToken',
        'smtpHost',
        'smtpPort',
        'smtpUser',
        'smtpPass',
        'openaiApiKey',
        'openaiModel',
        'microsoftAppId',
        'microsoftAppPassword',
        'microsoftAppType',
        'microsoftAppTenantId',
        'teamsAppExternalId',
        'graphTenantId',
        'teamsTenantId',
        'teamsReminderMinutesBefore',
        'googleClientEmail',
        'googlePrivateKey',
        'googleCalendarId',
        'graphMeetingUserId',
        'testTo',
      ]) {
        fill(k);
      }
      // Clear secret fields after load — blank means keep
      for (final secret in [
        'gmailPrivateKey',
        'gmailClientSecret',
        'gmailRefreshToken',
        'smtpPass',
        'openaiApiKey',
        'microsoftAppPassword',
        'googlePrivateKey',
      ]) {
        ctrls[secret]?.clear();
      }

      meetGoogle = s['meetGoogleEnabled'] == true;
      meetTeams = s['meetTeamsEnabled'] == true;
      aiParse = s['aiParseEnabled'] == true;
      teamsAgent = s['teamsAgentEnabled'] == true;
      teamsChase = s['teamsChaseEnabled'] != false;
      mailProvider = s['mailProvider']?.toString() ?? '';
      setState(() => data = res);
    } catch (e) {
      if (!mounted) return;
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _savePanel(String panel, Map<String, dynamic> body) async {
    if (data?['canEdit'] != true) return;
    setState(() => saving = true);
    try {
      body['settingsPanel'] = panel;
      for (final secret in [
        'gmailPrivateKey',
        'gmailClientSecret',
        'gmailRefreshToken',
        'smtpPass',
        'openaiApiKey',
        'microsoftAppPassword',
        'googlePrivateKey',
      ]) {
        if (body.containsKey(secret) && ((body[secret] as String?)?.trim().isEmpty ?? true)) {
          body.remove(secret);
        }
      }
      final res = await widget.api.saveSettings(body);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res['message']?.toString() ?? 'Saved')),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _testMail() async {
    setState(() => saving = true);
    try {
      final res = await widget.api.testEmail(c('testTo').text.trim());
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res['message']?.toString() ?? 'Sent')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Widget field(String key, String label, {bool obscure = false, int maxLines = 1}) {
    final hint = configured[key] == true ? 'Configured — leave blank to keep' : null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        controller: c(key),
        obscureText: obscure && maxLines == 1,
        maxLines: maxLines,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          helperText: hint,
        ),
        enabled: data?['canEdit'] == true,
      ),
    );
  }

  Widget panelTitle(String title) => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 8),
        child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
      );

  Widget saveBtn(String label, VoidCallback? onPressed) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: ElevatedButton(onPressed: saving ? null : onPressed, child: Text(label)),
      );

  @override
  Widget build(BuildContext context) {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (error != null) {
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
    final canEdit = data?['canEdit'] == true;
    final active = data?['mailProviderActive']?.toString() ?? '';
    final name = (data?['settings'] as Map?)?['name']?.toString() ?? '';

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Company settings', style: Theme.of(context).textTheme.titleLarge),
        if (name.isNotEmpty) Text(name, style: TextStyle(color: Colors.blueGrey.shade700)),
        Text('Active mail provider: $active', style: TextStyle(color: Colors.blueGrey.shade700, fontSize: 12)),
        if (!canEdit)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('View only — your role cannot edit settings.'),
          ),
        panelTitle('Delivery window'),
        field('timezone', 'Timezone'),
        field('statusWindowStart', 'Status start (HH:mm)'),
        field('statusWindowHours', 'Window hours'),
        field('weeklyReportTime', 'Weekly report time'),
        field('weeklyReportDay', 'Weekly report day (0–6)'),
        field('deadlineWarnDays', 'Deadline warn days'),
        if (canEdit)
          saveBtn('Save delivery', () => _savePanel('delivery', {
                'timezone': c('timezone').text,
                'statusWindowStart': c('statusWindowStart').text,
                'statusWindowHours': c('statusWindowHours').text,
                'weeklyReportTime': c('weeklyReportTime').text,
                'weeklyReportDay': c('weeklyReportDay').text,
                'deadlineWarnDays': c('deadlineWarnDays').text,
              })),
        const Divider(height: 28),
        panelTitle('Mail'),
        DropdownButtonFormField<String>(
          value: ['', 'gmail', 'smtp'].contains(mailProvider) ? mailProvider : '',
          decoration: const InputDecoration(labelText: 'Provider'),
          items: const [
            DropdownMenuItem(value: '', child: Text('Auto')),
            DropdownMenuItem(value: 'gmail', child: Text('Gmail API')),
            DropdownMenuItem(value: 'smtp', child: Text('SMTP')),
          ],
          onChanged: canEdit ? (v) => setState(() => mailProvider = v ?? '') : null,
        ),
        const SizedBox(height: 8),
        field('emailFrom', 'From'),
        field('gmailUserEmail', 'Gmail user email'),
        field('gmailClientEmail', 'Gmail SA email'),
        field('gmailPrivateKey', 'Gmail SA private key', maxLines: 3),
        field('gmailClientId', 'Gmail OAuth client id'),
        field('gmailClientSecret', 'Gmail OAuth secret', obscure: true),
        field('gmailRefreshToken', 'Gmail refresh token', obscure: true),
        field('smtpHost', 'SMTP host (optional)'),
        field('smtpPort', 'SMTP port'),
        field('smtpUser', 'SMTP user'),
        field('smtpPass', 'SMTP pass', obscure: true),
        if (canEdit)
          saveBtn('Save mail', () => _savePanel('mail', {
                'mailProvider': mailProvider,
                'emailFrom': c('emailFrom').text,
                'gmailUserEmail': c('gmailUserEmail').text,
                'gmailClientEmail': c('gmailClientEmail').text,
                'gmailPrivateKey': c('gmailPrivateKey').text,
                'gmailClientId': c('gmailClientId').text,
                'gmailClientSecret': c('gmailClientSecret').text,
                'gmailRefreshToken': c('gmailRefreshToken').text,
                'smtpHost': c('smtpHost').text,
                'smtpPort': c('smtpPort').text,
                'smtpUser': c('smtpUser').text,
                'smtpPass': c('smtpPass').text,
              })),
        field('testTo', 'Send test to'),
        if (canEdit) OutlinedButton(onPressed: saving ? null : _testMail, child: const Text('Send test email')),
        const Divider(height: 28),
        panelTitle('AI'),
        field('openaiApiKey', 'OpenAI API key', obscure: true),
        field('openaiModel', 'OpenAI model'),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('AI parse enabled'),
          value: aiParse,
          onChanged: canEdit ? (v) => setState(() => aiParse = v) : null,
        ),
        if (canEdit)
          saveBtn('Save AI', () => _savePanel('ai', {
                'openaiApiKey': c('openaiApiKey').text,
                'openaiModel': c('openaiModel').text,
                'aiParseEnabled': aiParse,
              })),
        const Divider(height: 28),
        panelTitle('MS Teams'),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Enable Teams agent'),
          value: teamsAgent,
          onChanged: canEdit ? (v) => setState(() => teamsAgent = v) : null,
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Chase when window opens'),
          value: teamsChase,
          onChanged: canEdit ? (v) => setState(() => teamsChase = v) : null,
        ),
        field('teamsTenantId', 'Azure AD tenant id (agent)'),
        field('teamsReminderMinutesBefore', 'Remind minutes before close'),
        field('microsoftAppId', 'Bot App ID'),
        field('microsoftAppPassword', 'Bot App password', obscure: true),
        field('microsoftAppType', 'App type'),
        field('microsoftAppTenantId', 'App tenant'),
        field('teamsAppExternalId', 'Teams app external id'),
        field('graphTenantId', 'Graph tenant'),
        if (canEdit)
          saveBtn('Save MS Teams', () => _savePanel('teams', {
                'teamsAgentEnabled': teamsAgent,
                'teamsChaseEnabled': teamsChase,
                'teamsTenantId': c('teamsTenantId').text,
                'teamsReminderMinutesBefore': c('teamsReminderMinutesBefore').text,
                'microsoftAppId': c('microsoftAppId').text,
                'microsoftAppPassword': c('microsoftAppPassword').text,
                'microsoftAppType': c('microsoftAppType').text,
                'microsoftAppTenantId': c('microsoftAppTenantId').text,
                'teamsAppExternalId': c('teamsAppExternalId').text,
                'graphTenantId': c('graphTenantId').text,
              })),
        const Divider(height: 28),
        panelTitle('Online meetings'),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Google Meet auto-create'),
          value: meetGoogle,
          onChanged: canEdit ? (v) => setState(() => meetGoogle = v) : null,
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Teams meeting auto-create'),
          value: meetTeams,
          onChanged: canEdit ? (v) => setState(() => meetTeams = v) : null,
        ),
        field('googleClientEmail', 'Google SA email'),
        field('googlePrivateKey', 'Google SA key', maxLines: 3),
        field('googleCalendarId', 'Calendar ID'),
        field('graphMeetingUserId', 'Graph meeting user id'),
        if (canEdit)
          saveBtn('Save meetings', () => _savePanel('meetings', {
                'meetGoogleEnabled': meetGoogle,
                'meetTeamsEnabled': meetTeams,
                'googleClientEmail': c('googleClientEmail').text,
                'googlePrivateKey': c('googlePrivateKey').text,
                'googleCalendarId': c('googleCalendarId').text,
                'graphMeetingUserId': c('graphMeetingUserId').text,
              })),
      ],
    );
  }
}
