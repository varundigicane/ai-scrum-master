import { SignJWT, importPKCS8 } from "jose";
import { teamsEnv } from "@/lib/teams/config";

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

function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_EMAIL?.trim() &&
      process.env.GOOGLE_PRIVATE_KEY?.trim() &&
      process.env.GOOGLE_CALENDAR_ID?.trim(),
  );
}

function teamsMeetingConfigured(): boolean {
  const env = teamsEnv();
  return Boolean(env?.graphTenantId && process.env.GRAPH_MEETING_USER_ID?.trim());
}

export function getMeetingProvidersStatus(): MeetingProvidersStatus {
  return {
    google: googleConfigured(),
    teams: teamsMeetingConfigured(),
  };
}

function normalizePrivateKey(raw: string) {
  return raw.replace(/\\n/g, "\n").trim();
}

async function googleAccessToken(): Promise<string | null> {
  const email = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY ? normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY) : "";
  if (!email || !key) return null;

  try {
    const cryptoKey = await importPKCS8(key, "RS256");
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({
      scope: "https://www.googleapis.com/auth/calendar",
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(email)
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

async function createGoogleMeetEvent(input: {
  title: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  attendees: string;
}): Promise<{ meetUrl?: string; eventId?: string; warning?: string }> {
  if (!googleConfigured()) {
    return { warning: "Google Meet is not configured on the server." };
  }

  const token = await googleAccessToken();
  if (!token) {
    return { warning: "Could not authenticate with Google Calendar. Meeting was still saved." };
  }

  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!.trim());
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

async function graphAppToken(): Promise<string | null> {
  const env = teamsEnv();
  if (!env?.graphTenantId) return null;
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${env.graphTenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.appId,
          client_secret: env.appPassword,
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

async function createTeamsOnlineMeeting(input: {
  title: string;
  startsAt: Date;
  endsAt: Date;
}): Promise<{ joinUrl?: string; meetingId?: string; warning?: string }> {
  if (!teamsMeetingConfigured()) {
    return { warning: "Teams meetings are not configured on the server." };
  }

  const token = await graphAppToken();
  if (!token) {
    return { warning: "Could not authenticate with Microsoft Graph. Meeting was still saved." };
  }

  const userId = process.env.GRAPH_MEETING_USER_ID!.trim();
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/onlineMeetings`, {
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
    });

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
    const g = await createGoogleMeetEvent(input);
    if (g.warning) warnings.push(g.warning);
    if (g.meetUrl) googleMeetUrl = g.meetUrl;
    if (g.eventId) googleEventId = g.eventId;
  }

  if (input.createTeamsMeeting && !teamsJoinUrl) {
    const t = await createTeamsOnlineMeeting(input);
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
