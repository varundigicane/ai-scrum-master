import { TeamsActivityHandler, type TurnContext } from "botbuilder";
import { handleTeamsMessage } from "./commands";
import { captureChannelConversation, captureUserConversation } from "./link";
import { helpCard, toAttachment } from "./cards";

/**
 * Teams bot turn handler. Install events are what make proactive messaging possible,
 * so they are captured before anything else can go wrong.
 */
export class ScrumBot extends TeamsActivityHandler {
  constructor() {
    super();

    this.onMessage(async (context, next) => {
      await handleTeamsMessage(context);
      await next();
    });

    this.onConversationUpdate(async (context, next) => {
      await this.captureConversation(context);
      await next();
    });

    this.onMembersAdded(async (context, next) => {
      const botId = context.activity.recipient?.id;
      const botAdded = (context.activity.membersAdded ?? []).some((m) => m.id === botId);
      if (botAdded && context.activity.conversation?.conversationType === "personal") {
        await context.sendActivity({ attachments: [toAttachment(helpCard(false))] });
      }
      await next();
    });
  }

  private async captureConversation(context: TurnContext): Promise<void> {
    try {
      if (context.activity.conversation?.conversationType === "personal") {
        await captureUserConversation(context);
      } else {
        await captureChannelConversation(context);
      }
    } catch (error) {
      console.error("[teams] failed to capture conversation", error);
    }
  }
}

const globalForBot = globalThis as unknown as { scrumBot?: ScrumBot };

export function getScrumBot(): ScrumBot {
  const existing = globalForBot.scrumBot;
  if (existing) return existing;

  const bot = new ScrumBot();
  if (process.env.NODE_ENV !== "production") {
    globalForBot.scrumBot = bot;
  }
  return bot;
}
