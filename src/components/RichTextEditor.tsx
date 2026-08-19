"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

const toolbarBtn =
  "btn-secondary btn text-xs px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed";

export function RichTextEditor({
  name,
  initialHtml = "",
  placeholder = "Write notes…",
  minHeightClass = "min-h-40",
  required = false,
}: {
  name: string;
  initialHtml?: string;
  placeholder?: string;
  minHeightClass?: string;
  required?: boolean;
}) {
  const [html, setHtml] = useState(initialHtml || "");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-sky-700 underline" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialHtml || "<p></p>",
    onUpdate: ({ editor: ed }) => setHtml(ed.getHTML()),
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none px-3 py-2 ${minHeightClass}`,
      },
    },
  });

  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  const isEmpty = !text;

  useEffect(() => {
    if (!editor) return;
    if (initialHtml && initialHtml !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(initialHtml || "<p></p>", { emitUpdate: false });
      setHtml(initialHtml || "");
    }
  }, [editor, initialHtml]);

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
      <input type="hidden" name={name} value={isEmpty ? "" : html} />
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          required
          value={isEmpty ? "" : "ok"}
          onChange={() => {}}
          title="Notes required"
        />
      ) : null}
      <div className="flex flex-wrap gap-1 border-b border-[var(--border)] bg-[var(--panel-2)] p-2">
        <button type="button" className={toolbarBtn} disabled={!editor} onClick={() => editor?.chain().focus().toggleBold().run()}>
          Bold
        </button>
        <button type="button" className={toolbarBtn} disabled={!editor} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          Italic
        </button>
        <button
          type="button"
          className={toolbarBtn}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          Heading
        </button>
        <button type="button" className={toolbarBtn} disabled={!editor} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          Bullets
        </button>
        <button type="button" className={toolbarBtn} disabled={!editor} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          Numbered
        </button>
        <button type="button" className={toolbarBtn} disabled={!editor} onClick={setLink}>
          Link
        </button>
        <button
          type="button"
          className={toolbarBtn}
          disabled={!editor}
          onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()}
        >
          Clear
        </button>
      </div>
      <EditorContent editor={editor} />
      {required && isEmpty ? (
        <p className="text-xs text-[var(--danger)] px-3 py-1 border-t border-[var(--border)]">
          Notes are required before saving.
        </p>
      ) : null}
    </div>
  );
}
