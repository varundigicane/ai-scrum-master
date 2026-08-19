/** Map technical failures to short, human-readable messages for end users. */
export function toFriendlyError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error == null) return fallback;

  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String((error as { message: unknown }).message)
          : "";

  const msg = raw.trim();
  if (!msg) return fallback;

  const lower = msg.toLowerCase();

  if (lower.includes("unauthorized") || lower.includes("missing feature")) {
    return "You do not have permission to do that. Ask a Company Admin to update Feature access.";
  }
  if (lower.includes("invalid credentials") || lower.includes("credentialsignin")) {
    return "Email or password is incorrect. Check your details and try again.";
  }
  if (lower.includes("openai") || lower.includes("api key") || lower === "ai_unavailable") {
    return "AI features are unavailable right now. Check that OPENAI_API_KEY is configured, then try again.";
  }
  if (lower.includes("unique constraint") || lower.includes("already exists")) {
    return "That record already exists. Change the name or code and try again.";
  }
  if (lower.includes("foreign key") || lower.includes("not found")) {
    return "We could not find a related record. Refresh the page and try again.";
  }
  if (lower.includes("prisma") || lower.includes("p1001") || lower.includes("database")) {
    return "The database is temporarily unavailable. Please try again in a moment.";
  }
  if (lower.includes("network") || lower.includes("fetch failed") || lower.includes("econnrefused")) {
    return "Network problem. Check your connection and try again.";
  }
  if (lower.includes("timeout") || lower.includes("aborted")) {
    return "The request timed out. Please try again.";
  }
  if (lower.includes("validation") || lower.includes("invalid")) {
    return msg.length < 180 ? msg : "Some fields are invalid. Check the form and try again.";
  }

  // Avoid leaking stack-like or internal codes
  if (msg.includes("\n") || /at\s+\S+\s+\(/.test(msg) || msg.length > 240) {
    return fallback;
  }

  return msg;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string };
