"use client";

import { RichTextEditor } from "@/components/RichTextEditor";

/** Client fields for creating a meeting note (server action remains on the parent form). */
export function MeetingNoteFields({
  defaultTitle = "",
  defaultAttendees = "",
  defaultNotesHtml = "",
}: {
  defaultTitle?: string;
  defaultAttendees?: string;
  defaultNotesHtml?: string;
}) {
  return (
    <>
      <div className="md:col-span-2">
        <label className="label" htmlFor="title">
          Title
        </label>
        <input className="input" id="title" name="title" required defaultValue={defaultTitle} />
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor="attendees">
          Attendees
        </label>
        <input
          className="input"
          id="attendees"
          name="attendees"
          placeholder="Names or emails"
          defaultValue={defaultAttendees}
        />
      </div>
      <div className="md:col-span-2">
        <label className="label">Notes</label>
        <RichTextEditor
          name="rawNotes"
          initialHtml={defaultNotesHtml}
          placeholder="Capture requirements, decisions, risks, and action items…"
          minHeightClass="min-h-48"
          required
        />
      </div>
    </>
  );
}
