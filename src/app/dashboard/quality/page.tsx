import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/permissions";
import { createRca, createReviewSheet } from "@/app/actions";

export default async function QualityPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await hasFeature(session.user.companyId, session.user.role, "quality"))) {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const sourceFilter = sp.source === "client_informed" || sp.source === "internal" ? sp.source : "";

  const defects = await prisma.defect.findMany({
    where: {
      project: { account: { companyId: session.user.companyId } },
      ...(sourceFilter ? { source: sourceFilter } : {}),
    },
    include: {
      project: { include: { account: true } },
      rca: true,
      reviewSheet: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Quality · RCA &amp; review sheets</h2>
        <p className="text-sm text-[var(--muted)]">
          Root cause analysis and detailed review sheets for internal and client-informed bugs.
        </p>
      </div>

      <form method="get" className="panel p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Source</label>
          <select className="input" name="source" defaultValue={sourceFilter}>
            <option value="">All</option>
            <option value="internal">Internal</option>
            <option value="client_informed">Client informed</option>
          </select>
        </div>
        <button className="btn" type="submit">
          Filter
        </button>
      </form>

      {defects.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No defects yet. Log them on a project page.</p>
      ) : null}

      {defects.map((d) => (
        <article key={d.id} className="panel p-4 space-y-4">
          <div className="flex flex-wrap gap-2 justify-between">
            <div>
              <h3 className="font-semibold">{d.title}</h3>
              <p className="text-xs text-[var(--muted)]">
                {d.project.account.name} / {d.project.name}
              </p>
            </div>
            <div className="flex gap-2">
              <span className="badge">{d.source}</span>
              <span className="badge">{d.severity}</span>
              <span className="badge">{d.status}</span>
            </div>
          </div>

          <details open className="border border-[var(--border)] rounded-xl p-3">
            <summary className="font-medium cursor-pointer">Root cause analysis (RCA)</summary>
            {d.rca ? (
              <div className="mt-3 text-sm space-y-1 text-[var(--muted)]">
                {d.rca.problemStatement ? (
                  <p>
                    <strong className="text-white">Problem:</strong> {d.rca.problemStatement}
                  </p>
                ) : null}
                <p>
                  <strong className="text-white">Root cause:</strong> {d.rca.rootCause}
                </p>
                {d.rca.contributingFactors ? (
                  <p>
                    <strong className="text-white">Contributing:</strong> {d.rca.contributingFactors}
                  </p>
                ) : null}
                {d.rca.impact ? (
                  <p>
                    <strong className="text-white">Impact:</strong> {d.rca.impact}
                  </p>
                ) : null}
                {d.rca.containmentAction ? (
                  <p>
                    <strong className="text-white">Containment:</strong> {d.rca.containmentAction}
                  </p>
                ) : null}
                <p>
                  <strong className="text-white">Corrective:</strong> {d.rca.correctiveAction}
                </p>
                {d.rca.preventiveAction ? (
                  <p>
                    <strong className="text-white">Preventive:</strong> {d.rca.preventiveAction}
                  </p>
                ) : null}
                <p>
                  Status: {d.rca.status}
                  {d.rca.owner ? ` · Owner: ${d.rca.owner}` : ""}
                  {d.rca.targetDate ? ` · Target: ${d.rca.targetDate.toISOString().slice(0, 10)}` : ""}
                </p>
              </div>
            ) : null}
            <form action={createRca} className="mt-3 grid gap-2 md:grid-cols-2">
              <input type="hidden" name="defectId" value={d.id} />
              <input type="hidden" name="projectId" value={d.projectId} />
              <input
                className="input md:col-span-2"
                name="problemStatement"
                placeholder="Problem statement"
                defaultValue={d.rca?.problemStatement ?? ""}
              />
              <input
                className="input md:col-span-2"
                name="rootCause"
                placeholder="Root cause *"
                required
                defaultValue={d.rca?.rootCause ?? ""}
              />
              <input
                className="input md:col-span-2"
                name="contributingFactors"
                placeholder="Contributing factors"
                defaultValue={d.rca?.contributingFactors ?? ""}
              />
              <input className="input" name="impact" placeholder="Impact" defaultValue={d.rca?.impact ?? ""} />
              <input
                className="input"
                name="containmentAction"
                placeholder="Containment action"
                defaultValue={d.rca?.containmentAction ?? ""}
              />
              <input
                className="input md:col-span-2"
                name="correctiveAction"
                placeholder="Corrective action *"
                required
                defaultValue={d.rca?.correctiveAction ?? ""}
              />
              <input
                className="input md:col-span-2"
                name="preventiveAction"
                placeholder="Preventive action"
                defaultValue={d.rca?.preventiveAction ?? ""}
              />
              <input className="input" name="owner" placeholder="RCA owner" defaultValue={d.rca?.owner ?? ""} />
              <input
                className="input"
                type="date"
                name="targetDate"
                defaultValue={d.rca?.targetDate?.toISOString().slice(0, 10) ?? ""}
              />
              <select className="input" name="status" defaultValue={d.rca?.status ?? "draft"}>
                <option value="draft">Draft</option>
                <option value="in_progress">In progress</option>
                <option value="pending_review">Pending review</option>
                <option value="closed">Closed</option>
              </select>
              <input
                className="input"
                name="reviewedBy"
                placeholder="Reviewed by"
                defaultValue={d.rca?.reviewedBy ?? ""}
              />
              <input
                className="input md:col-span-2"
                name="reviewNotes"
                placeholder="RCA review notes"
                defaultValue={d.rca?.reviewNotes ?? ""}
              />
              <button className="btn w-fit" type="submit">
                Save RCA
              </button>
            </form>
          </details>

          <details open className="border border-[var(--border)] rounded-xl p-3">
            <summary className="font-medium cursor-pointer">Detailed review sheet</summary>
            {d.reviewSheet ? (
              <div className="mt-3 text-sm text-[var(--muted)] space-y-1">
                <p>
                  Reviewer: {d.reviewSheet.reviewerName ?? "—"} · Type: {d.reviewSheet.reviewType}
                </p>
                <p>
                  Checks: code {d.reviewSheet.codeReviewDone ? "✓" : "✗"} · test{" "}
                  {d.reviewSheet.testReviewDone ? "✓" : "✗"} · docs{" "}
                  {d.reviewSheet.documentationUpdated ? "✓" : "✗"} · client comms{" "}
                  {d.reviewSheet.clientCommunication ? "✓" : "✗"} · regression{" "}
                  {d.reviewSheet.regressionCovered ? "✓" : "✗"}
                </p>
                {d.reviewSheet.findings ? <p>Findings: {d.reviewSheet.findings}</p> : null}
                {d.reviewSheet.actionItems ? <p>Actions: {d.reviewSheet.actionItems}</p> : null}
                {d.reviewSheet.signOff ? <p>Sign-off: {d.reviewSheet.signOff}</p> : null}
              </div>
            ) : null}
            <form action={createReviewSheet} className="mt-3 grid gap-2 md:grid-cols-2">
              <input type="hidden" name="defectId" value={d.id} />
              <input type="hidden" name="projectId" value={d.projectId} />
              <input
                className="input"
                name="reviewerName"
                placeholder="Reviewer name"
                defaultValue={d.reviewSheet?.reviewerName ?? ""}
              />
              <select
                className="input"
                name="reviewType"
                defaultValue={d.reviewSheet?.reviewType ?? (d.source === "client_informed" ? "client" : "internal")}
              >
                <option value="internal">Internal review</option>
                <option value="client">Client-informed review</option>
              </select>
              <input
                className="input md:col-span-2"
                name="scopeSummary"
                placeholder="Scope summary"
                defaultValue={d.reviewSheet?.scopeSummary ?? ""}
              />
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" name="codeReviewDone" defaultChecked={d.reviewSheet?.codeReviewDone} /> Code
                review done
              </label>
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" name="testReviewDone" defaultChecked={d.reviewSheet?.testReviewDone} /> Test
                review done
              </label>
              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  name="documentationUpdated"
                  defaultChecked={d.reviewSheet?.documentationUpdated}
                />{" "}
                Documentation updated
              </label>
              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  name="clientCommunication"
                  defaultChecked={d.reviewSheet?.clientCommunication}
                />{" "}
                Client communication done
              </label>
              <label className="text-sm flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  name="regressionCovered"
                  defaultChecked={d.reviewSheet?.regressionCovered}
                />{" "}
                Regression coverage verified
              </label>
              <textarea
                className="input md:col-span-2 min-h-20"
                name="findings"
                placeholder="Findings"
                defaultValue={d.reviewSheet?.findings ?? ""}
              />
              <textarea
                className="input md:col-span-2 min-h-20"
                name="actionItems"
                placeholder="Action items"
                defaultValue={d.reviewSheet?.actionItems ?? ""}
              />
              <input
                className="input md:col-span-2"
                name="residualRisk"
                placeholder="Residual risk"
                defaultValue={d.reviewSheet?.residualRisk ?? ""}
              />
              <input
                className="input md:col-span-2"
                name="signOff"
                placeholder="Sign-off name"
                defaultValue={d.reviewSheet?.signOff ?? ""}
              />
              <button className="btn w-fit" type="submit">
                Save review sheet
              </button>
            </form>
          </details>

          <Link className="text-sm text-sky-300" href={`/dashboard/projects/${d.projectId}`}>
            Open project →
          </Link>
        </article>
      ))}
    </div>
  );
}
