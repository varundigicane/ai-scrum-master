import 'package:flutter/material.dart';

/// Reliable notes editor: multiline TextField + format toolbar.
/// Preserves HTML tags (b/i/u/h2) in the buffer; bullets use plain prefix.
class RichNotesField extends StatefulWidget {
  const RichNotesField({
    super.key,
    required this.controller,
    this.minHeight = 200,
    this.enabled = true,
  });

  final TextEditingController controller;
  final double minHeight;
  final bool enabled;

  @override
  State<RichNotesField> createState() => _RichNotesFieldState();
}

class _RichNotesFieldState extends State<RichNotesField> {
  final List<String> _undo = [];
  final List<String> _redo = [];
  bool _applyingHistory = false;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChange);
  }

  @override
  void didUpdateWidget(covariant RichNotesField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onChange);
      widget.controller.addListener(_onChange);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChange);
    super.dispose();
  }

  void _onChange() {
    if (_applyingHistory) return;
    final text = widget.controller.text;
    if (_undo.isEmpty || _undo.last != text) {
      _undo.add(text);
      if (_undo.length > 4) _undo.removeAt(0); // keep current + 3 prior
      _redo.clear();
    }
  }

  void _undoEdit() {
    if (_undo.length < 2) return;
    _applyingHistory = true;
    final current = _undo.removeLast();
    _redo.add(current);
    if (_redo.length > 3) _redo.removeAt(0);
    widget.controller.text = _undo.last;
    widget.controller.selection = TextSelection.collapsed(offset: widget.controller.text.length);
    _applyingHistory = false;
    setState(() {});
  }

  void _redoEdit() {
    if (_redo.isEmpty) return;
    _applyingHistory = true;
    final next = _redo.removeLast();
    _undo.add(next);
    if (_undo.length > 4) _undo.removeAt(0);
    widget.controller.text = next;
    widget.controller.selection = TextSelection.collapsed(offset: widget.controller.text.length);
    _applyingHistory = false;
    setState(() {});
  }

  void _wrap(String left, [String right = '']) {
    final r = right.isEmpty ? left : right;
    final v = widget.controller.value;
    final sel = v.selection;
    if (!sel.isValid) return;
    final text = v.text;
    final start = sel.start;
    final end = sel.end;
    final selected = text.substring(start, end);
    final next = text.replaceRange(start, end, '$left$selected$r');
    widget.controller.value = TextEditingValue(
      text: next,
      selection: TextSelection.collapsed(offset: start + left.length + selected.length + r.length),
    );
  }

  void _prefixLines(String prefix) {
    final v = widget.controller.value;
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
    widget.controller.value = TextEditingValue(
      text: next,
      selection: TextSelection.collapsed(offset: blockStart + rewritten.length),
    );
  }

  @override
  Widget build(BuildContext context) {
    final enabled = widget.enabled;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              IconButton(
                tooltip: 'Undo',
                onPressed: enabled && _undo.length > 1 ? _undoEdit : null,
                icon: const Icon(Icons.undo),
              ),
              IconButton(
                tooltip: 'Redo',
                onPressed: enabled && _redo.isNotEmpty ? _redoEdit : null,
                icon: const Icon(Icons.redo),
              ),
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
                tooltip: 'Heading',
                onPressed: enabled ? () => _wrap('<h2>', '</h2>') : null,
                icon: const Icon(Icons.title),
              ),
              IconButton(
                tooltip: 'Bullet',
                onPressed: enabled ? () => _prefixLines('• ') : null,
                icon: const Icon(Icons.format_list_bulleted),
              ),
            ],
          ),
        ),
        ConstrainedBox(
          constraints: BoxConstraints(minHeight: widget.minHeight),
          child: TextField(
            controller: widget.controller,
            enabled: enabled,
            maxLines: null,
            minLines: (widget.minHeight / 24).round().clamp(4, 20),
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

/// Load API HTML into editor without stripping format tags.
String plainOrHtmlToEditable(String? raw) {
  if (raw == null || raw.trim().isEmpty) return '';
  return raw
      .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'</p\s*>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'<p[^>]*>', caseSensitive: false), '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&')
      .trim();
}

/// Persist editor text as HTML; keep existing tags (b/i/u/h2).
String editableToHtmlish(String text) {
  final trimmed = text.trim();
  if (trimmed.isEmpty) return '';
  // Already looks like HTML blocks — store as-is (normalize newlines to <br> only outside tags).
  if (RegExp(r'<(b|i|u|h2|ul|li|p)\b', caseSensitive: false).hasMatch(trimmed)) {
    return trimmed.split('\n').map((line) {
      if (line.trim().isEmpty) return '<p></p>';
      if (RegExp(r'^<(p|h2|ul|li)\b', caseSensitive: false).hasMatch(line.trim())) return line;
      return '<p>$line</p>';
    }).join();
  }
  return trimmed.split('\n').map((l) {
    final escaped = l.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return '<p>$escaped</p>';
  }).join();
}

void appendPlainToNotes(TextEditingController controller, String text) {
  final t = text.trim();
  if (t.isEmpty) return;
  final cur = controller.text;
  final prefix = cur.trim().isEmpty ? '' : '\n';
  controller.text = '$cur$prefix$t';
  controller.selection = TextSelection.collapsed(offset: controller.text.length);
}
