import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';

/// Minimal Quill editor that serializes to plain/HTML-ish text for the API.
class QuillNotesField extends StatefulWidget {
  const QuillNotesField({
    super.key,
    required this.controller,
    this.minHeight = 160,
  });

  final QuillController controller;
  final double minHeight;

  @override
  State<QuillNotesField> createState() => _QuillNotesFieldState();
}

class _QuillNotesFieldState extends State<QuillNotesField> {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        QuillSimpleToolbar(
          controller: widget.controller,
          config: const QuillSimpleToolbarConfig(
            showFontFamily: false,
            showFontSize: false,
            showBackgroundColorButton: false,
            showColorButton: false,
            showCodeBlock: false,
            showInlineCode: false,
            showQuote: false,
            showIndent: false,
            showSearchButton: false,
            showSubscript: false,
            showSuperscript: false,
          ),
        ),
        Container(
          constraints: BoxConstraints(minHeight: widget.minHeight),
          decoration: BoxDecoration(
            border: Border.all(color: Colors.blueGrey.shade200),
            borderRadius: BorderRadius.circular(8),
          ),
          padding: const EdgeInsets.all(8),
          child: QuillEditor.basic(
            controller: widget.controller,
            config: const QuillEditorConfig(
              placeholder: 'Write notes…',
              padding: EdgeInsets.zero,
            ),
          ),
        ),
      ],
    );
  }
}

QuillController quillFromPlainOrHtml(String? raw) {
  final text = (raw ?? '').replaceAll(RegExp(r'<[^>]+>'), ' ').replaceAll('&nbsp;', ' ').trim();
  if (text.isEmpty) {
    return QuillController.basic();
  }
  return QuillController(
    document: Document()..insert(0, text),
    selection: const TextSelection.collapsed(offset: 0),
  );
}

String quillToPlain(QuillController controller) {
  return controller.document.toPlainText().trim();
}

String quillToHtmlish(QuillController controller) {
  final plain = quillToPlain(controller);
  if (plain.isEmpty) return '';
  return plain.split('\n').map((l) => '<p>${_escape(l)}</p>').join();
}

String _escape(String s) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
