import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertFeature } from "@/lib/assert-feature";
import { FormMessage } from "@/components/FormMessage";
import { MeetingNoteFields } from "@/components/MeetingNoteFields";
import { createMeetingNote } from "@/lib/meeting-actions";
import { searchMeetingNotes } from "@/lib/meeting-note-crm";
import { NOTE_TEMPLATES } from "@/lib/meeting-note-templates";

export default async function MeetingNotesPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; ok?: string; q?: string; status?: string }>;
}) {
  const session = await assertFeature("meeting_notes").catch(() => null);
  if (!session) redirect("/dashboard");

  const sp = (await searchParams) ?? {};
  const q = sp.q ?? "";
  let notes = await searchMeetingNotes(session.user.companyId, session.user.id, q, 100);
  if (sp.status) notes = notes.filter((n) => n.noteStatus === sp.status);

  async function createAction(formData: FormData) {
    "use server";
    const result = await createMeetingNote(formData);
    if (!result.ok) {
      redirect(`/dashboard/meeting-notes?error=${encodeURIComponent(result.error)}`);
    }
    redirect(`/dashboard/meeting-notes/${result.data!.id}?ok=${encodeURIComponent(result.message ?? "Saved")}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Meeting Notes</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Your notes stay private until you generate a summary and share workflow stages with teammates.
        </p>
      </div>

      <FormMessage error={sp.error} success={sp.ok} />

      <form className="panel p-4 flex flex-wrap gap-2 items-end" method="get">
        <div className="flex-1 min-w-[160px]">
          <label className="label">Search</label>
          <input className="input w-full" name="q" defaultValue={q} placeholder="Title, ID, or body" />
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" name="status" defaultValue={sp.status ?? ""}>
            <option value="">All</option>
            <option value="todo">ToDo</option>
            <option value="in_progress">In Progress</option>
            <option value="blocker">Blocker</option>
            <option value="done">Done</option>
          </select>
        </div>
        <button className="btn" type="submit">
          Filter
        </button>
      </form>

      <section className="panel p-4 space-y-3">
        <h2 className="font-semibold">New note</h2>
        <form action={createAction} className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Template</label>
            <select className="input w-full" name="templateKey" defaultValue="">
              <option value="">Blank</option>
              {Object.entries(NOTE_TEMPLATES).map(([key, t]) => (
                <option key={key} value={key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <MeetingNoteFields />
          <div>
            <button className="btn" type="submit">
              Save meeting note
            </button>
          </div>
        </form>
      </section>

      <section className="panel p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Recent notes</h2>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Summary</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id}>
                <td className="font-mono text-xs">{n.functionalId ?? "—"}</td>
                <td>
                  <Link className="text-sky-700 hover:underline" href={`/dashboard/meeting-notes/${n.id}`}>
                    {n.title}
                  </Link>
                </td>
                <td>
                  <span className="badge">{n.noteStatus}</span>
                </td>
                <td>{n.summary ? "Yes" : "—"}</td>
                <td>{n.createdAt.toLocaleString()}</td>
                <td>{n.updatedAt.toLocaleString()}</td>
                <td>
                  <Link className="btn text-xs px-2 py-1" href={`/dashboard/meeting-notes/${n.id}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {notes.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-[var(--muted)]">
                  No meeting notes yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
