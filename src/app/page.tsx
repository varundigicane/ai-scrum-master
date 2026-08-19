import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "AI Scrum Master | Delivery status, SDLC & AI meeting proposals",
  description:
    "AI Scrum Master helps enterprises collect daily delivery status, track SDLC backlog, run management dashboards, and turn business meeting notes into software proposals and epics.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "AI Scrum Master by Digicane-aligned delivery teams",
    description:
      "Multi-tenant delivery HQ: daily status, backlog, billing, GTS, Teams agent, and meeting-to-proposal workflows.",
    type: "website",
  },
};

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "AI Scrum Master",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android, iOS",
    description:
      "Multi-tenant AI delivery platform for daily status, SDLC tracking, management dashboards, and business meeting proposals.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <main className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="mx-auto max-w-5xl px-4 py-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-teal-700">AI Scrum Master</p>
          <p className="text-sm text-[var(--muted)]">Enterprise delivery HQ</p>
        </div>
        <div className="flex gap-2">
          <Link className="btn-secondary btn text-sm" href="/faq">
            FAQ
          </Link>
          <Link className="btn text-sm" href="/login">
            Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 pt-10 pb-16">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight max-w-3xl">
          AI Scrum Master
        </h1>
        <p className="mt-4 text-lg text-[var(--muted)] max-w-2xl">
          Collect time-bound daily status, track epics to subtasks, alert on deadlines, and turn business discussions
          into proposals and backlog — multi-tenant and ready for web and mobile.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="btn" href="/login">
            Open Delivery HQ
          </Link>
          <Link className="btn-secondary btn" href="/faq">
            Answer-ready FAQ
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20 grid md:grid-cols-3 gap-4">
        {[
          ["Daily status agent", "Time-bound email and Teams links replace manual chasing."],
          ["Meeting → backlog", "Summarize discussions, draft proposals, push FR to epics and tasks."],
          ["Multi-tenant dashboards", "Accounts, billing, GTS, quality RCA, and role-based feature access."],
        ].map(([title, body]) => (
          <article key={title} className="panel p-5">
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-[var(--muted)] mt-2">{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
