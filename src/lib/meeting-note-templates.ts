export type NoteTemplateKey = "standup" | "discovery" | "retrospective";

export const NOTE_TEMPLATES: Record<
  NoteTemplateKey,
  { label: string; titlePrefix: string; bodyHtml: string }
> = {
  standup: {
    label: "Standup",
    titlePrefix: "Standup",
    bodyHtml: [
      "<h2>Yesterday</h2><ul><li></li></ul>",
      "<h2>Today</h2><ul><li></li></ul>",
      "<h2>Blockers</h2><ul><li></li></ul>",
    ].join(""),
  },
  discovery: {
    label: "Discovery",
    titlePrefix: "Discovery",
    bodyHtml: [
      "<h2>Goals</h2><p></p>",
      "<h2>Stakeholders</h2><ul><li></li></ul>",
      "<h2>Findings</h2><ul><li></li></ul>",
      "<h2>Open questions</h2><ul><li></li></ul>",
      "<h2>Next steps</h2><ul><li></li></ul>",
    ].join(""),
  },
  retrospective: {
    label: "Retrospective",
    titlePrefix: "Retro",
    bodyHtml: [
      "<h2>Went well</h2><ul><li></li></ul>",
      "<h2>Needs improvement</h2><ul><li></li></ul>",
      "<h2>Action items</h2><ul><li></li></ul>",
    ].join(""),
  },
};

export function resolveTemplate(key: string | null | undefined) {
  if (!key) return null;
  return NOTE_TEMPLATES[key as NoteTemplateKey] ?? null;
}
