"use client";

type Step = {
  id: number;
  label: string;
  done: boolean;
};

export function MeetingPipelineStepper({
  steps,
  nextLabel,
  nextForm,
}: {
  steps: Step[];
  nextLabel: string | null;
  nextForm: React.ReactNode | null;
}) {
  return (
    <section className="panel p-4 space-y-4">
      <div>
        <h2 className="font-semibold">Conversion pipeline</h2>
        <p className="text-sm text-[var(--muted)] mt-1">
          Work top to bottom: notes → summary → proposal → functional requirements → project backlog.
        </p>
      </div>
      <ol className="grid gap-2 sm:grid-cols-5">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`rounded-lg border px-3 py-2 text-sm ${
              step.done
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)]"
            }`}
          >
            <div className="text-xs uppercase tracking-wide opacity-80">Step {step.id}</div>
            <div className="font-medium text-[var(--text)] mt-0.5">{step.label}</div>
            <div className="text-xs mt-1">{step.done ? "Done" : "Pending"}</div>
          </li>
        ))}
      </ol>
      {nextLabel && nextForm ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3">
          <p className="text-sm font-medium">Next: {nextLabel}</p>
          {nextForm}
        </div>
      ) : (
        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Pipeline complete for this note. You can still regenerate steps or edit the proposal below.
        </p>
      )}
    </section>
  );
}
