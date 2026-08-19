import { toFriendlyError } from "@/lib/friendly-error";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

type ChatMessage = { role: "system" | "user"; content: string };

async function chatJson(messages: ChatMessage[], maxTokens = 2000): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("AI features are unavailable. Configure OPENAI_API_KEY and try again.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[meeting-ai] OpenAI error", res.status, body);
      throw new Error("The AI service returned an error. Please try again shortly.");
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("The AI service returned an empty response.");
    return JSON.parse(content) as unknown;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("AI features")) throw error;
    if (error instanceof Error && error.message.startsWith("The AI service")) throw error;
    throw new Error(toFriendlyError(error, "AI generation failed. Please try again."));
  } finally {
    clearTimeout(timeout);
  }
}

export type MeetingSummaryResult = {
  summaryMd: string;
  decisions: string[];
  actionItems: string[];
};

export async function generateMeetingSummaryAi(input: {
  title: string;
  attendees: string;
  rawNotes: string;
}): Promise<MeetingSummaryResult> {
  const raw = (await chatJson([
    {
      role: "system",
      content:
        "You summarize business meeting notes for software delivery teams. Output JSON: {\"summaryMd\":string,\"decisions\":string[],\"actionItems\":string[]}. summaryMd is markdown with sections Overview, Decisions, Risks, Next steps.",
    },
    {
      role: "user",
      content: `Title: ${input.title}\nAttendees: ${input.attendees}\nNotes:\n${input.rawNotes}`,
    },
  ])) as Partial<MeetingSummaryResult>;

  return {
    summaryMd: String(raw.summaryMd ?? "").trim() || "No summary generated.",
    decisions: Array.isArray(raw.decisions) ? raw.decisions.map(String) : [],
    actionItems: Array.isArray(raw.actionItems) ? raw.actionItems.map(String) : [],
  };
}

export type ProposalAiResult = { title: string; bodyHtml: string };

export async function generateProposalAi(input: {
  title: string;
  summaryMd: string;
  rawNotes: string;
}): Promise<ProposalAiResult> {
  const raw = (await chatJson(
    [
      {
        role: "system",
        content:
          "You write a concise business software proposal from meeting notes. Output JSON: {\"title\":string,\"bodyHtml\":string}. bodyHtml uses simple HTML tags (h2,p,ul,li,strong) only — no scripts.",
      },
      {
        role: "user",
        content: `Meeting: ${input.title}\nSummary:\n${input.summaryMd}\nNotes:\n${input.rawNotes}`,
      },
    ],
    3000,
  )) as Partial<ProposalAiResult>;

  return {
    title: String(raw.title ?? `${input.title} — Software Proposal`).trim(),
    bodyHtml: String(raw.bodyHtml ?? "<p>Proposal draft unavailable.</p>").trim(),
  };
}

export type FrAiItem = {
  title: string;
  description: string;
  priority: string;
  kindHint: string;
  parentTitle?: string | null;
};

export async function generateFunctionalRequirementsAi(input: {
  proposalTitle: string;
  bodyHtml: string;
}): Promise<FrAiItem[]> {
  const raw = (await chatJson(
    [
      {
        role: "system",
        content:
          'Convert a software proposal into hierarchical work items. Output JSON: {"items":[{"title":string,"description":string,"priority":"must"|"should"|"could","kindHint":"epic"|"feature"|"story"|"task"|"subtask","parentTitle":string|null}]}. Create a sensible epic → feature → story → task tree. Limit to 40 items.',
      },
      {
        role: "user",
        content: `Proposal: ${input.proposalTitle}\n${input.bodyHtml.replace(/<[^>]+>/g, " ").slice(0, 12000)}`,
      },
    ],
    3500,
  )) as { items?: FrAiItem[] };

  const items = Array.isArray(raw.items) ? raw.items : [];
  return items.slice(0, 40).map((item, index) => ({
    title: String(item.title ?? `Requirement ${index + 1}`).trim(),
    description: String(item.description ?? "").trim(),
    priority: ["must", "should", "could"].includes(String(item.priority))
      ? String(item.priority)
      : "should",
    kindHint: ["epic", "feature", "story", "task", "subtask"].includes(String(item.kindHint))
      ? String(item.kindHint)
      : "story",
    parentTitle: item.parentTitle ? String(item.parentTitle) : null,
  }));
}
