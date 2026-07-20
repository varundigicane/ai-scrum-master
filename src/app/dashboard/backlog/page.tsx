import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/permissions";

export default async function BacklogHubPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const canSee =
    (await hasFeature(session.user.companyId, session.user.role, "backlog")) ||
    (await hasFeature(session.user.companyId, session.user.role, "projects"));
  if (!canSee) redirect("/dashboard");

  const projects = await prisma.project.findMany({
    where: { account: { companyId: session.user.companyId }, active: true },
    include: {
      account: true,
      _count: { select: { requirements: true, tasks: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Epic / Story / Task</h2>
        <p className="text-sm text-[var(--muted)]">
          Choose a project to add, update, delete, and assign Epics, Features, Stories, Tasks, and
          Subtasks.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="panel p-6">
          <p className="text-sm text-[var(--muted)]">
            No projects yet. Create a project under{" "}
            <Link href="/dashboard/projects" className="text-sky-300 hover:underline">
              Projects
            </Link>{" "}
            first.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <div key={p.id} className="panel p-4 flex flex-col gap-3">
              <div>
                <p className="text-xs text-[var(--muted)]">{p.account.name}</p>
                <h3 className="font-semibold text-lg">{p.name}</h3>
                <p className="text-xs text-[var(--muted)] mt-1">
                  {p._count.requirements} backlog items · {p._count.tasks} tasks · Phase {p.phase}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/dashboard/projects/${p.id}/backlog`} className="btn text-sm">
                  Manage Epic / Story / Task
                </Link>
                <Link href={`/dashboard/projects/${p.id}`} className="btn btn-secondary text-sm">
                  Project details
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
