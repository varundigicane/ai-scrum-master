import { shareMeetingNote } from "@/lib/meeting-actions";

type ShareUser = { id: string; name: string; email: string };

export function MeetingNoteSharePanel({
  noteId,
  canShare,
  hasSummary,
  companyUsers,
  sharedUserIds,
}: {
  noteId: string;
  canShare: boolean;
  hasSummary: boolean;
  companyUsers: ShareUser[];
  sharedUserIds: string[];
}) {
  if (!canShare) {
    return (
      <div className="panel p-4">
        <h3 className="font-semibold">Shared mode</h3>
        <p className="text-sm text-[var(--muted)] mt-1">
          You are collaborating on post-summary stages. Raw meeting notes stay private to the creator.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-4 space-y-3">
      <h3 className="font-semibold">Share workflow</h3>
      <p className="text-sm text-[var(--muted)]">
        After a summary exists, share with company users so they can work proposal, FRs, schedule, and
        reminders. Raw notes stay private to you.
      </p>
      {!hasSummary ? (
        <p className="text-sm text-amber-700">Generate a summary before sharing.</p>
      ) : (
        <form
          action={async (fd) => {
            "use server";
            fd.set("noteId", noteId);
            const { redirect } = await import("next/navigation");
            const result = await shareMeetingNote(fd);
            const q = result.ok
              ? `ok=${encodeURIComponent(result.message ?? "Done")}`
              : `error=${encodeURIComponent(result.error ?? "Failed")}`;
            redirect(`/dashboard/meeting-notes/${noteId}?${q}`);
          }}
          className="space-y-3"
        >
          <div className="max-h-48 overflow-y-auto space-y-1 border border-[var(--border)] rounded-lg p-2">
            {companyUsers.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No other users in this company.</p>
            ) : (
              companyUsers.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm py-1">
                  <input
                    type="checkbox"
                    name="userIds"
                    value={u.id}
                    defaultChecked={sharedUserIds.includes(u.id)}
                  />
                  <span>
                    {u.name} <span className="text-[var(--muted)]">({u.email})</span>
                  </span>
                </label>
              ))
            )}
          </div>
          <button className="btn text-sm" type="submit" disabled={!hasSummary}>
            Save sharing
          </button>
        </form>
      )}
    </div>
  );
}
