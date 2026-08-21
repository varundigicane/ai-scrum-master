/** Digicane hex palette + chart types (client-safe; no Prisma). */

export type ChartSlice = { name: string; value: number };

export type OverviewReminderItem = {
  id: string;
  noteId: string;
  noteTitle: string;
  dueAt: string;
  note: string;
  kind: "reminder" | "meeting";
  overdue: boolean;
};

export type OverviewChartsData = {
  kpis: {
    accounts: number;
    projects: number;
    resources: number;
    overdueTasks: number;
    openDefects: number;
    pendingStatus: number;
    dueSoonReminders: number;
    overdueReminders: number;
  };
  rag: ChartSlice[];
  phases: ChartSlice[];
  defectSeverity: ChartSlice[];
  taskStatus: ChartSlice[];
  statusToday: ChartSlice[];
  reminders: {
    dueSoon: number;
    overdue: number;
    items: OverviewReminderItem[];
  };
};

export const OVERVIEW_COLORS = {
  accent: "#0D9488",
  accent2: "#0284C7",
  ok: "#059669",
  warn: "#D97706",
  danger: "#E11D48",
  muted: "#5B738C",
  rag: { Red: "#E11D48", Amber: "#D97706", Green: "#059669" } as Record<string, string>,
  severity: {
    low: "#059669",
    medium: "#D97706",
    high: "#EA580C",
    critical: "#E11D48",
  } as Record<string, string>,
  phase: {
    Requirements: "#0284C7",
    Design: "#0EA5E9",
    Dev: "#0D9488",
    Test: "#059669",
    UAT: "#D97706",
    Closed: "#5B738C",
  } as Record<string, string>,
  taskStatus: {
    todo: "#0284C7",
    in_progress: "#0D9488",
    blocked: "#E11D48",
    done: "#059669",
  } as Record<string, string>,
  statusState: {
    submitted: "#059669",
    pending: "#D97706",
    expired: "#E11D48",
    skipped_leave: "#5B738C",
  } as Record<string, string>,
} as const;
