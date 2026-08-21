import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_quill_delta_from_html/flutter_quill_delta_from_html.dart';
import 'package:vsc_quill_delta_to_html/vsc_quill_delta_to_html.dart';

/// Build a Quill controller from stored HTML (the same HTML the web/TipTap
/// editor produces). Falls back to plain text if the HTML cannot be parsed.
QuillController quillControllerFromHtml(String? html) {
  final content = (html ?? '').trim();
  if (content.isEmpty) return QuillController.basic();
  try {
    final delta = HtmlToDelta().convert(content);
    return QuillController(
      document: Document.fromDelta(delta),
      selection: const TextSelection.collapsed(offset: 0),
    );
  } catch (_) {
    final doc = Document()..insert(0, content);
    return QuillController(
      document: doc,
      selection: const TextSelection.collapsed(offset: 0),
    );
  }
}

/// Build a Quill [Document] from stored HTML (for assigning to an existing
/// controller via `controller.document = ...`).
Document quillDocumentFromHtml(String? html) {
  final content = (html ?? '').trim();
  if (content.isEmpty) return Document();
  try {
    return Document.fromDelta(HtmlToDelta().convert(content));
  } catch (_) {
    return Document()..insert(0, content);
  }
}

/// Export the current document as semantic HTML (`<strong>`, `<em>`, `<u>`,
/// `<h2>`, `<ul>`…), compatible with the web renderer.
String quillControllerToHtml(QuillController controller) {
  try {
    final deltaJson = controller.document.toDelta().toJson();
    final ops = deltaJson.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final html = QuillDeltaToHtmlConverter(ops).convert().trim();
    // An empty doc converts to "<p><br/></p>"; normalise to empty.
    if (html == '<p><br/></p>' || html == '<p></p>') return '';
    return html;
  } catch (_) {
    return controller.document.toPlainText().trim();
  }
}

/// Insert plain text (e.g. dictation) at the current cursor position.
void insertTextIntoQuill(QuillController controller, String text) {
  if (text.isEmpty) return;
  final sel = controller.selection;
  final base = sel.baseOffset;
  final index = base < 0 ? (controller.document.length - 1) : base;
  final len = (sel.extentOffset - sel.baseOffset).abs();
  final prefix = index > 0 ? ' ' : '';
  final payload = '$prefix$text';
  controller.replaceText(
    index,
    len,
    payload,
    TextSelection.collapsed(offset: index + payload.length),
  );
}

/// WYSIWYG notes editor: real formatting (bold/italic/underline/headings/lists)
/// with working undo/redo, bounded so it never collapses to a grey box.
class QuillNotesEditor extends StatelessWidget {
  const QuillNotesEditor({
    super.key,
    required this.controller,
    this.minHeight = 240,
    this.expand = false,
    this.readOnly = false,
  });

  final QuillController controller;
  final double minHeight;

  /// When true the editor fills available space (use inside a Column/Expanded,
  /// e.g. a full-screen editor). When false it takes [minHeight] (use inside a
  /// scrolling list or dialog).
  final bool expand;
  final bool readOnly;

  @override
  Widget build(BuildContext context) {
    final border = Border.all(color: Theme.of(context).dividerColor);
    final editor = QuillEditor.basic(
      controller: controller,
      config: QuillEditorConfig(
        placeholder: 'Write notes…',
        padding: const EdgeInsets.all(10),
        expands: expand,
        scrollable: true,
        autoFocus: false,
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
      children: [
        if (!readOnly)
          QuillSimpleToolbar(
            controller: controller,
            config: const QuillSimpleToolbarConfig(
              multiRowsDisplay: true,
              showUndo: true,
              showRedo: true,
              showBoldButton: true,
              showItalicButton: true,
              showUnderLineButton: true,
              showStrikeThrough: true,
              showListBullets: true,
              showListNumbers: true,
              showHeaderStyle: true,
              showQuote: true,
              showClearFormat: true,
              showFontFamily: false,
              showFontSize: false,
              showColorButton: false,
              showBackgroundColorButton: false,
              showInlineCode: false,
              showCodeBlock: false,
              showSubscript: false,
              showSuperscript: false,
              showSmallButton: false,
              showAlignmentButtons: false,
              showDirection: false,
              showLineHeightButton: false,
              showListCheck: false,
              showIndent: false,
              showLink: false,
              showSearchButton: false,
            ),
          ),
        const SizedBox(height: 6),
        if (expand)
          Expanded(
            child: Container(
              decoration: BoxDecoration(border: border, borderRadius: BorderRadius.circular(6)),
              child: editor,
            ),
          )
        else
          Container(
            height: minHeight,
            decoration: BoxDecoration(border: border, borderRadius: BorderRadius.circular(6)),
            child: editor,
          ),
      ],
    );
  }
}
