import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  type ConversationReference,
  type Request as BotRequest,
  type Response as BotResponse,
  type TurnContext,
} from "botbuilder";
import { teamsEnv } from "./config";

const globalForTeams = globalThis as unknown as { teamsAdapter?: CloudAdapter };

function createAdapter(): CloudAdapter {
  const env = teamsEnv();
  if (!env) {
    throw new Error("MICROSOFT_APP_ID and MICROSOFT_APP_PASSWORD are required for the Teams bot");
  }

  const auth = new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: env.appId,
    MicrosoftAppPassword: env.appPassword,
    MicrosoftAppType: env.appType,
    MicrosoftAppTenantId: env.appTenantId,
  });

  const adapter = new CloudAdapter(auth);
  adapter.onTurnError = async (context, error) => {
    console.error("[teams] unhandled turn error", error);
    try {
      await context.sendActivity("Something went wrong on my side. Please try again.");
    } catch {
      // Sending the apology can itself fail (expired conversation); nothing more to do.
    }
  };
  return adapter;
}

export function getTeamsAdapter(): CloudAdapter {
  const existing = globalForTeams.teamsAdapter;
  if (existing) return existing;

  const adapter = createAdapter();
  if (process.env.NODE_ENV !== "production") {
    globalForTeams.teamsAdapter = adapter;
  }
  return adapter;
}

/**
 * CloudAdapter.process expects an Express/Restify style req/res pair. The App Router
 * hands us a web Request and expects a Response back, so we shim both sides and
 * capture what the adapter writes.
 */
export async function processTeamsActivity(
  req: Request,
  logic: (context: TurnContext) => Promise<void>,
): Promise<{ status: number; body?: unknown }> {
  const rawBody = await req.text();
  let parsedBody: Record<string, unknown> = {};
  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { status: 400, body: "Invalid JSON body" };
    }
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const botReq: BotRequest = {
    body: parsedBody,
    headers,
    method: req.method,
  };

  const captured: { status: number; body?: unknown } = { status: 200 };
  const botRes: BotResponse = {
    socket: undefined,
    status(code: number) {
      captured.status = code;
      return code;
    },
    send(...args: unknown[]) {
      captured.body = args[0];
      return args[0];
    },
    header() {
      return undefined;
    },
    end() {
      return undefined;
    },
  };

  try {
    await getTeamsAdapter().process(botReq, botRes, logic);
  } catch (error) {
    // The adapter validates the activity shape before its own error handling kicks in, so
    // a malformed payload escapes as a throw. Answer with 400 rather than a 500 stack.
    console.error("[teams] rejected malformed activity", error);
    return { status: 400, body: "Invalid activity" };
  }
  return captured;
}

/** Send a proactive message into a stored conversation (DM or channel). */
export async function continueTeamsConversation(
  conversationRef: Partial<ConversationReference>,
  logic: (context: TurnContext) => Promise<void>,
): Promise<void> {
  const env = teamsEnv();
  if (!env) throw new Error("Teams bot is not configured");
  await getTeamsAdapter().continueConversationAsync(env.appId, conversationRef, logic);
}
