import Link from "next/link";
import {
  deleteGtsMonthLine,
  generateGtsMonthReport,
  updateGtsMonthHeader,
  upsertGtsMonthLine,
} from "@/app/actions";
import { requireFeature } from "@/lib/require-feature";
import { hasFeature } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  deliveredDefectDensity,
  monthTabLabel,
  summarizeGtsLines,
} from "@/lib/gts-report";

function fmtHrs(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function fmtDdd(n: number) {
  return n.toFixed(5);
}

export default async function GtsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; year?: string; month?: string }>;
}) {
  const session = await requireFeature("gts_report");
  const canEdit = await hasFeature(session.user.companyId, session.user.role, "edit_delivery");
  const companyId = session.user.companyId;
  const sp = await searchParams;
  const now = new Date();

  const accounts = await prisma.account.findMany({
    where: { companyId, active: true },
    orderBy: { name: "asc" },
  });

  const accountId = sp.accountId || accounts[0]?.id || "";
  const year = Number(sp.year ?? now.getFullYear());
  const month = Number(sp.month ?? now.getMonth() + 1);

  const existingMonths = accountId
    ? await prisma.gtsMonthlyReport.findMany({
        where: { companyId, accountId },
        select: { year: true, month: true },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      })
    : [];

  // Month tabs: existing reports + current month + surrounding months for navigation
  const tabKeys = new Map<string, { year: number; month: number }>();
  for (const m of existingMonths) {
    tabKeys.set(`${m.year}-${m.month}`, m);
  }
  for (let i = -2; i <= 3; i++) {
    const d = new Date(year, month - 1 + i, 1);
    const y = d.getFullYear();
    const mo = d.getMonth() + 1;
    tabKeys.set(`${y}-${mo}`, { year: y, month: mo });
  }
  const tabs = [...tabKeys.values()].sort((a, b) => a.year - b.year || a.month - b.month);

  const report = accountId
    ? await prisma.gtsMonthlyReport.findUnique({
        where: { accountId_year_month: { accountId, year, month } },
        include: {
          account: true,
          lines: { orderBy: [{ sortOrder: "asc" }, { subProjectName: "asc" }] },
        },
      })
    : null;

  const account = accounts.find((a) => a.id === accountId) ?? null;
  const projects = accountId
    ? await prisma.project.findMany({
        where: { accountId, active: true },
        orderBy: { name: "asc" },
      })
    : [];

  const summary = report
    ? summarizeGtsLines(report.lines, report.utilizationPct, report.availabilityPct)
    : null;

  const header = {
    projectName: report?.projectName ?? account?.code ?? account?.name ?? "—",
    projectManagers: report?.projectManagers ?? account?.projectManagers ?? "—",
    technology: report?.technology ?? account?.technology ?? "—",
    domain: report?.domain ?? account?.domain ?? "—",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">GTS Report</h2>
          <p className="text-sm text-[var(--muted)]">
            Month-wise Global Technology Services sheet — sub-projects, features, actual effort,
            UAT defects, and utilization (matches CIBC-style GTS workbook).
          </p>
        </div>
        <Link href="/dashboard/reports" className="btn btn-secondary text-sm">
          Weekly packs
        </Link>
      </div>

      <form method="get" className="panel p-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[200px]">
          <label className="label">Account (GTS Project)</label>
          <select className="input" name="accountId" defaultValue={accountId} required>
            {accounts.length === 0 ? <option value="">No accounts</option> : null}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code ? `${a.code} — ` : ""}
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Year</label>
          <input className="input w-28" name="year" type="number" defaultValue={year} />
        </div>
        <div>
          <label className="label">Month</label>
          <select className="input w-36" name="month" defaultValue={month}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" type="submit">
          Open month
        </button>
      </form>

      {accountId ? (
        <div className="flex flex-wrap gap-1 border-b border-[var(--border)] pb-2">
          {tabs.map((t) => {
            const active = t.year === year && t.month === month;
            const href = `/dashboard/gts-report?accountId=${accountId}&year=${t.year}&month=${t.month}`;
            return (
              <Link
                key={`${t.year}-${t.month}`}
                href={href}
                className={`px-3 py-1.5 text-sm rounded-t-md border border-b-0 ${
                  active
                    ? "bg-[var(--panel-2)] text-white border-[var(--border)]"
                    : "text-[var(--muted)] border-transparent hover:text-white"
                }`}
              >
                {monthTabLabel(t.year, t.month)}
              </Link>
            );
          })}
        </div>
      ) : null}

      {!accountId ? (
        <div className="panel p-6 text-sm text-[var(--muted)]">
          Create an account first under{" "}
          <Link href="/dashboard/accounts" className="text-sky-300 hover:underline">
            Accounts
          </Link>
          .
        </div>
      ) : (
        <>
          {canEdit ? (
            <form action={generateGtsMonthReport} className="panel p-4 flex flex-wrap gap-3 items-end">
              <input type="hidden" name="accountId" value={accountId} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <input type="hidden" name="replaceLines" value="yes" />
              <p className="text-sm text-[var(--muted)] flex-1 min-w-[220px]">
                {report
                  ? "Refresh this month from daily status hours, billing, and client defects. Replaces line rows."
                  : "Generate this month’s GTS sheet from system data (projects → sub-projects)."}
              </p>
              <button className="btn" type="submit">
                {report ? "Refresh from system data" : "Generate GTS month"}
              </button>
            </form>
          ) : null}

          <section className="panel p-4 space-y-3">
            <h3 className="font-semibold">Project characteristics</h3>
            {report && canEdit ? (
              <form action={updateGtsMonthHeader} className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="reportId" value={report.id} />
                <div>
                  <label className="label">Project Name</label>
                  <input
                    className="input"
                    name="projectName"
                    defaultValue={report.projectName ?? account?.code ?? account?.name ?? ""}
                  />
                </div>
                <div>
                  <label className="label">Project Manager</label>
                  <input
                    className="input"
                    name="projectManagers"
                    defaultValue={report.projectManagers ?? account?.projectManagers ?? ""}
                    placeholder="Name1, Name2"
                  />
                </div>
                <div>
                  <label className="label">Technology</label>
                  <input
                    className="input"
                    name="technology"
                    defaultValue={report.technology ?? account?.technology ?? ""}
                    placeholder="JAVA, .NET, React JS"
                  />
                </div>
                <div>
                  <label className="label">Domain</label>
                  <input
                    className="input"
                    name="domain"
                    defaultValue={report.domain ?? account?.domain ?? ""}
                    placeholder="Banking & Finance"
                  />
                </div>
                <div>
                  <label className="label">Overall Billable Resource Utilization %</label>
                  <input
                    className="input"
                    type="number"
                    step="0.1"
                    name="utilizationPct"
                    defaultValue={report.utilizationPct ?? 0}
                  />
                </div>
                <div>
                  <label className="label">Resource Availability %</label>
                  <input
                    className="input"
                    type="number"
                    step="0.1"
                    name="availabilityPct"
                    defaultValue={report.availabilityPct ?? 0}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Header remarks</label>
                  <input className="input" name="remarks" defaultValue={report.remarks ?? ""} />
                </div>
                <div>
                  <button className="btn btn-secondary" type="submit">
                    Save header
                  </button>
                </div>
              </form>
            ) : (
              <dl className="grid gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-[var(--muted)]">Project Name</dt>
                  <dd className="font-medium">{header.projectName}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Project Manager</dt>
                  <dd className="font-medium">{header.projectManagers}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Technology</dt>
                  <dd className="font-medium">{header.technology}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Domain</dt>
                  <dd className="font-medium">{header.domain}</dd>
                </div>
              </dl>
            )}
          </section>

          {!report ? (
            <div className="panel p-6 text-sm text-[var(--muted)]">
              No GTS sheet for {monthTabLabel(year, month)} yet.
              {canEdit ? " Click Generate GTS month to create it." : ""}
            </div>
          ) : (
            <>
              <section className="panel overflow-x-auto p-4 space-y-3">
                <h3 className="font-semibold">
                  Sub-projects · {monthTabLabel(year, month)}
                </h3>
                <table className="table text-sm">
                  <thead>
                    <tr>
                      <th>S.No.</th>
                      <th>Sub Project Name</th>
                      <th>Feature Name</th>
                      <th>UAT Defects (No.)</th>
                      <th>Total Actual efforts (hrs.)</th>
                      <th>Delivered Defect Density</th>
                      <th>Utilization %</th>
                      <th>Availability %</th>
                      <th>Remarks</th>
                      {canEdit ? <th>Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {report.lines.length === 0 ? (
                      <tr>
                        <td colSpan={canEdit ? 10 : 9} className="text-[var(--muted)]">
                          No lines yet.
                        </td>
                      </tr>
                    ) : (
                      report.lines.map((line, idx) => {
                        const ddd = deliveredDefectDensity(line.uatDefects, line.actualEffortHrs);
                        return (
                          <tr key={line.id}>
                            {canEdit ? (
                              <td colSpan={10} className="!p-2 align-top">
                                <form
                                  action={upsertGtsMonthLine}
                                  className="grid gap-2 lg:grid-cols-[2.5rem_1.2fr_1.2fr_5rem_6rem_5rem_5rem_1fr_auto] items-end"
                                >
                                  <input type="hidden" name="reportId" value={report.id} />
                                  <input type="hidden" name="lineId" value={line.id} />
                                  <input type="hidden" name="sortOrder" value={line.sortOrder || idx + 1} />
                                  <div>
                                    <label className="label">#</label>
                                    <p className="py-2">{idx + 1}</p>
                                  </div>
                                  <div>
                                    <label className="label">Sub Project</label>
                                    <input
                                      className="input"
                                      name="subProjectName"
                                      defaultValue={line.subProjectName}
                                      required
                                    />
                                    <select
                                      className="input mt-1"
                                      name="projectId"
                                      defaultValue={line.projectId ?? ""}
                                    >
                                      <option value="">Link project…</option>
                                      {projects.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="label">Feature</label>
                                    <input
                                      className="input"
                                      name="featureName"
                                      defaultValue={line.featureName}
                                    />
                                  </div>
                                  <div>
                                    <label className="label">UAT</label>
                                    <input
                                      className="input"
                                      type="number"
                                      min={0}
                                      name="uatDefects"
                                      defaultValue={line.uatDefects}
                                    />
                                  </div>
                                  <div>
                                    <label className="label">Effort hrs</label>
                                    <input
                                      className="input"
                                      type="number"
                                      step="0.1"
                                      min={0}
                                      name="actualEffortHrs"
                                      defaultValue={line.actualEffortHrs}
                                    />
                                  </div>
                                  <div>
                                    <label className="label">DDD</label>
                                    <p className="py-2 text-xs">{fmtDdd(ddd)}</p>
                                  </div>
                                  <div>
                                    <label className="label">Util / Avail</label>
                                    <p className="py-2 text-xs">
                                      {report.utilizationPct ?? "—"}% / {report.availabilityPct ?? "—"}%
                                    </p>
                                  </div>
                                  <div>
                                    <label className="label">Remarks</label>
                                    <input
                                      className="input"
                                      name="remarks"
                                      defaultValue={line.remarks ?? ""}
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <button className="btn btn-secondary text-sm" type="submit">
                                      Save
                                    </button>
                                  </div>
                                </form>
                                <form action={deleteGtsMonthLine} className="mt-1">
                                  <input type="hidden" name="lineId" value={line.id} />
                                  <button className="text-xs text-rose-300 hover:underline" type="submit">
                                    Delete row
                                  </button>
                                </form>
                              </td>
                            ) : (
                              <>
                                <td>{idx + 1}</td>
                                <td>{line.subProjectName}</td>
                                <td>{line.featureName || "—"}</td>
                                <td>{line.uatDefects}</td>
                                <td>{fmtHrs(line.actualEffortHrs)}</td>
                                <td>{fmtDdd(ddd)}</td>
                                {idx === 0 ? (
                                  <>
                                    <td rowSpan={report.lines.length}>
                                      {report.utilizationPct ?? "—"}%
                                    </td>
                                    <td rowSpan={report.lines.length}>
                                      {report.availabilityPct ?? "—"}%
                                    </td>
                                  </>
                                ) : null}
                                <td>{line.remarks ?? ""}</td>
                              </>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </section>

              {canEdit ? (
                <form action={upsertGtsMonthLine} className="panel p-4 grid gap-3 md:grid-cols-4">
                  <h3 className="md:col-span-4 font-semibold">Add sub-project row</h3>
                  <input type="hidden" name="reportId" value={report.id} />
                  <div>
                    <label className="label">Sub Project Name</label>
                    <input className="input" name="subProjectName" required />
                  </div>
                  <div>
                    <label className="label">Link project</label>
                    <select className="input" name="projectId" defaultValue="">
                      <option value="">Optional</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Feature Name</label>
                    <input className="input" name="featureName" placeholder="Enhancement and Support" />
                  </div>
                  <div>
                    <label className="label">UAT Defects</label>
                    <input className="input" type="number" name="uatDefects" defaultValue={0} min={0} />
                  </div>
                  <div>
                    <label className="label">Actual efforts (hrs)</label>
                    <input
                      className="input"
                      type="number"
                      name="actualEffortHrs"
                      defaultValue={0}
                      step="0.1"
                      min={0}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Remarks</label>
                    <input className="input" name="remarks" />
                  </div>
                  <div className="flex items-end">
                    <button className="btn" type="submit">
                      Add row
                    </button>
                  </div>
                </form>
              ) : null}

              {summary ? (
                <section className="panel p-4">
                  <h3 className="font-semibold mb-3">Month totals</h3>
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                    <div>
                      <dt className="text-[var(--muted)]">Total Actual Billable hrs</dt>
                      <dd className="text-lg font-semibold">{fmtHrs(summary.totalActualEffortHrs)}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">Overall Billable Utilization %</dt>
                      <dd className="text-lg font-semibold">{summary.utilizationPct}%</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">Resource Availability %</dt>
                      <dd className="text-lg font-semibold">{summary.availabilityPct}%</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">Overall DDD (Defects per hrs)</dt>
                      <dd className="text-lg font-semibold">{fmtDdd(summary.overallDdd)}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">Rows</dt>
                      <dd className="text-lg font-semibold">{report.lines.length}</dd>
                    </div>
                  </dl>
                </section>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
