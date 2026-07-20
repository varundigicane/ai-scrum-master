import { revalidatePath } from "next/cache";
import { triggerAgentJob } from "@/app/actions";

async function runJob(formData: FormData) {
  "use server";
  const job = String(formData.get("job"));
  await triggerAgentJob(job);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/status");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/agent");
}

export default function AgentPage() {
  const jobs = [
    {
      job: "open-status-window",
      title: "Open daily status window",
      desc: "Email every active resource a unique link that expires 2 hours after window start.",
    },
    {
      job: "close-status-window",
      title: "Close expired windows",
      desc: "Mark pending requests expired and email missing list to PM / Account Manager.",
    },
    {
      job: "deadline-sweep",
      title: "Deadline sweep",
      desc: "Notify for approaching (3d/1d) and overdue client & resource deadlines.",
    },
    {
      job: "weekly-reports",
      title: "Generate weekly packs",
      desc: "Create and email resource-wise, project-wise, and management digests.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">AI Scrum Agent</h2>
        <p className="text-sm text-[var(--muted)]">
          Manual triggers for local/demo. Wire the same jobs to cron via{" "}
          <code className="text-teal-300">POST /api/cron</code> with Bearer CRON_SECRET.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {jobs.map((j) => (
          <form key={j.job} action={runJob} className="panel p-4 space-y-3">
            <input type="hidden" name="job" value={j.job} />
            <h3 className="font-semibold">{j.title}</h3>
            <p className="text-sm text-[var(--muted)]">{j.desc}</p>
            <button className="btn" type="submit">
              Run now
            </button>
          </form>
        ))}
      </div>

      <div className="panel p-4 text-sm text-[var(--muted)] space-y-2">
        <p className="font-medium text-white">Cron example</p>
        <pre className="overflow-x-auto bg-black/30 rounded-lg p-3 text-xs">
{`curl -X POST http://localhost:3000/api/cron \\
  -H "Authorization: Bearer dev-cron-secret" \\
  -H "Content-Type: application/json" \\
  -d '{"job":"open-status-window"}'`}
        </pre>
        <p>Without SMTP configured, emails are printed to the <strong>server console</strong> (including magic links under <code>Links:</code>).</p>
        <p>
          After opening a window, open <strong>Daily status</strong> to see submission states. Use a fresh browser
          tab for resource links from the console.
        </p>
      </div>
    </div>
  );
}
