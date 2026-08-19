import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertFeature } from "@/lib/assert-feature";
import { FormMessage } from "@/components/FormMessage";
import { createMeetingNote } from "@/lib/meeting-actions";

export default async function MeetingNotesPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await assertFeature("meeting_notes").catch(() => null);
  if (!session) redirect("/dashboard");

  const sp = (await searchParams) ?? {};
  const notes = await prisma.meetingNote.findMany({
    where: { companyId: session.user.companyId },
    orderBy: { createdAt: "desc" },
    include: { summary: true, proposal: true, events: true },
    take: 100,
  });

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
          Capture business discussions, generate summaries and software proposals, then push functional
          requirements into epics, features, stories, tasks, and subtasks.
        </p>
      </div>

      <FormMessage error={sp.error} success={sp.ok} />

      <section className="panel p-4 space-y-3">
        <h2 className="font-semibold">New business discussion</h2>
        <form action={createAction} className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label" htmlFor="title">
              Title
            </label>
            <input className="input" id="title" name="title" required />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="attendees">
              Attendees
            </label>
            <input className="input" id="attendees" name="attendees" placeholder="Names or emails" />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="rawNotes">
              Notes
            </label>
            <textarea className="input min-h-40" id="rawNotes" name="rawNotes" required />
          </div>
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
              <th>Title</th>
              <th>Summary</th>
              <th>Proposal</th>
              <th>Events</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id}>
                <td>
                  <Link className="text-sky-700 hover:underline" href={`/dashboard/meeting-notes/${n.id}`}>
                    {n.title}
                  </Link>
                </td>
                <td>{n.summary ? "Yes" : "—"}</td>
                <td>{n.proposal ? "Yes" : "—"}</td>
                <td>{n.events.length}</td>
                <td>{n.updatedAt.toLocaleString()}</td>
              </tr>
            ))}
            {notes.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-[var(--muted)]">
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
