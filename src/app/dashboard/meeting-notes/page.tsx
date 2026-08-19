import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertFeature } from "@/lib/assert-feature";
import { FormMessage } from "@/components/FormMessage";
import { MeetingNoteFields } from "@/components/MeetingNoteFields";
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
    include: { summary: true, proposal: { include: { requirements: true } }, events: true },
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
          Capture business discussions with the rich-text editor, then open a note to run the conversion pipeline.
        </p>
      </div>

      <FormMessage error={sp.error} success={sp.ok} />

      <section className="panel p-4">
        <h2 className="font-semibold mb-2">How it works</h2>
        <ol className="grid gap-2 sm:grid-cols-5 text-sm">
          {[
            "1. Capture notes",
            "2. Generate summary",
            "3. Create proposal",
            "4. Generate FRs",
            "5. Push to backlog",
          ].map((label) => (
            <li key={label} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
              {label}
            </li>
          ))}
        </ol>
        <p className="text-xs text-[var(--muted)] mt-3">
          After you save a note, use <strong>Open &amp; convert</strong> to run steps 2–5 on the note detail page.
          AI steps need <code>OPENAI_API_KEY</code> on the server.
        </p>
      </section>

      <section className="panel p-4 space-y-3">
        <h2 className="font-semibold">New business discussion</h2>
        <form action={createAction} className="grid gap-3 md:grid-cols-2">
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
              <th>Title</th>
              <th>Summary</th>
              <th>Proposal</th>
              <th>FRs</th>
              <th>Events</th>
              <th>Updated</th>
              <th>Action</th>
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
                <td>{n.proposal?.requirements.length ?? 0}</td>
                <td>{n.events.length}</td>
                <td>{n.updatedAt.toLocaleString()}</td>
                <td>
                  <Link className="btn text-xs px-2 py-1" href={`/dashboard/meeting-notes/${n.id}`}>
                    Open &amp; convert
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
