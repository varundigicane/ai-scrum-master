import { CardFactory, type Attachment } from "botbuilder";
import type { StatusContext, StatusInput, StatusTask } from "./status-write";

export type AdaptiveCard = Record<string, unknown>;

/** Teams caps card payload size; a very long backlog would blow past it. */
const MAX_TASK_INPUTS = 12;

const SCHEMA = {
  type: "AdaptiveCard",
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  version: "1.4",
} as const;

export function card(body: unknown[], actions: unknown[] = []): AdaptiveCard {
  return { ...SCHEMA, body, ...(actions.length ? { actions } : {}) };
}

export function toAttachment(value: AdaptiveCard): Attachment {
  return CardFactory.adaptiveCard(value);
}

function heading(text: string, subtitle?: string): unknown[] {
  const body: unknown[] = [{ type: "TextBlock", text, weight: "Bolder", size: "Medium", wrap: true }];
  if (subtitle) {
    body.push({ type: "TextBlock", text: subtitle, isSubtle: true, wrap: true, spacing: "None" });
  }
  return body;
}

function numberInput(id: string, label: string, value: number, max = 24): unknown {
  return {
    type: "Input.Number",
    id,
    label,
    min: 0,
    max,
    value,
  };
}

export function taskLabel(task: StatusTask): string {
  return task.displayId ? `${task.displayId} · ${task.title}` : task.title;
}

/** The daily status form, mirroring the fields on the web StatusForm. */
export function dailyStatusCard(context: StatusContext): AdaptiveCard {
  const existing = context.existing;
  const selectedProjectId = existing?.projectId ?? context.tasks[0]?.projectId ?? "";
  const visibleTasks = context.tasks
    .filter((t) => !selectedProjectId || t.projectId === selectedProjectId)
    .slice(0, MAX_TASK_INPUTS);

  const body: unknown[] = [
    ...heading(
      existing ? "Update your daily status" : "Daily status",
      `Window closes at ${context.expiresAt.toLocaleString()}`,
    ),
    {
      type: "ColumnSet",
      columns: [
        {
          type: "Column",
          width: "stretch",
          items: [numberInput("productiveHours", "Productive hours", existing?.productiveHours ?? 6)],
        },
        {
          type: "Column",
          width: "stretch",
          items: [
            numberInput(
              "nonProductiveHours",
              "Non-productive hours",
              existing?.nonProductiveHours ?? 2,
            ),
          ],
        },
      ],
    },
  ];

  if (context.projects.length > 0) {
    body.push({
      type: "Input.ChoiceSet",
      id: "projectId",
      label: "Primary project today",
      value: selectedProjectId,
      choices: context.projects.map((p) => ({ title: p.name, value: p.id })),
    });
  }

  body.push(numberInput("progressPct", "Overall progress %", existing?.progressPct ?? 50, 100));

  if (visibleTasks.length > 0) {
    body.push({
      type: "TextBlock",
      text: "Task progress %",
      weight: "Bolder",
      spacing: "Medium",
      wrap: true,
    });
    for (const task of visibleTasks) {
      body.push({
        type: "Input.Number",
        id: `task_${task.id}`,
        label: taskLabel(task),
        min: 0,
        max: 100,
        value: task.progressPct,
      });
    }
    if (context.tasks.length > visibleTasks.length) {
      body.push({
        type: "TextBlock",
        text: `Showing ${visibleTasks.length} of ${context.tasks.length} open tasks. Use the web form for the rest.`,
        isSubtle: true,
        wrap: true,
      });
    }
  }

  body.push(
    {
      type: "Input.Text",
      id: "narrative",
      label: "What did you work on?",
      isMultiline: true,
      value: existing?.narrative ?? "",
    },
    {
      type: "Input.Text",
      id: "blockers",
      label: "Blockers",
      placeholder: "Leave blank if none",
      isMultiline: true,
      value: existing?.blockers ?? "",
    },
  );

  return card(body, [
    {
      type: "Action.Submit",
      title: existing ? "Update status" : "Submit status",
      data: { action: "status_submit", requestId: context.requestId },
    },
  ]);
}

