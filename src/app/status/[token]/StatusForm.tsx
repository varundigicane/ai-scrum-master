"use client";

import { useMemo, useState } from "react";

type TaskOption = {
  id: string;
  title: string;
  progressPct: number;
  projectId: string;
  projectName: string;
};

type Props = {
  token: string;
  resourceName: string;
  expiresAt: string;
  tasks: TaskOption[];
  existing?: {
    productiveHours: number;
    nonProductiveHours: number;
    narrative: string | null;
    blockers: string | null;
    progressPct: number | null;
    projectId: string | null;
  } | null;
};

export function StatusForm({ token, resourceName, expiresAt, tasks, existing }: Props) {
  const [productiveHours, setProductiveHours] = useState(existing?.productiveHours ?? 6);
  const [nonProductiveHours, setNonProductiveHours] = useState(existing?.nonProductiveHours ?? 2);
  const [narrative, setNarrative] = useState(existing?.narrative ?? "");
  const [blockers, setBlockers] = useState(existing?.blockers ?? "");
  const [progressPct, setProgressPct] = useState(existing?.progressPct ?? 50);
  const [projectId, setProjectId] = useState(existing?.projectId ?? tasks[0]?.projectId ?? "");
  const [taskProgress, setTaskProgress] = useState<Record<string, number>>(
    Object.fromEntries(tasks.map((t) => [t.id, t.progressPct])),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) map.set(t.projectId, t.projectName);
    return [...map.entries()];
  }, [tasks]);

  const expiryLabel = new Date(expiresAt).toLocaleString();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const items = tasks
        .filter((t) => !projectId || t.projectId === projectId)
        .map((t) => ({
          taskId: t.id,
          taskTitle: t.title,
          hours: 0,
          progressPct: taskProgress[t.id] ?? t.progressPct,
        }));

      const res = await fetch("/api/status/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          productiveHours,
          nonProductiveHours,
          narrative,
          blockers,
          progressPct,
          projectId: projectId || undefined,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Submit failed");
      } else {
        setMessage(data.isUpdate ? "Status updated." : "Status submitted. Thank you!");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel p-6 space-y-4 shadow-2xl">
      <div>
        <p className="text-xs uppercase tracking-wide text-teal-300/80">Daily status</p>
        <h1 className="text-2xl font-semibold mt-1">Hi {resourceName}</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Link expires at <strong className="text-white">{expiryLabel}</strong>
        </p>
      </div>

      {error ? (
        <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          {typeof error === "string" ? error : "Invalid submission"}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
          {message}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Productive hours</label>
          <input
            className="input"
            type="number"
            step="0.5"
            min={0}
            max={24}
            value={productiveHours}
            onChange={(e) => setProductiveHours(Number(e.target.value))}
            required
          />
        </div>
        <div>
          <label className="label">Non-productive hours</label>
          <input
            className="input"
            type="number"
            step="0.5"
            min={0}
            max={24}
            value={nonProductiveHours}
            onChange={(e) => setNonProductiveHours(Number(e.target.value))}
            required
          />
        </div>
      </div>

      {projects.length > 0 ? (
        <div>
          <label className="label">Primary project today</label>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label className="label">Overall progress %</label>
        <input
          className="input"
          type="number"
          min={0}
          max={100}
          value={progressPct}
          onChange={(e) => setProgressPct(Number(e.target.value))}
        />
      </div>

      {tasks.length > 0 ? (
        <div className="space-y-2">
          <p className="label">Task progress</p>
          {tasks
            .filter((t) => !projectId || t.projectId === projectId)
            .map((t) => (
              <div key={t.id} className="flex items-center gap-3">
                <span className="text-sm flex-1">{t.title}</span>
                <input
                  className="input w-24"
                  type="number"
                  min={0}
                  max={100}
                  value={taskProgress[t.id] ?? 0}
                  onChange={(e) =>
                    setTaskProgress((prev) => ({ ...prev, [t.id]: Number(e.target.value) }))
                  }
                />
              </div>
            ))}
        </div>
      ) : null}

      <div>
        <label className="label">What did you work on?</label>
        <textarea
          className="input min-h-24"
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          placeholder="Summary of today's work"
        />
      </div>

      <div>
        <label className="label">Blockers</label>
        <textarea
          className="input min-h-20"
          value={blockers}
          onChange={(e) => setBlockers(e.target.value)}
          placeholder="Leave blank if none"
        />
      </div>

      <button className="btn w-full" type="submit" disabled={submitting}>
        {submitting ? "Saving…" : existing ? "Update status" : "Submit status"}
      </button>
    </form>
  );
}
