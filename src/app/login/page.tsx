import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <LoginInner searchParams={searchParams} />
  );
}

async function LoginInner({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  async function loginAction(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: String(formData.get("email")),
        password: String(formData.get("password")),
        redirectTo: "/dashboard",
      });
    } catch (error) {
      if (error instanceof AuthError) {
        redirect("/login?error=Invalid%20credentials");
      }
      throw error;
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="panel w-full max-w-md p-8 shadow-2xl">
        <p className="text-sm text-teal-300/80 mb-2 tracking-wide uppercase">AI Scrum Master</p>
        <h1 className="text-3xl font-semibold mb-2">Sign in</h1>
        <p className="text-[var(--muted)] mb-6 text-sm">
          Multi-account delivery status, SDLC tracking, and management dashboards.
        </p>
        {sp.error ? (
          <p className="mb-4 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
            {sp.error}
          </p>
        ) : null}
        <form action={loginAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input className="input" id="email" name="email" type="email" required defaultValue="admin@acme.local" />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input className="input" id="password" name="password" type="password" required defaultValue="password123" />
          </div>
          <button className="btn w-full" type="submit">
            Continue
          </button>
        </form>
        <p className="mt-6 text-xs text-[var(--muted)]">
          Demo: admin@acme.local / password123 · Roles: CEO, SVP, VP, AVP, Project Manager, Employee
        </p>
      </div>
    </main>
  );
}