export function statusSavedCard(args: {
  isUpdate: boolean;
  productiveHours: number;
  nonProductiveHours: number;
  blockers?: string | null;
}): AdaptiveCard {
  const facts: unknown[] = [
    { title: "Productive", value: `${args.productiveHours}h` },
    { title: "Non-productive", value: `${args.nonProductiveHours}h` },
  ];
  if (args.blockers?.trim()) facts.push({ title: "Blockers", value: args.blockers.trim() });

  return card(
    [
      ...heading(args.isUpdate ? "Status updated" : "Status submitted", "Thanks — your leads can see it now."),
      { type: "FactSet", facts },
    ],
    [{ type: "Action.Submit", title: "Edit", data: { action: "status_open" } }],
  );
}

export function taskListCard(tasks: StatusTask[]): AdaptiveCard {
  if (tasks.length === 0) {
    return card(heading("No open tasks", "Nothing assigned to you is currently open."));
  }

  const shown = tasks.slice(0, 20);
  const body: unknown[] = [
    ...heading("Your open tasks", `${tasks.length} open`),
    {
      type: "FactSet",
      facts: shown.map((t) => ({ title: taskLabel(t), value: `${t.progressPct}% · ${t.projectName}` })),
    },
    {
      type: "Input.ChoiceSet",
      id: "taskId",
      label: "Update a task",
      choices: shown.map((t) => ({ title: taskLabel(t), value: t.id })),
    },
    { type: "Input.Number", id: "progressPct", label: "Progress %", min: 0, max: 100, value: 50 },
  ];

  return card(body, [
    { type: "Action.Submit", title: "Save progress", data: { action: "task_progress" } },
  ]);
}

export function linkConfirmCard(candidate: {
  resourceId: string;
  resourceName: string;
  email: string;
}): AdaptiveCard {
  return card(
    heading(
      "Is this you?",
      `I found ${candidate.resourceName} (${candidate.email}) in AI Scrum Master. Confirm so I can attach your updates to that person.`,
    ),
    [
      {
        type: "Action.Submit",
        title: "Yes, that's me",
        data: { action: "link_confirm", resourceId: candidate.resourceId },
      },
      { type: "Action.Submit", title: "No", data: { action: "link_reject" } },
    ],
  );
}

/** Live view of who has not submitted yet, with a nudge button for leads. */
export function missingNowCard(args: {
  dateLabel: string;
  expiresLabel: string;
  pending: { name: string; email: string }[];
  windowId: string;
}): AdaptiveCard {
  if (args.pending.length === 0) {
    return card(heading(`Everyone has submitted — ${args.dateLabel}`));
  }

  return card(
    [
      ...heading(
        `Not submitted yet — ${args.dateLabel} (${args.pending.length})`,
        `Window closes at ${args.expiresLabel}`,
      ),
      { type: "FactSet", facts: args.pending.map((p) => ({ title: p.name, value: p.email })) },
    ],
    [
      {
        type: "Action.Submit",
        title: "Nudge them",
        data: { action: "nudge_missing", windowId: args.windowId },
      },
    ],
  );
}

