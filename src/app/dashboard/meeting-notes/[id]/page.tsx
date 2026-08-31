import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertFeature } from "@/lib/assert-feature";
import { FormMessage } from "@/components/FormMessage";
import { MeetingNoteFields } from "@/components/MeetingNoteFields";
import { MeetingPipelineStepper } from "@/components/MeetingPipelineStepper";
import { ProposalEditor } from "@/components/ProposalEditor";
import { MeetingScheduleFields } from "@/components/MeetingScheduleFields";
import {
  createMeetingEvent,
  generateFrsAction,
  generateMeetingSummaryAction,
  generateProposalAction,
  pushFrsToBacklog,
  saveProposalBody,
  updateMeetingNote,
} from "@/lib/meeting-actions";
import { getMeetingProvidersStatus } from "@/lib/meeting-providers";
import { MeetingNoteCrmPanel } from "@/components/MeetingNoteCrmPanel";
import { MeetingNoteSharePanel } from "@/components/MeetingNoteSharePanel";
import { accessibleNoteWhere, getMeetingNoteDetail } from "@/lib/meeting-note-crm";

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

  const note = await getMeetingNoteDetail(session.user.companyId, session.user.id, id);
  if (!note) notFound();
  const isOwner = note.isOwner;

  const projects = await prisma.project.findMany({
    where: { account: { companyId: session.user.companyId }, active: true },
    include: { account: true },
    orderBy: { name: "asc" },
  });
  const resources = await prisma.resource.findMany({
    where: { companyId: session.user.companyId, active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  const otherNotes = await prisma.meetingNote.findMany({
    where: { companyId: session.user.companyId, NOT: { id }, ...accessibleNoteWhere(session.user.id) },
    select: { id: true, title: true, functionalId: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const companyUsers = isOwner
    ? await prisma.user.findMany({
        where: { companyId: session.user.companyId, active: true, NOT: { id: session.user.id } },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
        take: 100,
      })
    : [];
  const providers = await getMeetingProvidersStatus(session.user.companyId);

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

  const hasSummary = Boolean(note.summary);
  const hasProposal = Boolean(note.proposal);
  const frCount = note.proposal?.requirements.length ?? 0;
  const hasFrs = frCount > 0;

  const steps = [
    { id: 1, label: "Capture notes", done: Boolean(note.rawNotes?.trim()) },
    { id: 2, label: "Generate summary", done: hasSummary },
    { id: 3, label: "Create proposal", done: hasProposal },
    { id: 4, label: "Generate FRs", done: hasFrs },
    { id: 5, label: "Push to backlog", done: false },
  ];

  let nextLabel: string | null = null;
  let nextForm: React.ReactNode = null;

  if (!hasSummary) {
    nextLabel = isOwner
      ? "Generate an AI summary from these notes"
      : "Waiting for the creator to generate a summary";
    nextForm = isOwner ? (
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
    ) : null;
  } else if (!hasProposal) {
    nextLabel = "Create a software proposal from the summary";
    nextForm = (
      <form
        action={async () => {
          "use server";
          const fd = new FormData();
          fd.set("id", id);
          await withRedirect(generateProposalAction, fd);
        }}
      >
        <button className="btn text-sm" type="submit">
          Create proposal from summary
        </button>
      </form>
    );
  } else if (!hasFrs) {
    nextLabel = "Generate functional requirements from the proposal";
    nextForm = (
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
    );
  } else {
    nextLabel = "Push FRs into a project backlog (epic → feature → story → task)";
    nextForm = (
      <form
        action={async (fd) => {
          "use server";
          fd.set("proposalId", note.proposal!.id);
          await withRedirect(pushFrsToBacklog, fd);
        }}
        className="flex flex-wrap gap-2 items-end"
      >
        <select className="input min-w-[200px]" name="projectId" required defaultValue="">
          <option value="" disabled>
            Select project
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.account.name} / {p.name}
            </option>
          ))}
        </select>
        <button className="btn text-sm" type="submit">
          Push to backlog
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/meeting-notes" className="text-sm text-sky-700 hover:underline">
            ← All meeting notes
          </Link>
          <h1 className="text-2xl font-semibold mt-1">
            {note.functionalId ? (
              <span className="font-mono text-base text-[var(--muted)] mr-2">{note.functionalId}</span>
            ) : null}
            {note.title}
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Created {note.createdAt.toLocaleString()} · Updated {note.updatedAt.toLocaleString()}
            {isOwner ? "" : " · Shared with you (workflow stages)"}
          </p>
        </div>
        {note.proposal ? (
          <a
            className="btn-secondary btn text-sm"
            href={`/api/proposals/${note.proposal.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Export proposal PDF
          </a>
        ) : null}
      </div>

      <FormMessage error={sp.error} success={sp.ok} />

      <MeetingPipelineStepper steps={steps} nextLabel={nextLabel} nextForm={nextForm} />

      <MeetingNoteSharePanel
        noteId={id}
        canShare={isOwner}
        hasSummary={hasSummary}
        companyUsers={companyUsers}
        sharedUserIds={note.shares.map((s) => s.userId)}
      />

      <section className="panel p-4 space-y-3" id="step-notes">
        <h2 className="font-semibold">1. Notes</h2>
        {isOwner ? (
          <form
            id="note-main-form"
            action={async (fd) => {
              "use server";
              fd.set("id", id);
              await withRedirect(updateMeetingNote, fd);
            }}
            className="grid gap-3"
          >
            <MeetingNoteFields
              defaultTitle={note.title}
              defaultAttendees={note.attendees}
              defaultNotesHtml={note.rawNotes}
            />
            <button className="btn w-fit" type="submit">
              Save notes
            </button>
          </form>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Raw meeting notes are private to the creator. You can work summary, proposal, and later
            stages in shared mode.
          </p>
        )}
      </section>

      <MeetingNoteCrmPanel
        noteId={note.id}
        functionalId={note.functionalId}
        noteStatus={note.noteStatus}
        createdAt={note.createdAt}
        updatedAt={note.updatedAt}
        assignedIds={note.assignments.map((a) => a.resourceId)}
        resources={resources}
        comments={note.comments}
        reminders={note.reminders}
        linksFrom={note.linksFrom}
        otherNotes={otherNotes}
        canEditMeta={isOwner}
      />

      <section className="panel p-4 space-y-3" id="step-summary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">2. Summary</h2>
          {isOwner ? (
            <form
              action={async () => {
                "use server";
                const fd = new FormData();
                fd.set("id", id);
                await withRedirect(generateMeetingSummaryAction, fd);
              }}
            >
              <button className="btn text-sm" type="submit">
                {hasSummary ? "Regenerate summary" : "Generate summary"}
              </button>
            </form>
          ) : null}
        </div>
        {note.summary ? (
          <pre className="whitespace-pre-wrap text-sm bg-[var(--panel-2)] rounded-lg p-3 border border-[var(--border)]">
            {note.summary.summaryMd}
          </pre>
        ) : (
          <p className="text-sm text-[var(--muted)]">No summary yet. Use Generate summary above.</p>
        )}
      </section>

      <section className="panel p-4 space-y-3" id="step-proposal">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">3. Software proposal</h2>
          <form
            action={async () => {
              "use server";
              const fd = new FormData();
              fd.set("id", id);
              await withRedirect(generateProposalAction, fd);
            }}
          >
            <button className="btn text-sm" type="submit" disabled={!note.summary}>
              {hasProposal ? "Regenerate proposal" : "Create proposal from summary"}
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
        <section className="panel p-4 space-y-3" id="step-frs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">4. Functional requirements</h2>
            <form
              action={async () => {
                "use server";
                const fd = new FormData();
                fd.set("proposalId", note.proposal!.id);
                await withRedirect(generateFrsAction, fd);
              }}
            >
              <button className="btn text-sm" type="submit">
                {hasFrs ? "Regenerate FRs" : "Generate FRs"}
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

          <div id="step-backlog" className="border-t border-[var(--border)] pt-4 space-y-2">
            <h3 className="font-semibold">5. Push to project backlog</h3>
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
                  Target project
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
          </div>
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
          <MeetingScheduleFields
            googleConfigured={providers.google}
            teamsConfigured={providers.teams}
            defaultTitle={note.title}
            defaultAttendees={note.attendees}
          />
          <div className="md:col-span-2">
            <button className="btn" type="submit">
              Save schedule
            </button>
          </div>
        </form>
        <ul className="space-y-2 text-sm">
          {note.events.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 border border-[var(--border)] rounded-lg p-3"
            >
              <div className="space-y-1">
                <div className="font-medium">{e.title}</div>
                <div className="text-[var(--muted)]">
                  {e.startsAt.toLocaleString()} → {e.endsAt.toLocaleString()} ({e.timezone})
                </div>
                {e.googleMeetUrl ? (
                  <a className="text-sm text-[var(--accent)] underline" href={e.googleMeetUrl} target="_blank" rel="noreferrer">
                    Google Meet
                  </a>
                ) : null}
                {e.teamsJoinUrl ? (
                  <a
                    className="text-sm text-[var(--accent)] underline ml-3"
                    href={e.teamsJoinUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Teams
                  </a>
                ) : null}
                {!e.googleMeetUrl && !e.teamsJoinUrl && e.location ? (
                  <div className="text-[var(--muted)]">{e.location}</div>
                ) : null}
              </div>
              <a className="btn-secondary btn text-sm" href={`/api/meeting-events/${e.id}/ics`}>
                Download ICS
              </a>
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--muted)]">
          Meet/Teams auto-create needs server credentials. ICS always works for any calendar app.
        </p>
      </section>
    </div>
  );
}
