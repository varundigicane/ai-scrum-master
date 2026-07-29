import type { TeamsChannelLink, TeamsIdentity } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { continueTeamsConversation } from "./adapter";
import { toAttachment, type AdaptiveCard } from "./cards";
import { parseConversationRef } from "./link";
import { isTeamsConfigured } from "./config";

export type TeamsTarget = {
  /** Stable id used to keep the dedupe key unique per recipient. */
  id: string;
  label: string;
  conversationRef: string;
};

export function targetFromIdentity(identity: TeamsIdentity): TeamsTarget | null {
  if (!identity.conversationRef || identity.optedOut) return null;
  return {
    id: identity.id,
    label: identity.displayName ?? identity.upn ?? identity.aadObjectId,
    conversationRef: identity.conversationRef,
  };
}

export function targetFromChannel(link: TeamsChannelLink): TeamsTarget {
  return {
    id: link.id,
    label: link.name ?? link.conversationId,
    conversationRef: link.conversationRef,
  };
}

/**
 * Send a card or text to one or more Teams conversations, at most once per
 * (company, dedupeKey, target). Mirrors the contract of sendEmail but logs to
 * TeamsMessageLog so the email dedupe table is untouched.
 *
 * Never throws: a Teams outage must not break the job that called it.
 */
export async function sendTeamsMessage(args: {
  companyId: string;
  type: string;
  dedupeKey: string;
  targets: TeamsTarget[];
  card?: AdaptiveCard;
  text?: string;
  summary?: string;
  skipDedupe?: boolean;
}): Promise<number> {
  if (!isTeamsConfigured() || args.targets.length === 0) return 0;

  let sent = 0;

  for (const target of args.targets) {
    const dedupeKey = `${args.dedupeKey}#${target.id}`;

    if (!args.skipDedupe) {
      const existing = await prisma.teamsMessageLog.findUnique({
        where: { companyId_dedupeKey: { companyId: args.companyId, dedupeKey } },
      });
      if (existing) continue;
    }

    try {
      await continueTeamsConversation(parseConversationRef(target.conversationRef), async (context) => {
        if (args.card) {
          await context.sendActivity({ attachments: [toAttachment(args.card)] });
        }
        if (args.text) {
          await context.sendActivity(args.text);
        }
      });
    } catch (error) {
      console.error(`[teams] send failed (${args.type} -> ${target.label})`, error);
      continue;
    }

    try {
      await prisma.teamsMessageLog.create({
        data: {
          companyId: args.companyId,
          type: args.type,
          dedupeKey,
          target: target.label,
          payloadSummary: args.summary ?? args.text?.slice(0, 500),
        },
      });
    } catch {
      // Unique violation means a concurrent run logged it; the message still went out.
    }
    sent += 1;
  }

  return sent;
}

/** Channel links that opted into a notification type, optionally scoped to a project. */
export async function channelTargetsFor(
  companyId: string,
  type: string,
  projectId?: string | null,
): Promise<TeamsTarget[]> {
  const links = await prisma.teamsChannelLink.findMany({
    where: {
      companyId,
      active: true,
      ...(projectId ? { OR: [{ projectId }, { projectId: null }] } : {}),
    },
  });

  return links
    .filter((link) =>
      link.notifyTypes
        .split(",")
        .map((t) => t.trim())
        .includes(type),
    )
    .map(targetFromChannel);
}

/** DM targets for the leads who normally receive project alert emails. */
export async function leadTargets(companyId: string): Promise<TeamsTarget[]> {
  const leads = await prisma.user.findMany({
    where: {
      companyId,
      active: true,
      role: { in: ["ProjectManager", "AVP", "VP"] },
    },
    select: { id: true },
  });
  if (leads.length === 0) return [];

  const identities = await prisma.teamsIdentity.findMany({
    where: { companyId, userId: { in: leads.map((l) => l.id) }, optedOut: false },
  });

  return identities.map(targetFromIdentity).filter((t): t is TeamsTarget => t !== null);
}

export async function identityTargetForResource(
  companyId: string,
  resourceId: string,
): Promise<TeamsTarget | null> {
  const identity = await prisma.teamsIdentity.findUnique({ where: { resourceId } });
  if (!identity || identity.companyId !== companyId) return null;
  return targetFromIdentity(identity);
}
