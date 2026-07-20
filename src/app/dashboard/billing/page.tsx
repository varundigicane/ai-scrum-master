import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMonthlyBilling, HOURS_PER_DAY } from "@/lib/billing";
import { saveBillingMonthOverride } from "@/app/actions";

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year ?? now.getFullYear());
  const month = Number(sp.month ?? now.getMonth() + 1);

  const override = await prisma.billingMonthOverride.findUnique({
    where: {
      companyId_year_month: {
        companyId: session!.user.companyId,
        year,
        month,
      },
    },
  });

  const billing = await buildMonthlyBilling({
    companyId: session!.user.companyId,
    year,
    month,
  });

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Billing</h2>
        <p className="text-sm text-[var(--muted)] mt-1">
          Rate is <strong>per hour</strong>. Day = {HOURS_PER_DAY}h. Rate applies only when the
          resource is <strong>billable on that project</strong>.{" "}
          <code className="text-teal-300">
            billing = rate × {HOURS_PER_DAY} × billable_days
          </code>
          {" · "}
          <code className="text-teal-300">
            billable_days = working_days − leaves + extra_days
          </code>
        </p>
      </div>

      <form className="panel p-4 flex flex-wrap gap-3 items-end" method="get">
        <div>
          <label className="label">Year</label>
          <input className="input w-28" name="year" type="number" defaultValue={year} />
        </div>
        <div>
          <label className="label">Month</label>
          <select className="input w-36" name="month" defaultValue={month}>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" type="submit">
          View month
        </button>
      </form>

      <form action={saveBillingMonthOverride} className="panel p-4 grid gap-3 md:grid-cols-4">
        <h3 className="md:col-span-4 font-semibold text-sm">
          Optional: override total working days for {year}-{String(month).padStart(2, "0")}
        </h3>
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month} />
        <div>
          <label className="label">Total working days</label>
          <input
            className="input"
            name="totalWorkingDays"
            type="number"
            min={0}
            max={31}
            defaultValue={override?.totalWorkingDays ?? ""}
            placeholder="e.g. 22"
            required
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">Note</label>
          <input className="input" name="note" defaultValue={override?.note ?? ""} />
        </div>
        <div className="flex items-end">
          <button className="btn btn-secondary" type="submit">
            Save override
          </button>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="text-xs uppercase text-[var(--muted)]">Grand total (month)</p>
          <p className="text-2xl font-semibold mt-1">{money(billing.grandTotal)}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase text-[var(--muted)]">Billable lines</p>
          <p className="text-2xl font-semibold mt-1">{billing.lines.length}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase text-[var(--muted)]">Accounts billed</p>
          <p className="text-2xl font-semibold mt-1">{billing.byAccount.length}</p>
        </div>
      </div>

      <section className="panel overflow-x-auto p-4">
        <h3 className="font-semibold mb-3">Account totals (bill raised)</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Total billing</th>
            </tr>
          </thead>
          <tbody>
            {billing.byAccount.map((a) => (
              <tr key={a.accountId}>
                <td>{a.accountName}</td>
                <td>{money(a.totalBilling)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel overflow-x-auto p-4">
        <h3 className="font-semibold mb-3">Project-wise billing</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Project</th>
              <th>Resources</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {billing.byProject.map((p) => (
              <tr key={p.projectId}>
                <td>{p.accountName}</td>
                <td>{p.projectName}</td>
                <td>{p.resources}</td>
                <td>{money(p.totalBilling)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel overflow-x-auto p-4">
        <h3 className="font-semibold mb-3">Resource-wise totals</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Resource</th>
              <th>Total billing</th>
            </tr>
          </thead>
          <tbody>
            {billing.byResource.map((r) => (
              <tr key={r.resourceId}>
                <td>{r.employeeId ?? "—"}</td>
                <td>{r.resourceName}</td>
                <td>{money(r.totalBilling)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel overflow-x-auto p-4">
        <h3 className="font-semibold mb-3">Detail (resource × project)</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Emp ID</th>
              <th>Resource</th>
              <th>Account</th>
              <th>Project</th>
              <th>Billable?</th>
              <th>Rate/hr</th>
              <th>Working</th>
              <th>Leaves</th>
              <th>Extras</th>
              <th>Billable days</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {billing.lines.map((l) => (
              <tr key={`${l.resourceId}-${l.projectId}`}>
                <td>{l.employeeId ?? "—"}</td>
                <td>{l.resourceName}</td>
                <td>{l.accountName}</td>
                <td>{l.projectName}</td>
                <td>
                  <span className="badge">{l.assignmentBillable ? "Yes" : "No"}</span>
                </td>
                <td>{l.assignmentBillable ? money(l.hourlyRate) : "—"}</td>
                <td>{l.totalWorkingDays}</td>
                <td>{l.leaveDays}</td>
                <td>{l.extraWorkingDays}</td>
                <td>{l.assignmentBillable ? l.billableDays : "—"}</td>
                <td>{money(l.billingAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {billing.lines.length === 0 ? (
          <p className="text-sm text-[var(--muted)] mt-3">
            No lines. Ensure projects are billable, resources are assigned with Billable=Yes and a
            rate, and project dates cover this month.
          </p>
        ) : null}
      </section>
    </div>
  );
}
