import { TeamsInfo, TurnContext, type Activity, type ConversationReference } from "botbuilder";
import { prisma } from "@/lib/prisma";
import type { TeamsConfig, TeamsIdentity } from "@/generated/prisma/client";

/** Per-company Teams settings, created lazily on first use. */
export async function getTeamsConfig(companyId: string): Promise<TeamsConfig> {
  const existing = await prisma.teamsConfig.findUnique({ where: { companyId } });
  if (existing) return existing;
  return prisma.teamsConfig.create({ data: { companyId } });
}

export async function isTeamsEnabledForCompany(companyId: string): Promise<boolean> {
  const config = await prisma.teamsConfig.findUnique({ where: { companyId } });
  return Boolean(config?.enabled);
}

function tenantIdOf(activity: Partial<Activity>): string | null {
  const channelData = activity.channelData as { tenant?: { id?: string } } | undefined;
  return channelData?.tenant?.id ?? null;
}

/**
 * Which company an inbound activity belongs to.
 *
 * Preferred match is the tenant id recorded on TeamsConfig. When a single company has
 * Teams enabled and has not recorded a tenant yet, adopt this tenant for it — that covers
 * the common single-tenant install without asking an admin to copy a GUID first.
 */
export async function resolveCompanyId(activity: Partial<Activity>): Promise<string | null> {
  const tenantId = tenantIdOf(activity);
  if (tenantId) {
    const byTenant = await prisma.teamsConfig.findFirst({ where: { tenantId, enabled: true } });
    if (byTenant) return byTenant.companyId;
  }

  const enabled = await prisma.teamsConfig.findMany({ where: { enabled: true } });
  if (enabled.length !== 1) return null;

  const only = enabled[0];
  if (tenantId && !only.tenantId) {
    await prisma.teamsConfig.update({ where: { id: only.id }, data: { tenantId } });
  }
  if (only.tenantId && tenantId && only.tenantId !== tenantId) return null;
  return only.companyId;
}

/** Look up the Teams user behind an activity. Returns null when the user is not linked yet. */
export async function resolveIdentity(activity: Partial<Activity>): Promise<TeamsIdentity | null> {
  const aadObjectId = activity.from?.aadObjectId;
  if (!aadObjectId) return null;

  const companyId = await resolveCompanyId(activity);
  if (!companyId) return null;

  return prisma.teamsIdentity.findUnique({
    where: { companyId_aadObjectId: { companyId, aadObjectId } },
  });
}

function serializeRef(context: TurnContext): string {
  return JSON.stringify(TurnContext.getConversationReference(context.activity));
}

export function parseConversationRef(json: string): Partial<ConversationReference> {
  return JSON.parse(json) as Partial<ConversationReference>;
}

/**
 * Record (or refresh) the conversation we can proactively message a user through.
 * Called on every inbound personal activity so a re-installed app self-heals.
 */
export async function captureUserConversation(context: TurnContext): Promise<TeamsIdentity | null> {
  const activity = context.activity;
  const aadObjectId = activity.from?.aadObjectId;
  if (!aadObjectId) return null;

  const companyId = await resolveCompanyId(activity);
  if (!companyId) return null;

  const tenantId = tenantIdOf(activity) ?? "";
  const upn = await teamsMemberEmail(context);

  // Only a personal chat gives us a reference we can DM through later; a channel
  // reference would send "your daily status" to the whole team.
  const isPersonal = activity.conversation?.conversationType === "personal";
  const dmFields = isPersonal
    ? {
        conversationId: activity.conversation?.id,
        serviceUrl: activity.serviceUrl,
        conversationRef: serializeRef(context),
        installedAt: new Date(),
      }
    : {};

  return prisma.teamsIdentity.upsert({
    where: { companyId_aadObjectId: { companyId, aadObjectId } },
    create: {
      companyId,
      aadObjectId,
      tenantId,
      upn,
      displayName: activity.from?.name,
      ...dmFields,
    },
    update: {
      tenantId: tenantId || undefined,
      upn: upn ?? undefined,
      displayName: activity.from?.name,
      ...dmFields,
    },
  });
}

/** Teams only exposes the user's email via the roster API, not on the activity. */
async function teamsMemberEmail(context: TurnContext): Promise<string | undefined> {
  const userId = context.activity.from?.id;
  if (!userId) return undefined;
  try {
    const member = await TeamsInfo.getMember(context, userId);
    return member.email ?? member.userPrincipalName ?? undefined;
  } catch {
    // Roster reads fail outside Teams (e.g. Emulator) or without the right permissions.
    return undefined;
  }
}

/** Record a team/channel/group chat so relayed notifications have somewhere to go. */
export async function captureChannelConversation(context: TurnContext): Promise<void> {
  const activity = context.activity;
  const companyId = await resolveCompanyId(activity);
  if (!companyId) return;

  const conversationId = activity.conversation?.id;
  const serviceUrl = activity.serviceUrl;
  if (!conversationId || !serviceUrl) return;

  const channelData = activity.channelData as
    | { team?: { id?: string; name?: string }; channel?: { id?: string; name?: string } }
    | undefined;

  const conversationRef = serializeRef(context);
  const scope = activity.conversation?.conversationType ?? "channel";
  const name = channelData?.channel?.name ?? channelData?.team?.name ?? activity.conversation?.name;

  await prisma.teamsChannelLink.upsert({
    where: { companyId_conversationId: { companyId, conversationId } },
    create: {
      companyId,
      scope,
      teamId: channelData?.team?.id,
      channelId: channelData?.channel?.id,
      conversationId,
      serviceUrl,
      conversationRef,
      name,
    },
    update: { serviceUrl, conversationRef, name, active: true },
  });
}

export type LinkCandidate = { resourceId: string; resourceName: string; email: string };

/**
 * Find the Resource an unlinked Teams user probably is, by email.
 * Never links automatically — the caller asks the user to confirm first.
 */
export async function findLinkCandidate(
  companyId: string,
  email: string | null | undefined,
): Promise<LinkCandidate | null> {
  if (!email) return null;

  const resource = await prisma.resource.findFirst({
    where: { companyId, email: { equals: email, mode: "insensitive" }, active: true },
    select: { id: true, name: true, email: true },
  });
  if (!resource) return null;

  const taken = await prisma.teamsIdentity.findUnique({ where: { resourceId: resource.id } });
  if (taken) return null;

  return { resourceId: resource.id, resourceName: resource.name, email: resource.email };
}

/** Bind a Teams identity to a Resource (and the linked User, when there is one). */
export async function linkIdentityToResource(
  identityId: string,
  resourceId: string,
): Promise<TeamsIdentity> {
  const resource = await prisma.resource.findUniqueOrThrow({
    where: { id: resourceId },
    select: { id: true, email: true, userId: true },
  });

  return prisma.teamsIdentity.update({
    where: { id: identityId },
    data: { resourceId: resource.id, userId: resource.userId, upn: resource.email },
  });
}
