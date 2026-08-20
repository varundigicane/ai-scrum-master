import {
  addMeetingNoteComment,
  addMeetingNoteReminder,
  linkMeetingNote,
} from "@/lib/meeting-actions";

type Resource = { id: string; name: string; email: string };
type NoteRef = { id: string; title: string; functionalId: string | null };
type Comment = {
  id: string;
  body: string;
  createdAt: Date;
  author: { name: string };
  attachments: Array<{ id: string; storageKey: string; mimeType: string }>;
};
type Reminder = { id: string; dueAt: Date; note: string; done: boolean };
type LinkRow = {
  id: string;
  heading: string;
  toNote?: NoteRef;
  fromNote?: NoteRef;
};

export function MeetingNoteCrmPanel({
  noteId,
  functionalId,
  noteStatus,
  createdAt,
  updatedAt,
  assignedIds,
  resources,
  comments,
  reminders,
  linksFrom,
  otherNotes,
}: {
  noteId: string;
  functionalId: string | null;
  noteStatus: string;
  createdAt: Date;
  updatedAt: Date;
  assignedIds: string[];
  resources: Resource[];
  comments: Comment[];
  reminders: Reminder[];
  linksFrom: LinkRow[];
  otherNotes: NoteRef[];
}) {
  return (
    <div className="space-y-4">
      <div className="panel p-4 grid gap-2 sm:grid-cols-2 text-sm">
        <p>
          <span className="text-[var(--muted)]">Functional ID:</span>{" "}
          <strong className="font-mono">{functionalId ?? "—"}</strong>
        </p>
        <p>
          <span className="text-[var(--muted)]">Status:</span> <span className="badge">{noteStatus}</span>
        </p>
        <p>
          <span className="text-[var(--muted)]">Created:</span> {createdAt.toLocaleString()}
        </p>
        <p>
          <span className="text-[var(--muted)]">Updated:</span> {updatedAt.toLocaleString()}
        </p>
        <p className="sm:col-span-2">
          <a className="text-sky-700 hover:underline text-sm" href={`/api/meeting-notes/${noteId}/export?format=md`}>
            Export Markdown
          </a>
          {" · "}
          <a className="text-sky-700 hover:underline text-sm" href={`/api/meeting-notes/${noteId}/export?format=pdf`}>
            Export PDF
          </a>
        </p>
      </div>

      <div className="panel p-4 space-y-2">
        <h3 className="font-semibold">Status &amp; assignees</h3>
        <p className="text-xs text-[var(--muted)]">
          Change status and assignees with Save notes (checkboxes below are included in that form via
          form=&quot;note-main-form&quot;).
        </p>
        <div className="flex flex-wrap gap-3">
          {(["todo", "in_progress", "blocker", "done"] as const).map((s) => (
            <label key={s} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="noteStatus"
                value={s}
                defaultChecked={noteStatus === s}
                form="note-main-form"
              />
              {s}
            </label>
          ))}
        </div>
        <div className="grid gap-1 max-h-40 overflow-y-auto">
          {resources.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="resourceIds"
                value={r.id}
                defaultChecked={assignedIds.includes(r.id)}
                form="note-main-form"
              />
              {r.name} <span className="text-[var(--muted)]">({r.email})</span>
            </label>
          ))}
        </div>
      </div>

      <div className="panel p-4 space-y-3">
        <h3 className="font-semibold">Comments (@mention resources by name)</h3>
        <ul className="space-y-2 text-sm">
          {comments.map((c) => (
            <li key={c.id} className="border-b border-[var(--border)] pb-2">
              <strong>{c.author.name}</strong>{" "}
              <span className="text-[var(--muted)] text-xs">{c.createdAt.toLocaleString()}</span>
              <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
          {comments.length === 0 ? <li className="text-[var(--muted)]">No comments yet.</li> : null}
        </ul>
        <form
          action={async (fd) => {
            "use server";
            fd.set("noteId", noteId);
            const { redirect } = await import("next/navigation");
            const result = await addMeetingNoteComment(fd);
            const q = result.ok
              ? `ok=${encodeURIComponent(result.message ?? "Done")}`
              : `error=${encodeURIComponent(result.error ?? "Failed")}`;
            redirect(`/dashboard/meeting-notes/${noteId}?${q}`);
          }}
          className="grid gap-2"
        >
          <textarea
            className="input w-full min-h-[72px]"
            name="body"
            placeholder="Comment… use @Name to mention a resource"
            required
          />
          <button className="btn w-fit" type="submit">
            Add comment
          </button>
        </form>
      </div>

      <div className="panel p-4 space-y-3">
        <h3 className="font-semibold">Reminders / follow-ups</h3>
        <ul className="text-sm space-y-1">
          {reminders.map((r) => (
            <li key={r.id}>
              {r.dueAt.toLocaleString()} — {r.note || "Follow-up"} {r.done ? "(done)" : ""}
            </li>
          ))}
          {reminders.length === 0 ? <li className="text-[var(--muted)]">None</li> : null}
        </ul>
        <form
          action={async (fd) => {
            "use server";
            fd.set("noteId", noteId);
            const { redirect } = await import("next/navigation");
            const result = await addMeetingNoteReminder(fd);
            const q = result.ok
              ? `ok=${encodeURIComponent(result.message ?? "Done")}`
              : `error=${encodeURIComponent(result.error ?? "Failed")}`;
            redirect(`/dashboard/meeting-notes/${noteId}?${q}`);
          }}
          className="flex flex-wrap gap-2 items-end"
        >
          <div>
            <label className="label">Due</label>
            <input className="input" type="datetime-local" name="dueAt" required />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="label">Note</label>
            <input className="input w-full" name="note" placeholder="Follow up with…" />
          </div>
          <button className="btn" type="submit">
            Add reminder
          </button>
        </form>
      </div>

      <div className="panel p-4 space-y-3">
        <h3 className="font-semibold">Linked notes (by heading)</h3>
        <ul className="text-sm space-y-1">
          {linksFrom.map((l) => (
            <li key={l.id}>
              {l.heading || "link"} → {l.toNote?.functionalId ?? ""} {l.toNote?.title}
            </li>
          ))}
          {linksFrom.length === 0 ? <li className="text-[var(--muted)]">No links</li> : null}
        </ul>
        <form
          action={async (fd) => {
            "use server";
            fd.set("fromNoteId", noteId);
            const { redirect } = await import("next/navigation");
            const result = await linkMeetingNote(fd);
            const q = result.ok
              ? `ok=${encodeURIComponent(result.message ?? "Done")}`
              : `error=${encodeURIComponent(result.error ?? "Failed")}`;
            redirect(`/dashboard/meeting-notes/${noteId}?${q}`);
          }}
          className="flex flex-wrap gap-2 items-end"
        >
          <div className="flex-1 min-w-[160px]">
            <label className="label">Link to note</label>
            <select className="input w-full" name="toNoteId" required defaultValue="">
              <option value="" disabled>
                Select…
              </option>
              {otherNotes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.functionalId ? `${n.functionalId} · ` : ""}
                  {n.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Heading</label>
            <input className="input" name="heading" placeholder="e.g. Goals" />
          </div>
          <button className="btn" type="submit">
            Link
          </button>
        </form>
      </div>
    </div>
  );
}
