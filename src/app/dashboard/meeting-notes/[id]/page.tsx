import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertFeature } from "@/lib/assert-feature";
import { FormMessage } from "@/components/FormMessage";
import {
  createMeetingEvent,
  generateFrsAction,
  generateMeetingSummaryAction,
  generateProposalAction,
  pushFrsToBacklog,
  saveProposalBody,
  updateMeetingNote,
} from "@/lib/meeting-actions";
import { ProposalEditor } from "@/components/ProposalEditor";

export default async function MeetingNoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await assertFeature("meeting_notes").catch(() => null);
  if (!session) redirect("/dashboard");

  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const note = await prisma.meetingNote.findFirst({
    where: { id, companyId: session.user.companyId },
    include: {
      summary: true,
      proposal: { include: { requirements: { orderBy: { sortOrder: "asc" } } } },
      events: { orderBy: { startsAt: "asc" } },
    },
  });
  if (!note) notFound();

  const projects = await prisma.project.findMany({
    where: { account: { companyId: session.user.companyId }, active: true },
    include: { account: true },
    orderBy: { name: "asc" },
  });

  async function withRedirect(
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string; message?: string }>,
    formData: FormData,
  ) {
    "use server";
    const result = await action(formData);
    const q = result.ok
      ? `ok=${encodeURIComponent(result.message ?? "Done")}`
      : `error=${encodeURIComponent(result.error ?? "Failed")}`;
    redirect(`/dashboard/meeting-notes/${id}?${q}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/meeting-notes" className="text-sm text-sky-700 hover:underline">
            ← All meeting notes
          </Link>
          <h1 className="text-2xl font-semibold mt-1">{note.title}</h1>
        </div>
        {note.proposal ? (
          <a className="btn-secondary btn text-sm" href={`/api/proposals/${note.proposal.id}/pdf`} target="_blank" rel="noreferrer">
            Export proposal PDF
          </a>
        ) : null}
      </div>

      <FormMessage error={sp.error} success={sp.ok} />

      <section className="panel p-4 space-y-3">
        <h2 className="font-semibold">Notes</h2>
        <form
          action={async (fd) => {
            "use server";
            fd.set("id", id);
            await withRedirect(updateMeetingNote, fd);
          }}
          className="grid gap-3"
        >
          <div>
            <label className="label" htmlFor="title">
              Title
            </label>
            <input className="input" id="title" name="title" defaultValue={note.title} required />
          </div>
          <div>
            <label className="label" htmlFor="attendees">
              Attendees
            </label>
            <input className="input" id="attendees" name="attendees" defaultValue={note.attendees} />
          </div>
          <div>
            <label className="label" htmlFor="rawNotes">
              Discussion notes
            </label>
            <textarea className="input min-h-48" id="rawNotes" name="rawNotes" defaultValue={note.rawNotes} required />
          </div>
          <button className="btn w-fit" type="submit">
            Save notes
          </button>
        </form>
      </section>

      <section className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Summary</h2>
          <form
            action={async () => {
              "use server";
              const fd = new FormData();
              fd.set("id", id);
              await withRedirect(generateMeetingSummaryAction, fd);
            }}
          >
            <button className="btn text-sm" type="submit">
              Generate summary
            </button>
          </form>
        </div>
        {note.summary ? (
          <pre className="whitespace-pre-wrap text-sm bg-[var(--panel-2)] rounded-lg p-3 border border-[var(--border)]">
            {note.summary.summaryMd}
          </pre>
        ) : (
          <p className="text-sm text-[var(--muted)]">No summary yet.</p>
        )}
      </section>

      <section className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Software proposal</h2>
          <form
            action={async () => {
              "use server";
              const fd = new FormData();
              fd.set("id", id);
              await withRedirect(generateProposalAction, fd);
            }}
          >
            <button className="btn text-sm" type="submit" disabled={!note.summary}>
              Create proposal from summary
            </button>
          </form>
        </div>
        {note.proposal ? (
          <ProposalEditor
            proposalId={note.proposal.id}
            title={note.proposal.title}
            bodyHtml={note.proposal.bodyHtml}
            saveAction={async (fd) => {
              "use server";
              await withRedirect(saveProposalBody, fd);
            }}
          />
        ) : (
          <p className="text-sm text-[var(--muted)]">Generate a summary first, then create a proposal.</p>
        )}
      </section>

      {note.proposal ? (
        <section className="panel p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Functional requirements</h2>
            <form
              action={async () => {
                "use server";
                const fd = new FormData();
                fd.set("proposalId", note.proposal!.id);
                await withRedirect(generateFrsAction, fd);
              }}
            >
              <button className="btn text-sm" type="submit">
                Generate FRs
              </button>
            </form>
          </div>
          <ul className="space-y-2 text-sm">
            {note.proposal.requirements.map((r) => (
              <li key={r.id} className="border border-[var(--border)] rounded-lg p-3 bg-[var(--panel-2)]">
                <div className="font-medium">
                  <span className="badge mr-2">{r.kindHint}</span>
                  {r.title}
                </div>
                <p className="text-[var(--muted)] mt-1">{r.description}</p>
              </li>
            ))}
            {note.proposal.requirements.length === 0 ? (
              <li className="text-[var(--muted)]">No FRs yet.</li>
            ) : null}
          </ul>
          <form
            action={async (fd) => {
              "use server";
              fd.set("proposalId", note.proposal!.id);
              await withRedirect(pushFrsToBacklog, fd);
            }}
            className="flex flex-wrap gap-3 items-end"
          >
            <div className="min-w-[220px] flex-1">
              <label className="label" htmlFor="projectId">
                Push to project backlog
              </label>
              <select className="input" id="projectId" name="projectId" required>
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.account.name} / {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" type="submit" disabled={note.proposal.requirements.length === 0}>
              Create epic / feature / task hierarchy
            </button>
          </form>
        </section>
      ) : null}

      <section className="panel p-4 space-y-3">
        <h2 className="font-semibold">Schedule meeting</h2>
        <form
          action={async (fd) => {
            "use server";
            fd.set("meetingNoteId", id);
            await withRedirect(createMeetingEvent, fd);
          }}
          className="grid gap-3 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label className="label" htmlFor="eventTitle">
              Title
            </label>
            <input className="input" id="eventTitle" name="title" defaultValue={note.title} required />
          </div>
          <div>
            <label className="label" htmlFor="startsAt">
              Starts
            </label>
            <input className="input" id="startsAt" name="startsAt" type="datetime-local" required />
          </div>
          <div>
            <label className="label" htmlFor="endsAt">
              Ends
            </label>
            <input className="input" id="endsAt" name="endsAt" type="datetime-local" required />
          </div>
          <div>
            <label className="label" htmlFor="timezone">
              Timezone
            </label>
            <input className="input" id="timezone" name="timezone" defaultValue="Asia/Kolkata" />
          </div>
          <div>
            <label className="label" htmlFor="location">
              Location / link
            </label>
            <input className="input" id="location" name="location" />
          </div>
          <div className="md:col-span-2">
            <button className="btn" type="submit">
              Save schedule
            </button>
          </div>
        </form>
        <ul className="space-y-2 text-sm">
          {note.events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border border-[var(--border)] rounded-lg p-3">
              <div>
                <div className="font-medium">{e.title}</div>
                <div className="text-[var(--muted)]">
                  {e.startsAt.toLocaleString()} → {e.endsAt.toLocaleString()} ({e.timezone})
                </div>
              </div>
              <a className="btn-secondary btn text-sm" href={`/api/meeting-events/${e.id}/ics`}>
                Download ICS
              </a>
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--muted)]">
          Google Calendar sync is optional. Set GOOGLE_CALENDAR_* env vars later; ICS works for any calendar app without
          changing existing data.
        </p>
      </section>
    </div>
  );
}