/** Preview of an LLM-parsed update. Nothing is written until the user confirms. */
export function parsePreviewCard(parsed: StatusInput, tasks: StatusTask[]): AdaptiveCard {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const facts: unknown[] = [
    { title: "Productive", value: `${parsed.productiveHours}h` },
    { title: "Non-productive", value: `${parsed.nonProductiveHours}h` },
  ];
  if (parsed.progressPct != null) facts.push({ title: "Overall progress", value: `${parsed.progressPct}%` });
  for (const item of parsed.items ?? []) {
    const task = item.taskId ? byId.get(item.taskId) : undefined;
    const name = task ? taskLabel(task) : (item.taskTitle ?? "Task");
    facts.push({ title: name, value: item.progressPct != null ? `${item.progressPct}%` : `${item.hours}h` });
  }
  if (parsed.blockers?.trim()) facts.push({ title: "Blockers", value: parsed.blockers.trim() });

  const body: unknown[] = [
    ...heading("Here's what I understood", "Confirm to save, or open the form to adjust."),
    { type: "FactSet", facts },
  ];
  if (parsed.narrative?.trim()) {
    body.push({ type: "TextBlock", text: parsed.narrative.trim(), wrap: true, spacing: "Medium" });
  }

  return card(body, [
    {
      type: "Action.Submit",
      title: "Confirm and save",
      data: { action: "parse_confirm", parsed: JSON.stringify(parsed) },
    },
    { type: "Action.Submit", title: "Open the form", data: { action: "status_open" } },
  ]);
}

export function statusChaseCard(context: StatusContext, webUrl: string): AdaptiveCard {
  return card(
    [
      ...heading(
        `Daily status due, ${context.resourceName}`,
        `Submit by ${context.expiresAt.toLocaleString()}. You can also just tell me what you did today.`,
      ),
    ],
    [
      { type: "Action.Submit", title: "Submit here", data: { action: "status_open" } },
      { type: "Action.OpenUrl", title: "Open web form", url: webUrl },
    ],
  );
}

export function reminderCard(minutesLeft: number): AdaptiveCard {
  return card(
    heading(
      "Status window closing soon",
      `About ${minutesLeft} minute(s) left to submit today's status.`,
    ),
    [{ type: "Action.Submit", title: "Submit now", data: { action: "status_open" } }],
  );
}

export function blockerAlertCard(args: {
  resourceName: string;
  blockers: string;
  projectName?: string | null;
  dashboardUrl: string;
}): AdaptiveCard {
  return card(
    [
      ...heading(`Blocker flagged: ${args.resourceName}`, args.projectName ?? undefined),
      { type: "TextBlock", text: args.blockers, wrap: true },
    ],
    [{ type: "Action.OpenUrl", title: "Open status dashboard", url: args.dashboardUrl }],
  );
}

export function statusSubmittedCard(args: {
  resourceName: string;
  productiveHours: number;
  nonProductiveHours: number;
  narrative?: string | null;
  isUpdate: boolean;
}): AdaptiveCard {
  const body: unknown[] = [
    ...heading(
      `Status ${args.isUpdate ? "updated" : "submitted"}: ${args.resourceName}`,
      `Productive ${args.productiveHours}h · Non-productive ${args.nonProductiveHours}h`,
    ),
  ];
  if (args.narrative?.trim()) {
    body.push({ type: "TextBlock", text: args.narrative.trim(), wrap: true });
  }
  return card(body);
}

export function missedStatusCard(args: {
  dateLabel: string;
  closedAtLabel: string;
  missing: { name: string; email: string }[];
  dashboardUrl: string;
}): AdaptiveCard {
  return card(
    [
      ...heading(
        `Missing daily status — ${args.dateLabel} (${args.missing.length})`,
        `Window closed at ${args.closedAtLabel}`,
      ),
      {
        type: "FactSet",
        facts: args.missing.map((m) => ({ title: m.name, value: m.email })),
      },
    ],
    [{ type: "Action.OpenUrl", title: "Open status dashboard", url: args.dashboardUrl }],
  );
}

export function deadlineCard(args: {
  title: string;
  taskLabel: string;
  projectName: string;
  track: "client" | "resource";
  deadlineLabel: string;
  ownerName: string;
  progressPct: number;
}): AdaptiveCard {
  return card([
    ...heading(args.title, `${args.taskLabel} · ${args.projectName}`),
    {
      type: "FactSet",
      facts: [
        { title: `${args.track} deadline`, value: args.deadlineLabel },
        { title: "Owner", value: args.ownerName },
        { title: "Progress", value: `${args.progressPct}%` },
      ],
    },
  ]);
}

