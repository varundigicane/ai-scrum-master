"use client";

import { useEffect, useRef, useState } from "react";

export function ProposalEditor({
  proposalId,
  title,
  bodyHtml,
  saveAction,
}: {
  proposalId: string;
  title: string;
  bodyHtml: string;
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(bodyHtml);
  const [name, setName] = useState(title);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== bodyHtml) {
      editorRef.current.innerHTML = bodyHtml;
      setHtml(bodyHtml);
    }
  }, [bodyHtml]);

  return (
    <form action={saveAction} className="space-y-3">
      <input type="hidden" name="proposalId" value={proposalId} />
      <input type="hidden" name="bodyHtml" value={html} />
      <div>
        <label className="label" htmlFor="proposal-title">
          Proposal title
        </label>
        <input
          className="input"
          id="proposal-title"
          name="title"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label">Proposal body (rich text)</label>
        <div className="flex flex-wrap gap-2 mb-2">
          <button type="button" className="btn-secondary btn text-xs" onClick={() => document.execCommand("bold")}>
            Bold
          </button>
          <button
            type="button"
            className="btn-secondary btn text-xs"
            onClick={() => document.execCommand("insertUnorderedList")}
          >
            List
          </button>
          <button
            type="button"
            className="btn-secondary btn text-xs"
            onClick={() => document.execCommand("formatBlock", false, "h2")}
          >
            Heading
          </button>
        </div>
        <div
          ref={editorRef}
          className="input min-h-56"
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => setHtml((e.target as HTMLDivElement).innerHTML)}
        />
      </div>
      <button className="btn" type="submit">
        Save proposal
      </button>
    </form>
  );
}
