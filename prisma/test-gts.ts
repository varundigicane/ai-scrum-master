import { prisma } from "../src/lib/prisma";
import { buildGtsMonthDraft } from "../src/lib/gts-report";

async function main() {
  const account =
    (await prisma.account.findFirst({
      where: { active: true, projects: { some: { active: true } } },
      include: { projects: { where: { active: true } } },
    })) ??
    (await prisma.account.findFirst({
      where: { active: true },
      include: { projects: { where: { active: true } } },
    }));
  if (!account) throw new Error("No account");
  console.log("account", account.name, "projects", account.projects.length);

  await prisma.account.update({
    where: { id: account.id },
    data: {
      technology: account.technology ?? "JAVA, .NET, React JS",
      domain: account.domain ?? "Banking & Finance",
      projectManagers: account.projectManagers ?? "Demo PM",
      code: account.code ?? "DEMO-GTS",
    },
  });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const draft = await buildGtsMonthDraft({
    companyId: account.companyId,
    accountId: account.id,
    year,
    month,
  });
  console.log("draft lines", draft.lines.length);
  console.log("utilization", draft.utilizationPct, "availability", draft.availabilityPct);
  console.log("totalActual", draft.totalActualEffortHrs);

  // Upsert a frozen report like the Generate action
  const report = await prisma.gtsMonthlyReport.upsert({
    where: {
      accountId_year_month: { accountId: account.id, year, month },
    },
    create: {
      companyId: account.companyId,
      accountId: account.id,
      year,
      month,
      projectName: draft.projectName,
      projectManagers: draft.projectManagers,
      technology: draft.technology,
      domain: draft.domain,
      utilizationPct: draft.utilizationPct,
      availabilityPct: draft.availabilityPct,
    },
    update: {
      utilizationPct: draft.utilizationPct,
      availabilityPct: draft.availabilityPct,
    },
  });
  await prisma.gtsMonthlyLine.deleteMany({ where: { reportId: report.id } });
  if (draft.lines.length) {
    await prisma.gtsMonthlyLine.createMany({
      data: draft.lines.map((l, i) => ({
        reportId: report.id,
        projectId: l.projectId,
        sortOrder: i + 1,
        subProjectName: l.subProjectName,
        featureName: l.featureName,
        uatDefects: l.uatDefects,
        actualEffortHrs: l.actualEffortHrs,
      })),
    });
  }
  const count = await prisma.gtsMonthlyLine.count({ where: { reportId: report.id } });
  console.log("saved report", report.id, "lines", count);

  // HTTP page check
  const BASE = process.env.APP_URL ?? "http://localhost:3000";
  const jar = new Map<string, string>();
  const store = (res: Response) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  store(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: cookie() },
    body: new URLSearchParams({
      csrfToken,
      email: "admin@acme.local",
      password: "password123",
      callbackUrl: `${BASE}/dashboard`,
      json: "true",
    }),
    redirect: "manual",
  });
  store(loginRes);
  const page = await fetch(
    `${BASE}/dashboard/gts-report?accountId=${account.id}&year=${year}&month=${month}`,
    { headers: { cookie: cookie() }, redirect: "manual" },
  );
  console.log("gts page status", page.status);
  if (page.status !== 200) throw new Error(`GTS page ${page.status}`);
  console.log("GTS smoke OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
