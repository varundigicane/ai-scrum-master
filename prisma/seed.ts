import bcrypt from "bcryptjs";
import { addDays } from "date-fns";
import { prisma } from "../src/lib/prisma";

async function main() {
  await prisma.notificationLog.deleteMany();
  await prisma.weeklyReport.deleteMany();
  await prisma.dailyStatusItem.deleteMany();
  await prisma.dailyStatus.deleteMany();
  await prisma.statusRequest.deleteMany();
  await prisma.statusWindow.deleteMany();
  await prisma.rCA.deleteMany();
  await prisma.defect.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.task.deleteMany();
  await prisma.requirement.deleteMany();
  await prisma.leave.deleteMany();
  await prisma.resourceAssignment.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.project.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);

  const company = await prisma.company.create({
    data: {
      name: "Acme Delivery Co",
      timezone: "Asia/Kolkata",
      statusWindowStart: "17:00",
      statusWindowHours: 2,
    },
  });

  const admin = await prisma.user.create({
    data: {
      companyId: company.id,
      email: "admin@acme.local",
      name: "Company Admin",
      passwordHash,
      role: "CompanyAdmin",
    },
  });

  const ceo = await prisma.user.create({
    data: {
      companyId: company.id,
      email: "ceo@acme.local",
      name: "CEO User",
      passwordHash,
      role: "CEO",
    },
  });

  const pm = await prisma.user.create({
    data: {
      companyId: company.id,
      email: "pm@acme.local",
      name: "Priya Manager",
      passwordHash,
      role: "ProjectManager",
    },
  });

  const svp = await prisma.user.create({
    data: {
      companyId: company.id,
      email: "svp@acme.local",
      name: "SVP Delivery",
      passwordHash,
      role: "SVP",
    },
  });

  const vp = await prisma.user.create({
    data: {
      companyId: company.id,
      email: "vp@acme.local",
      name: "VP Accounts",
      passwordHash,
      role: "VP",
    },
  });

  const avp = await prisma.user.create({
    data: {
      companyId: company.id,
      email: "avp@acme.local",
      name: "AVP Delivery",
      passwordHash,
      role: "AVP",
    },
  });

  const account = await prisma.account.create({
    data: { companyId: company.id, name: "Contoso Bank", code: "CONTOSO" },
  });

  const project = await prisma.project.create({
    data: {
      accountId: account.id,
      name: "Mobile Banking Revamp",
      code: "MBR",
      phase: "Dev",
      description: "Rebuild retail mobile banking experience",
      billable: true,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    },
  });

  const project2 = await prisma.project.create({
    data: {
      accountId: account.id,
      name: "KYC Automation",
      code: "KYC",
      phase: "Test",
      billable: true,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    },
  });

  const resUser1 = await prisma.user.create({
    data: {
      companyId: company.id,
      email: "alex@acme.local",
      name: "Alex Dev",
      passwordHash,
      role: "Employee",
    },
  });

  const resUser2 = await prisma.user.create({
    data: {
      companyId: company.id,
      email: "sam@acme.local",
      name: "Sam QA",
      passwordHash,
      role: "Employee",
    },
  });

  const alex = await prisma.resource.create({
    data: {
      companyId: company.id,
      userId: resUser1.id,
      name: "Alex Dev",
      email: "alex@acme.local",
      employeeId: "EMP001",
    },
  });

  const sam = await prisma.resource.create({
    data: {
      companyId: company.id,
      userId: resUser2.id,
      name: "Sam QA",
      email: "sam@acme.local",
      employeeId: "EMP002",
    },
  });

  await prisma.resourceAssignment.createMany({
    data: [
      { projectId: project.id, resourceId: alex.id, capacityPct: 80, hourlyRate: 60, billable: true },
      { projectId: project.id, resourceId: sam.id, capacityPct: 50, hourlyRate: 45, billable: true },
      { projectId: project2.id, resourceId: sam.id, capacityPct: 50, hourlyRate: 45, billable: true },
    ],
  });

  const epic = await prisma.requirement.create({
    data: {
      projectId: project.id,
      title: "Secure login",
      description: "High-level auth requirements",
      level: 1,
    },
  });

  const story = await prisma.requirement.create({
    data: {
      projectId: project.id,
      parentId: epic.id,
      title: "Biometric unlock",
      level: 2,
    },
  });

  const task1 = await prisma.task.create({
    data: {
      projectId: project.id,
      resourceId: alex.id,
      requirementId: story.id,
      title: "Implement FaceID bridge",
      status: "in_progress",
      progressPct: 40,
      estimateHours: 16,
      clientDeadline: addDays(new Date(), 2),
      resourceDeadline: addDays(new Date(), 1),
    },
  });

  await prisma.task.create({
    data: {
      projectId: project.id,
      resourceId: alex.id,
      title: "Session refresh hardening",
      status: "todo",
      progressPct: 0,
      clientDeadline: addDays(new Date(), -1),
      resourceDeadline: addDays(new Date(), -2),
    },
  });

  await prisma.task.create({
    data: {
      projectId: project.id,
      resourceId: sam.id,
      title: "Write biometric regression suite",
      status: "in_progress",
      progressPct: 60,
      clientDeadline: addDays(new Date(), 5),
      resourceDeadline: addDays(new Date(), 3),
    },
  });

  const tc = await prisma.testCase.create({
    data: {
      projectId: project.id,
      requirementId: story.id,
      title: "FaceID unlock on cold start",
      status: "pass",
      steps: "Kill app → reopen → FaceID",
      expected: "Unlocks within 2s",
    },
  });

  const defect = await prisma.defect.create({
    data: {
      projectId: project.id,
      title: "FaceID fails after OS update",
      source: "client_informed",
      severity: "high",
      status: "open",
      taskId: task1.id,
      requirementId: story.id,
      testCaseId: tc.id,
    },
  });

  await prisma.rCA.create({
    data: {
      defectId: defect.id,
      rootCause: "Native SDK version mismatch after OS upgrade",
      correctiveAction: "Pin SDK and add smoke test on OS matrix",
      reviewNotes: "Pending client confirmation",
    },
  });

  await prisma.leave.create({
    data: {
      resourceId: sam.id,
      projectId: project.id,
      type: "client_informed",
      status: "approved",
      startDate: addDays(new Date(), 7),
      endDate: addDays(new Date(), 8),
      reason: "Personal",
    },
  });

  console.log("Seed complete");
  console.log({
    login: "admin@acme.local / password123",
    also: [
      "ceo@acme.local",
      "svp@acme.local",
      "vp@acme.local",
      "avp@acme.local",
      "pm@acme.local",
      "alex@acme.local",
      "sam@acme.local",
    ],
    password: "password123",
    ids: { admin: admin.id, ceo: ceo.id, svp: svp.id, vp: vp.id, avp: avp.id, pm: pm.id },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
