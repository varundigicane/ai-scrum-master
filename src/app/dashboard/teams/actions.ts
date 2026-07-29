"use server";

import { revalidatePath } from "next/cache";
import { assertFeature } from "@/lib/assert-feature";
import { prisma } from "@/lib/prisma";
import { isTeamsConfigured } from "@/lib/teams/config";
import { installAppForUser } from "@/lib/teams/graph";
import { getTeamsConfig } from "@/lib/teams/link";
import { sendTeamsMessage, targetFromChannel, targetFromIdentity } from "@/lib/teams/notify";
import { runAllTeamsRelays } from "@/lib/teams/relay";
import { card } from "@/lib/teams/cards";

function refresh() {
  revalidatePath("/dashboard/teams");
}

export async function updateTeamsConfig(formData: FormData) {
  const session = await assertFeature("manage_teams");
  const companyId = session.user.companyId;

  await getTeamsConfig(companyId);
  await prisma.teamsConfig.update({
    where: { companyId },
    data: {
      enabled: formData.get("enabled") === "on",
      chaseEnabled: formData.get("chaseEnabled") === "on",
      tenantId: String(formData.get("tenantId") ?? "").trim() || null,
      reminderMinutesBefore: Math.max(0, Number(formData.get("reminderMinutesBefore") ?? 30) || 0),
    },
  });

  refresh();
}

export async function linkResourceIdentity(formData: FormData) {
  const session = await assertFeature("manage_teams");
  const companyId = session.user.companyId;

  const identityId = String(formData.get("identityId") ?? "");
  const resourceId = String(formData.get("resourceId") ?? "");

  const identity = await prisma.teamsIdentity.findFirst({ where: { id: identityId, companyId } });
  if (!identity) throw new Error("Teams identity not found");

  if (!resourceId) {
    await prisma.teamsIdentity.update({
      where: { id: identity.id },
      data: { resourceId: null, userId: null },
    });
    refresh();
    return;
  }

  const resource = await prisma.resource.findFirst({
    where: { id: resourceId, companyId },
    select: { id: true, email: true, userId: true },
  });
  if (!resource) throw new Error("Resource not found");

  await prisma.teamsIdentity.update({
    where: { id: identity.id },
    data: { resourceId: resource.id, userId: resource.userId, upn: identity.upn ?? resource.email },
  });

  refresh();
}

export async function setIdentityMuted(formData: FormData) {
  const session = await assertFeature("manage_teams");
  const companyId = session.user.companyId;

  const identityId = String(formData.get("identityId") ?? "");
  const identity = await prisma.teamsIdentity.findFirst({ where: { id: identityId, companyId } });
  if (!identity) throw new Error("Teams identity not found");

  await prisma.teamsIdentity.update({
    where: { id: identity.id },
    data: { optedOut: !identity.optedOut },
  });

  refresh();
}

export async function deleteIdentity(formData: FormData) {
  const session = await assertFeature("manage_teams");
  const companyId = session.user.companyId;

  const identityId = String(formData.get("identityId") ?? "");
  await prisma.teamsIdentity.deleteMany({ where: { id: identityId, companyId } });

  refresh();
}

export async function updateChannelLink(formData: FormData) {
  const session = await assertFeature("manage_teams");
  const companyId = session.user.companyId;

  const linkId = String(formData.get("linkId") ?? "");
  const link = await prisma.teamsChannelLink.findFirst({ where: { id: linkId, companyId } });
  if (!link) throw new Error("Channel link not found");

  const notifyTypes = formData
    .getAll("notifyTypes")
    .map((value) => String(value))
    .join(",");

  await prisma.teamsChannelLink.update({
    where: { id: link.id },
    data: {
      projectId: String(formData.get("projectId") ?? "") || null,
      notifyTypes,
      active: formData.get("active") === "on",
    },
  });

  refresh();
}

export async function deleteChannelLink(formData: FormData) {
  const session = await assertFeature("manage_teams");
  const companyId = session.user.companyId;

  const linkId = String(formData.get("linkId") ?? "");
  await prisma.teamsChannelLink.deleteMany({ where: { id: linkId, companyId } });

  refresh();
}

export async function sendTeamsTestMessage(formData: FormData) {
  const session = await assertFeature("manage_teams");
  const companyId = session.user.companyId;

  if (!isTeamsConfigured()) throw new Error("Teams bot credentials are not configured");

  const kind = String(formData.get("kind") ?? "identity");
  const targetId = String(formData.get("targetId") ?? "");

  const target =
    kind === "channel"
      ? await prisma.teamsChannelLink
          .findFirst({ where: { id: targetId, companyId } })
          .then((link) => (link ? targetFromChannel(link) : null))
      : await prisma.teamsIdentity
          .findFirst({ where: { id: targetId, companyId } })
          .then((identity) => (identity ? targetFromIdentity(identity) : null));

  if (!target) throw new Error("No conversation stored for that target yet");

  await sendTeamsMessage({
    companyId,
    type: "test_message",
    dedupeKey: `test:${Date.now()}`,
    skipDedupe: true,
    targets: [target],
    card: card([
      { type: "TextBlock", text: "Test message", weight: "Bolder", size: "Medium", wrap: true },
      {
        type: "TextBlock",
        text: `Sent from AI Scrum Master by ${session.user.name}. If you can see this, proactive messaging works.`,
        wrap: true,
      },
    ]),
    summary: "Admin test message",
  });

  refresh();
}

export async function runTeamsRelayNow() {
  const session = await assertFeature("manage_teams");
  await runAllTeamsRelays(session.user.companyId);
  refresh();
}

/**
 * Push the Teams app to a resource who has never opened it. Teams then sends the bot an
 * install event, which is what creates their TeamsIdentity and makes DMs possible.
 */
export async function installTeamsAppForResource(formData: FormData) {
  const session = await assertFeature("manage_teams");
  const companyId = session.user.companyId;

  const resourceId = String(formData.get("resourceId") ?? "");
  const resource = await prisma.resource.findFirst({
    where: { id: resourceId, companyId },
    select: { email: true, name: true },
  });
  if (!resource) throw new Error("Resource not found");

  const result = await installAppForUser(resource.email);
  if (!result.ok) {
    throw new Error(`Could not install for ${resource.name}: ${result.error}`);
  }

  refresh();
}
