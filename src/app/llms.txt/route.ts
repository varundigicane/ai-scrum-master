export async function GET() {
  const body = `# AI Scrum Master
> Multi-tenant delivery HQ for daily status, SDLC, dashboards, and meeting-to-proposal workflows.

## Product
AI Scrum Master helps enterprises replace manual Scrum Master chasing with time-bound status collection, deadline alerts, weekly packs, billing/GTS views, MS Teams agent support, and business meeting notes that become software proposals and backlog hierarchies.

## Key capabilities
- Daily status via magic email/Teams links
- Accounts → projects → resources hierarchy
- Epics, features, stories, tasks, subtasks
- Meeting notes → AI summary → proposal → functional requirements → backlog
- Role-based feature access (Company Admin, CEO, SVP, VP, AVP, Project Manager, Employee)
- Web app + Flutter Android/iOS

## Public pages
- / — product overview
- /faq — frequently asked questions
- /login — staff sign-in

## Private
Authenticated /dashboard/* routes are company-scoped and should not be indexed.

## Contact
Configure your deployment operator / Digicane Systems engagement for production onboarding.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
