import { teamsEnv } from "./config";

/**
 * Microsoft Graph helpers for proactive app installation.
 *
 * A bot can only DM someone who already has the app installed. Installing it via Graph
 * makes Teams deliver an install event to /api/teams/messages, and our handler captures
 * the conversation reference from that event — which is why nothing here tries to build a
 * ConversationReference by hand (the service URL is region-specific and not knowable here).
 *
 * Requires an application permission on the app registration, granted by a tenant admin:
 *   TeamsAppInstallation.ReadWriteSelfForUser.All  (app published to the org catalog)
 *   TeamsAppInstallation.ReadWriteForUser.All      (broader alternative)
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

export type GraphError = { ok: false; error: string };

async function graphToken(): Promise<string | null> {
  const env = teamsEnv();
  const tenantId = env?.graphTenantId;
  if (!env || !tenantId) return null;

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.appId,
      client_secret: env.appPassword,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });

  if (!res.ok) {
    console.error("[teams] Graph token request failed", res.status, await res.text().catch(() => ""));
    return null;
  }

  const payload = (await res.json()) as { access_token?: string };
  return payload.access_token ?? null;
}

async function graphFetch(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; body: unknown } | GraphError> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, error: `${res.status} ${text.slice(0, 500)}` };
  }
  return { ok: true, body: text ? (JSON.parse(text) as unknown) : null };
}

/** Resolve a Teams/AAD user id from an email address. */
export async function graphUserIdForEmail(email: string): Promise<string | null> {
  const token = await graphToken();
  if (!token) return null;

  const result = await graphFetch(token, `/users/${encodeURIComponent(email)}?$select=id`);
  if (!result.ok) {
    console.error(`[teams] Graph user lookup failed for ${email}: ${result.error}`);
    return null;
  }
  const body = result.body as { id?: string } | null;
  return body?.id ?? null;
}

/** Catalog id of our Teams app, looked up by the manifest's external id. */
export async function graphTeamsAppId(): Promise<string | null> {
  const env = teamsEnv();
  const externalId = env?.teamsAppExternalId;
  if (!externalId) return null;

  const token = await graphToken();
  if (!token) return null;

  const result = await graphFetch(
    token,
    `/appCatalogs/teamsApps?$filter=externalId eq '${encodeURIComponent(externalId)}'&$select=id`,
  );
  if (!result.ok) {
    console.error(`[teams] Graph app catalog lookup failed: ${result.error}`);
    return null;
  }

  const body = result.body as { value?: { id?: string }[] } | null;
  return body?.value?.[0]?.id ?? null;
}

/**
 * Install the app for a user so the bot can DM them.
 *
 * Teams then sends an install event to the bot, which is when we learn the conversation
 * reference. Already-installed is treated as success.
 */
export async function installAppForUser(
  email: string,
): Promise<{ ok: true; alreadyInstalled: boolean } | GraphError> {
  const token = await graphToken();
  if (!token) return { ok: false, error: "Graph credentials or GRAPH_TENANT_ID are not configured" };

  const teamsAppId = await graphTeamsAppId();
  if (!teamsAppId) {
    return {
      ok: false,
      error: "Could not find the app in the org catalog — check TEAMS_APP_EXTERNAL_ID and that the app is published",
    };
  }

  const userId = await graphUserIdForEmail(email);
  if (!userId) return { ok: false, error: `No Azure AD user found for ${email}` };

  const existing = await graphFetch(
    token,
    `/users/${userId}/teamwork/installedApps?$expand=teamsApp&$filter=teamsApp/id eq '${teamsAppId}'`,
  );
  if (existing.ok) {
    const body = existing.body as { value?: unknown[] } | null;
    if ((body?.value?.length ?? 0) > 0) return { ok: true, alreadyInstalled: true };
  }

  const install = await graphFetch(token, `/users/${userId}/teamwork/installedApps`, {
    method: "POST",
    body: JSON.stringify({
      "teamsApp@odata.bind": `${GRAPH}/appCatalogs/teamsApps/${teamsAppId}`,
    }),
  });

  if (!install.ok) {
    // Graph reports a duplicate install as a conflict; that is the outcome we wanted.
    if (install.error.startsWith("409")) return { ok: true, alreadyInstalled: true };
    return install;
  }

  return { ok: true, alreadyInstalled: false };
}
