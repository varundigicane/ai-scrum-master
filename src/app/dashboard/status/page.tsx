import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function StatusDashboardPage() {
  const session = await auth();
  const companyId = session!.user.companyId;

  const windows = await prisma.statusWindow.findMany({
    where: { companyId },
    include: {
      requests: {
        include: { resource: true, dailyStatus: true },
        orderBy: { resource: { name: "asc" } },
      },
    },
    orderBy: { date: "desc" },
    take: 7,
  });

  const recent = await prisma.dailyStatus.findMany({
    where: { resource: { companyId } },
    include: { resource: true, project: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Daily status</h2>
        <p className="text-sm text-[var(--muted)]">
          Per-resource submissions within the 2-hour collection window.
        </p>
      </div>

      {windows.map((w) => {
        const submitted = w.requests.filter((r) => r.state === "submitted").length;
        const pending = w.requests.filter((r) => r.state === "pending").length;
        const expired = w.requests.filter((r) => r.state === "expired").length;
        const leave = w.requests.filter((r) => r.state === "skipped_leave").length;
        return (
          <section key={w.id} className="panel p-4 space-y-3">
            <div className="flex flex-wrap gap-3 justify-between items-center">
              <div>
                <h3 className="font-semibold">{w.date.toISOString().slice(0, 10)}</h3>
                <p className="text-xs text-[var(--muted)]">
                  Window {w.startsAt.toLocaleString()} → {w.expiresAt.toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="badge">Submitted {submitted}</span>
                <span className="badge">Pending {pending}</span>
                <span className="badge">Expired {expired}</span>
                <span className="badge">Leave {leave}</span>
              </div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>State</th>
                  <th>Hours (P / NP)</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {w.requests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.resource.name}</td>
                    <td>
                      <span className="badge">{r.state}</span>
                    </td>
                    <td>
                      {r.dailyStatus
                        ? `${r.dailyStatus.productiveHours} / ${r.dailyStatus.nonProductiveHours}`
                        : "—"}
                    </td>
                    <td>{r.submittedAt?.toLocaleString() ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      {windows.length === 0 ? (
        <p className="text-[var(--muted)] text-sm">
          No status windows yet. Open one from <strong>AI Agent</strong>.
        </p>
      ) : null}

      <section className="panel p-4 overflow-x-auto">
        <h3 className="font-semibold mb-3">Recent submissions</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Resource</th>
              <th>Project</th>
              <th>P / NP hours</th>
              <th>Blockers</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((s) => (
              <tr key={s.id}>
                <td>{s.date.toISOString().slice(0, 10)}</td>
                <td>{s.resource.name}</td>
                <td>{s.project?.name ?? "—"}</td>
                <td>
                  {s.productiveHours} / {s.nonProductiveHours}
                </td>
                <td className="max-w-xs truncate">{s.blockers ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
