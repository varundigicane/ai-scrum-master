import { SignJWT, importPKCS8 } from "jose";
import { resolveMeetingProviderConfig } from "@/lib/company-config";

export type MeetingProvidersStatus = {
  google: boolean;
  teams: boolean;
};

export type ProvisionResult = {
  googleMeetUrl?: string;
  googleEventId?: string;
  teamsJoinUrl?: string;
  teamsMeetingId?: string;
  warnings: string[];
};

export async function getMeetingProvidersStatus(companyId: string): Promise<MeetingProvidersStatus> {
  const cfg = await resolveMeetingProviderConfig(companyId);
  return { google: cfg.google, teams: cfg.teams };
}

async function googleAccessToken(clientEmail: string, privateKey: string): Promise<string | null> {
  try {
    const cryptoKey = await importPKCS8(privateKey, "RS256");
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({
      scope: "https://www.googleapis.com/auth/calendar",
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(clientEmail)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(cryptoKey);

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function createGoogleMeetEvent(
  companyId: string,
  input: {
    title: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
    attendees: string;
  },
): Promise<{ meetUrl?: string; eventId?: string; warning?: string }> {
  const cfg = await resolveMeetingProviderConfig(companyId);
  if (!cfg.google || !cfg.googleClientEmail || !cfg.googlePrivateKey || !cfg.googleCalendarId) {
    return { warning: "Google Meet is not configured for this company." };
  }

  const token = await googleAccessToken(cfg.googleClientEmail, cfg.googlePrivateKey);
  if (!token) {
    return { warning: "Could not authenticate with Google Calendar. Meeting was still saved." };
  }

  const calendarId = encodeURIComponent(cfg.googleCalendarId);
  const attendeeEmails = input.attendees
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"))
    .slice(0, 20)
    .map((email) => ({ email }));

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: input.title,
          start: { dateTime: input.startsAt.toISOString(), timeZone: input.timezone },
          end: { dateTime: input.endsAt.toISOString(), timeZone: input.timezone },
          attendees: attendeeEmails.length ? attendeeEmails : undefined,
          conferenceData: {
            createRequest: {
              requestId: `asm-${Date.now()}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      },
    );

    if (!res.ok) {
      return { warning: "Google Meet could not be created. Meeting was still saved — paste a link if needed." };
    }

    const data = (await res.json()) as {
      id?: string;
      hangoutLink?: string;
      conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
    };
    const meetUrl =
      data.hangoutLink ||
      data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
    return { meetUrl: meetUrl || undefined, eventId: data.id };
  } catch {
    return { warning: "Google Meet could not be created. Meeting was still saved." };
  }
}

async function graphAppToken(teams: {
  appId: string;
  appPassword: string;
  graphTenantId?: string;
}): Promise<string | null> {
  if (!teams.graphTenantId) return null;
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${teams.graphTenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: teams.appId,
          client_secret: teams.appPassword,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function createTeamsOnlineMeeting(
  companyId: string,
  input: { title: string; startsAt: Date; endsAt: Date },
): Promise<{ joinUrl?: string; meetingId?: string; warning?: string }> {
  const cfg = await resolveMeetingProviderConfig(companyId);
  if (!cfg.teams || !cfg.teamsEnv || !cfg.graphMeetingUserId) {
    return { warning: "Teams meetings are not configured for this company." };
  }

  const token = await graphAppToken(cfg.teamsEnv);
  if (!token) {
    return { warning: "Could not authenticate with Microsoft Graph. Meeting was still saved." };
  }

  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.graphMeetingUserId)}/onlineMeetings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: input.title,
          startDateTime: input.startsAt.toISOString(),
          endDateTime: input.endsAt.toISOString(),
        }),
      },
    );

    if (!res.ok) {
      return {
        warning:
          "Teams meeting could not be created (check Graph OnlineMeetings permission). Meeting was still saved.",
      };
    }

    const data = (await res.json()) as { id?: string; joinWebUrl?: string };
    return { joinUrl: data.joinWebUrl, meetingId: data.id };
  } catch {
    return { warning: "Teams meeting could not be created. Meeting was still saved." };
  }
}

/** Soft-fail: never throws; returns warnings when providers fail or are unset. */
export async function provisionMeetingLinks(input: {
  companyId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  attendees: string;
  createGoogleMeet: boolean;
  createTeamsMeeting: boolean;
  pastedMeetUrl?: string;
  pastedTeamsUrl?: string;
}): Promise<ProvisionResult> {
  const warnings: string[] = [];
  let googleMeetUrl = input.pastedMeetUrl?.trim() || undefined;
  let teamsJoinUrl = input.pastedTeamsUrl?.trim() || undefined;
  let googleEventId: string | undefined;
  let teamsMeetingId: string | undefined;

  if (input.createGoogleMeet && !googleMeetUrl) {
    const g = await createGoogleMeetEvent(input.companyId, input);
    if (g.warning) warnings.push(g.warning);
    if (g.meetUrl) googleMeetUrl = g.meetUrl;
    if (g.eventId) googleEventId = g.eventId;
  }

  if (input.createTeamsMeeting && !teamsJoinUrl) {
    const t = await createTeamsOnlineMeeting(input.companyId, input);
    if (t.warning) warnings.push(t.warning);
    if (t.joinUrl) teamsJoinUrl = t.joinUrl;
    if (t.meetingId) teamsMeetingId = t.meetingId;
  }

  return { googleMeetUrl, googleEventId, teamsJoinUrl, teamsMeetingId, warnings };
}

export function composeMeetingLocation(parts: {
  room?: string;
  googleMeetUrl?: string;
  teamsJoinUrl?: string;
}): string | null {
  const chunks: string[] = [];
  if (parts.room?.trim()) chunks.push(parts.room.trim());
  if (parts.googleMeetUrl?.trim()) chunks.push(`Meet: ${parts.googleMeetUrl.trim()}`);
  if (parts.teamsJoinUrl?.trim()) chunks.push(`Teams: ${parts.teamsJoinUrl.trim()}`);
  return chunks.length ? chunks.join(" | ") : null;
}
