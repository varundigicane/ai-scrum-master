import { isAiParseEnabled } from "./config";
import { statusInputSchema, type StatusInput, type StatusTask } from "./status-write";

/**
 * Free-text understanding for the Teams agent.
 *
 * Returns null whenever AI is unavailable or the model output cannot be trusted, so
 * every caller falls back to the Adaptive Card form. Nothing here writes to the database.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

type ChatMessage = { role: "system" | "user"; content: string };

async function chatJson(messages: ChatMessage[], maxTokens = 700): Promise<unknown | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error("[teams] OpenAI error", res.status, await res.text().catch(() => ""));
      return null;
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as unknown;
  } catch (error) {
    console.error("[teams] OpenAI request failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const PARSE_SYSTEM = `You convert a short work update from an engineer into JSON for a daily status report.

Rules:
- Output only JSON matching: {"productiveHours":number,"nonProductiveHours":number,"narrative":string,"blockers":string,"progressPct":number|null,"items":[{"taskId":string,"progressPct":number|null,"hours":number,"notes":string}]}
- productiveHours is time spent on delivery work; nonProductiveHours covers meetings, admin, idle or blocked time.
- Total hours should not exceed 24. If the update gives no hours at all, use 8 productive and 0 non-productive.
- items[].taskId MUST be one of the provided task ids. Never invent an id. Omit items entirely if no task is clearly referenced.
- blockers must be "" unless the person actually reports being blocked or waiting on something.
- narrative is a one or two sentence summary in the third person.
- progressPct is the person's overall sense of progress today, or null if not stated.`;

export type ParseResult =
  | { ok: true; parsed: StatusInput }
  | { ok: false; reason: "disabled" | "unavailable" | "invalid" };

export async function parseStatusUpdate(
  text: string,
  tasks: StatusTask[],
): Promise<ParseResult> {
  if (!isAiParseEnabled()) return { ok: false, reason: "disabled" };

  const taskList = tasks
    .slice(0, 40)
    .map((t) => `- id=${t.id} ref=${t.displayId ?? "none"} title=${t.title} project=${t.projectName} progress=${t.progressPct}%`)
    .join("\n");

  const raw = await chatJson([
    { role: "system", content: PARSE_SYSTEM },
    {
      role: "user",
      content: `Open tasks assigned to this person:\n${taskList || "(none)"}\n\nUpdate:\n${text}`,
    },
  ]);
  if (raw === null) return { ok: false, reason: "unavailable" };

  const parsed = statusInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  // Drop any task the model hallucinated, and refuse absurd hour totals.
  const allowed = new Set(tasks.map((t) => t.id));
  const items = (parsed.data.items ?? []).filter((item) => !item.taskId || allowed.has(item.taskId));
  const total = parsed.data.productiveHours + parsed.data.nonProductiveHours;
  if (total <= 0 || total > 24) return { ok: false, reason: "invalid" };

  return {
    ok: true,
    parsed: {
      ...parsed.data,
      items,
      narrative: parsed.data.narrative?.trim() || text.trim(),
      blockers: parsed.data.blockers?.trim() ? parsed.data.blockers.trim() : undefined,
    },
  };
}

/** Optional one-line summary for standup and weekly cards. Falls back to null. */
export async function summarizeForLead(
  title: string,
  metrics: Record<string, unknown>,
): Promise<string | null> {
  if (!isAiParseEnabled()) return null;

  const raw = await chatJson(
    [
      {
        role: "system",
        content:
          'Summarize delivery metrics for a busy manager in at most two sentences. Call out risk explicitly. Respond as JSON: {"summary":string}',
      },
      { role: "user", content: `${title}\n${JSON.stringify(metrics)}` },
    ],
    200,
  );

  if (raw && typeof raw === "object" && "summary" in raw) {
    const summary = (raw as { summary?: unknown }).summary;
    if (typeof summary === "string" && summary.trim()) return summary.trim();
  }
  return null;
}
