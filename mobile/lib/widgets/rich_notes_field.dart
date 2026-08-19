import 'package:flutter/material.dart';

/// Reliable notes editor: multiline TextField + lightweight format toolbar.
/// Emits HTML-ish paragraphs for the API; mic appends plain text.
class RichNotesField extends StatelessWidget {
  const RichNotesField({
    super.key,
    required this.controller,
    this.minHeight = 200,
    this.enabled = true,
  });

  final TextEditingController controller;
  final double minHeight;
  final bool enabled;

  void _wrap(String left, [String right = '']) {
    final r = right.isEmpty ? left : right;
    final v = controller.value;
    final sel = v.selection;
    if (!sel.isValid) return;
    final text = v.text;
    final start = sel.start;
    final end = sel.end;
    final selected = text.substring(start, end);
    final next = text.replaceRange(start, end, '$left$selected$r');
    controller.value = TextEditingValue(
      text: next,
      selection: TextSelection.collapsed(offset: start + left.length + selected.length + r.length),
    );
  }

  void _prefixLines(String prefix) {
    final v = controller.value;
    final sel = v.selection;
    if (!sel.isValid) return;
    final text = v.text;
    final start = sel.start;
    final end = sel.end == sel.start ? text.length : sel.end;
    final blockStart = text.lastIndexOf('\n', start > 0 ? start - 1 : 0) + 1;
    final block = text.substring(blockStart, end);
    final rewritten = block.split('\n').map((l) {
      if (l.startsWith(prefix)) return l;
      return '$prefix$l';
    }).join('\n');
    final next = text.replaceRange(blockStart, end, rewritten);
    controller.value = TextEditingValue(
      text: next,
      selection: TextSelection.collapsed(offset: blockStart + rewritten.length),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              IconButton(
                tooltip: 'Bold',
                onPressed: enabled ? () => _wrap('<b>', '</b>') : null,
                icon: const Icon(Icons.format_bold),
              ),
              IconButton(
                tooltip: 'Italic',
                onPressed: enabled ? () => _wrap('<i>', '</i>') : null,
                icon: const Icon(Icons.format_italic),
              ),
              IconButton(
                tooltip: 'Underline',
                onPressed: enabled ? () => _wrap('<u>', '</u>') : null,
                icon: const Icon(Icons.format_underlined),
              ),
              IconButton(
                tooltip: 'Bullet',
                onPressed: enabled ? () => _prefixLines('• ') : null,
                icon: const Icon(Icons.format_list_bulleted),
              ),
              IconButton(
                tooltip: 'Heading',
                onPressed: enabled ? () => _prefixLines('# ') : null,
                icon: const Icon(Icons.title),
              ),
            ],
          ),
        ),
        ConstrainedBox(
          constraints: BoxConstraints(minHeight: minHeight),
          child: TextField(
            controller: controller,
            enabled: enabled,
            maxLines: null,
            minLines: (minHeight / 24).round().clamp(4, 20),
            decoration: const InputDecoration(
              hintText: 'Write notes…',
              alignLabelWithHint: true,
              border: OutlineInputBorder(),
            ),
          ),
        ),
      ],
    );
  }
}

String plainOrHtmlToEditable(String? raw) {
  if (raw == null || raw.trim().isEmpty) return '';
  return raw
      .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'</p\s*>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'<[^>]+>'), '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .trim();
}

String editableToHtmlish(String text) {
  final plain = text.trim();
  if (plain.isEmpty) return '';
  return plain.split('\n').map((l) => '<p>${_escape(l)}</p>').join();
}

void appendPlainToNotes(TextEditingController controller, String text) {
  final t = text.trim();
  if (t.isEmpty) return;
  final cur = controller.text;
  final prefix = cur.trim().isEmpty ? '' : '\n';
  controller.text = '$cur$prefix$t';
  controller.selection = TextSelection.collapsed(offset: controller.text.length);
}

String _escape(String s) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
