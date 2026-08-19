import { POST as agentPost } from "../route";

/** Additive alias for running an agent job (body: { job }). */
export async function POST(req: Request) {
  return agentPost(req);
}
