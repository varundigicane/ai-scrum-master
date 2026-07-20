import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";
import { StatusForm } from "./StatusForm";

export default async function StatusTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHash = hashToken(token);
  const request = await prisma.statusRequest.findUnique({
    where: { tokenHash },
    include: {
      statusWindow: true,
      resource: {
        include: {
          assignments: {
            where: { active: true },
            include: {
              project: {
                include: {
                  tasks: {
                    where: {
                      status: { not: "done" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      dailyStatus: true,
    },
  });

  if (!request) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="panel p-6 max-w-md text-center">
          <h1 className="text-xl font-semibold">Invalid link</h1>
          <p className="text-sm text-[var(--muted)] mt-2">This status link is not recognized.</p>
        </div>
      </main>
    );
  }

  if (request.state === "skipped_leave") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="panel p-6 max-w-md text-center">
          <h1 className="text-xl font-semibold">On leave</h1>
          <p className="text-sm text-[var(--muted)] mt-2">No status required today.</p>
        </div>
      </main>
    );
  }

  const expired =
    request.state === "expired" || new Date() > request.statusWindow.expiresAt;

  if (expired && !request.dailyStatus) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="panel p-6 max-w-md text-center">
          <h1 className="text-xl font-semibold">Link expired</h1>
          <p className="text-sm text-[var(--muted)] mt-2">
            The 2-hour collection window closed at{" "}
            {request.statusWindow.expiresAt.toLocaleString()}.
          </p>
        </div>
      </main>
    );
  }

  if (!request.openedAt) {
    await prisma.statusRequest.update({
      where: { id: request.id },
      data: { openedAt: new Date() },
    });
  }

  const tasks = request.resource.assignments.flatMap((a) =>
    a.project.tasks
      .filter((t) => !t.resourceId || t.resourceId === request.resourceId)
      .map((t) => ({
        id: t.id,
        title: t.title,
        progressPct: t.progressPct,
        projectId: a.project.id,
        projectName: a.project.name,
      })),
  );

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        {expired ? (
          <p className="mb-3 text-sm text-amber-300 text-center">
            Window closed — viewing last submission only (edits locked).
          </p>
        ) : null}
        {!expired ? (
          <StatusForm
            token={token}
            resourceName={request.resource.name}
            expiresAt={request.statusWindow.expiresAt.toISOString()}
            tasks={tasks}
            existing={request.dailyStatus}
          />
        ) : (
          <div className="panel p-6">
            <h1 className="text-xl font-semibold">Submitted status</h1>
            <pre className="mt-3 text-sm text-[var(--muted)] whitespace-pre-wrap">
              {JSON.stringify(
                {
                  productiveHours: request.dailyStatus?.productiveHours,
                  nonProductiveHours: request.dailyStatus?.nonProductiveHours,
                  narrative: request.dailyStatus?.narrative,
                  blockers: request.dailyStatus?.blockers,
                },
                null,
                2,
              )}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}
