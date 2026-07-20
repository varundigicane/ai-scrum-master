import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/permissions";

export async function getProjectAccess(projectId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const project = await prisma.project.findFirst({
    where: { id: projectId, account: { companyId: session.user.companyId } },
    include: {
      account: true,
      assignments: { include: { resource: true } },
    },
  });
  if (!project) throw new Error("Project not found");

  const canEditAll =
    session.user.role === "CompanyAdmin" ||
    (await hasFeature(session.user.companyId, session.user.role, "edit_delivery")) ||
    ["CEO", "SVP", "VP", "AVP", "ProjectManager"].includes(session.user.role);

  const myResource = await prisma.resource.findFirst({
    where: {
      companyId: session.user.companyId,
      OR: [{ userId: session.user.id }, { email: session.user.email }],
      assignments: { some: { projectId, active: true } },
    },
  });

  return {
    session,
    project,
    canEditAll,
    /** Assigned resource on this project (employee) — can update own tasks */
    myResource,
    canManageBacklog: canEditAll,
    canUpdateOwnTasks: Boolean(myResource) || canEditAll,
  };
}
