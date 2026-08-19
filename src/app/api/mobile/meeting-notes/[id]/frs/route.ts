import { postMeetingNoteAction } from "../route";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  return postMeetingNoteAction(req, ctx, "frs");
}
