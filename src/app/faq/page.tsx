import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ | AI Scrum Master",
  description:
    "Answers about AI Scrum Master daily status, roles, meeting notes, proposals, multi-tenant security, and mobile apps.",
  alternates: { canonical: "/faq" },
};

const faqs = [
  {
    q: "What is AI Scrum Master?",
    a: "AI Scrum Master is a multi-tenant delivery platform that automates daily status collection, SDLC tracking, alerts, weekly packs, and meeting-to-proposal workflows for software teams.",
  },
  {
    q: "How does daily status collection work?",
    a: "The AI agent opens a time-bound window and emails or Teams-messages each resource a unique link. Resources submit hours, progress, and blockers before expiry. Misses escalate to Project Managers, AVPs, and VPs.",
  },
  {
    q: "Can meeting notes become software proposals and backlog items?",
    a: "Yes. Capture business discussion notes, generate an AI summary, create a rich-text proposal, generate functional requirements, then push them into epic, feature, story, task, and subtask hierarchy on a project.",
  },
  {
    q: "Is customer data isolated between companies?",
    a: "Yes. Every company is a tenant. Users, accounts, projects, meeting notes, and proposals are scoped by companyId so one tenant cannot read another tenant’s data.",
  },
  {
    q: "Is there a mobile app?",
    a: "Yes. A Flutter app for Android and iOS provides a Digicane-aligned light theme, a collapsible top-left menu, and access to delivery features through the mobile API. An Android APK can be built from the mobile project.",
  },
];

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Link href="/" className="text-sm text-sky-700 hover:underline">
        ← Home
      </Link>
      <h1 className="text-3xl font-semibold mt-3">Frequently asked questions</h1>
      <p className="text-[var(--muted)] mt-2">
        Structured answers for people and answer engines (AEO / GEO-friendly).
      </p>
      <div className="mt-8 space-y-4">
        {faqs.map((f) => (
          <article key={f.q} className="panel p-4">
            <h2 className="font-semibold">{f.q}</h2>
            <p className="text-sm text-[var(--muted)] mt-2">{f.a}</p>
          </article>
        ))}
      </div>
      <p className="mt-8">
        <Link className="btn" href="/login">
          Sign in
        </Link>
      </p>
    </main>
  );
}
