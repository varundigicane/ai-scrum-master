/**
 * Environment-level Teams/bot configuration.
 *
 * Per-company behaviour (enabled, chase, reminder timing) lives in the TeamsConfig
 * table; this module only covers process-wide credentials that must not be in the DB.
 */

export type TeamsEnv = {
  appId: string;
  appPassword: string;
  appType: string;
  appTenantId: string;
  /** External id from the Teams app manifest, needed for Graph install lookups. */
  teamsAppExternalId?: string;
  graphTenantId?: string;
};

export function teamsEnv(): TeamsEnv | null {
  const appId = process.env.MICROSOFT_APP_ID;
  const appPassword = process.env.MICROSOFT_APP_PASSWORD;
  if (!appId || !appPassword) return null;

  return {
    appId,
    appPassword,
    appType: process.env.MICROSOFT_APP_TYPE ?? "MultiTenant",
    appTenantId: process.env.MICROSOFT_APP_TENANT_ID ?? "",
    teamsAppExternalId: process.env.TEAMS_APP_EXTERNAL_ID,
    graphTenantId: process.env.GRAPH_TENANT_ID ?? process.env.MICROSOFT_APP_TENANT_ID,
  };
}

/** True when bot credentials are present, i.e. the Teams layer can talk to Azure at all. */
export function isTeamsConfigured(): boolean {
  return teamsEnv() !== null;
}

export function isAiParseEnabled(): boolean {
  return process.env.AI_PARSE_ENABLED === "true" && Boolean(process.env.OPENAI_API_KEY);
}
