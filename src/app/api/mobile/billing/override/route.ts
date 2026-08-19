import { POST as billingPost } from "../route";

/** Additive alias matching the plan path; same body as POST /api/mobile/billing. */
export async function POST(req: Request) {
  return billingPost(req);
}