export function standupCard(args: {
  dateLabel: string;
  submitted: number;
  expected: number;
  productiveHours: number;
  blockers: { name: string; text: string }[];
  missing: string[];
  narrative?: string | null;
}): AdaptiveCard {
  const body: unknown[] = [
    ...heading(`Standup — ${args.dateLabel}`),
    {
      type: "FactSet",
      facts: [
        { title: "Submitted", value: `${args.submitted}/${args.expected}` },
        { title: "Productive hours", value: `${args.productiveHours}` },
        { title: "Blockers", value: `${args.blockers.length}` },
      ],
    },
  ];

  if (args.narrative?.trim()) {
    body.push({ type: "TextBlock", text: args.narrative.trim(), wrap: true, spacing: "Medium" });
  }
  if (args.missing.length) {
    body.push({
      type: "TextBlock",
      text: `Not submitted: ${args.missing.join(", ")}`,
      wrap: true,
      isSubtle: true,
    });
  }
  if (args.blockers.length) {
    body.push({
      type: "FactSet",
      facts: args.blockers.map((b) => ({ title: b.name, value: b.text })),
    });
  }

  return card(body);
}

export function weeklyDigestCard(args: {
  title: string;
  narrative: string;
  metrics: Record<string, unknown>;
  reportsUrl: string;
}): AdaptiveCard {
  return card(
    [
      ...heading(args.title),
      { type: "TextBlock", text: args.narrative, wrap: true },
      {
        type: "FactSet",
        facts: Object.entries(args.metrics).map(([key, value]) => ({
          title: key,
          value: value == null ? "—" : String(value),
        })),
      },
    ],
    [{ type: "Action.OpenUrl", title: "Open weekly reports", url: args.reportsUrl }],
  );
}

export function leaveApprovalCard(args: {
  leaveId: string;
  resourceName: string;
  startLabel: string;
  endLabel: string;
  reason?: string | null;
}): AdaptiveCard {
  return card(
    [
      ...heading(`Leave request: ${args.resourceName}`, `${args.startLabel} → ${args.endLabel}`),
      ...(args.reason ? [{ type: "TextBlock", text: args.reason, wrap: true }] : []),
    ],
    [
      {
        type: "Action.Submit",
        title: "Approve",
        data: { action: "leave_approve", leaveId: args.leaveId },
      },
      {
        type: "Action.Submit",
        title: "Reject",
        data: { action: "leave_reject", leaveId: args.leaveId },
      },
    ],
  );
}

export function helpCard(canLead: boolean): AdaptiveCard {
  const everyone = [
    "**status** — open today's status form",
    "Just describe your day, e.g. *6h on ACME-12, 2h meetings, blocked on VPN access*",
    "**my tasks** — your open tasks, with progress updates",
    "**update ACME-3 70%** — set progress on one task",
    "**blocker <text>** — raise a blocker right away",
    "**leave 2026-08-03 to 2026-08-05 reason** — request leave",
    "**mute** / **unmute** — stop or resume my direct messages",
  ];
  const leads = [
    "**standup** — today's submissions, hours and blockers",
    "**missing** — who has not submitted yet, with a nudge button",
    "**report project <name>** — weekly metrics and RAG",
  ];

  const body: unknown[] = [
    ...heading("What I can do"),
    { type: "TextBlock", text: everyone.map((l) => `- ${l}`).join("\n"), wrap: true },
  ];
  if (canLead) {
    body.push(
      { type: "TextBlock", text: "For leads", weight: "Bolder", spacing: "Medium", wrap: true },
      { type: "TextBlock", text: leads.map((l) => `- ${l}`).join("\n"), wrap: true },
    );
  }
  return card(body);
}
