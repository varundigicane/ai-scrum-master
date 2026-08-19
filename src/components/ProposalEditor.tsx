"use client";

import { useState } from "react";
import { RichTextEditor } from "@/components/RichTextEditor";

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
  const [name, setName] = useState(title);

  return (
    <form action={saveAction} className="space-y-3">
      <input type="hidden" name="proposalId" value={proposalId} />
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
        <RichTextEditor
          name="bodyHtml"
          initialHtml={bodyHtml}
          placeholder="Edit the software proposal…"
          minHeightClass="min-h-56"
          required
        />
      </div>
      <button className="btn" type="submit">
        Save proposal
      </button>
    </form>
  );
}
