import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ReportsPage() {
  const session = await auth();
  const reports = await prisma.weeklyReport.findMany({
    where: { companyId: session!.user.companyId },
    orderBy: { generatedAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Weekly reports</h2>
        <p className="text-sm text-[var(--muted)]">
          Resource-wise, project-wise, and management digests emailed to PMs and leadership.
        </p>
      </div>

      <div className="space-y-3">
        {reports.length === 0 ? (
          <p className="text-[var(--muted)] text-sm">No reports yet. Generate from AI Agent.</p>
        ) : (
          reports.map((r) => (
            <article key={r.id} className="panel p-4">
              <div className="flex flex-wrap gap-2 justify-between">
                <div className="flex gap-2 items-center">
                  <span className="badge">{r.scope}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {r.periodStart.toISOString().slice(0, 10)} → {r.periodEnd.toISOString().slice(0, 10)}
                  </span>
                </div>
                <span className="text-xs text-[var(--muted)]">
                  {r.generatedAt.toLocaleString()}
                </span>
              </div>
              <p className="mt-3">{r.narrative}</p>
              <pre className="mt-3 text-xs overflow-x-auto bg-black/30 rounded-lg p-3 text-[var(--muted)]">
                {JSON.stringify(JSON.parse(r.metricsJson), null, 2)}
              </pre>
              {r.emailedTo ? (
                <p className="mt-2 text-xs text-[var(--muted)]">Emailed to: {r.emailedTo}</p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
