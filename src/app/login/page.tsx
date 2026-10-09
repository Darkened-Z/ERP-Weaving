import { redirect } from "next/navigation";
import { login, getSession } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const params = await searchParams;

  async function handleLogin(formData: FormData) {
    "use server";
    const loginId = formData.get("login") as string;
    const password = formData.get("password") as string;

    const remember = formData.get("remember") === "on";
    const result = await login(loginId, password, remember);
    if (result === "throttled") redirect("/login?error=throttled");
    if (!result) {
      redirect("/login?error=1");
    }
    redirect("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <div className="mb-12">
          <h1 className="text-4xl font-extrabold tracking-tighter">SK MILLS</h1>
          <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--muted)] mt-2">
            Weaving Management System
          </p>
        </div>

        <form action={handleLogin}>
          <div className="space-y-6">
            <div>
              <label className="label block mb-2">Login</label>
              <input
                name="login"
                type="text"
                required
                autoFocus
                className="input"
                placeholder="Enter username"
              />
            </div>

            <div>
              <label className="label block mb-2">Password</label>
              <input
                name="password"
                type="password"
                required
                className="input"
                placeholder="Enter password"
              />
            </div>

            {params.error && (
              <p className="text-[13px] text-[var(--danger)]">
                {params.error === "throttled"
                  ? "Too many failed attempts. Wait 15 minutes and try again."
                  : "Invalid credentials. Try again."}
              </p>
            )}

            <div className="flex items-center gap-2 mt-4">
              <input type="checkbox" id="remember" name="remember" className="h-4 w-4 border-gray-300 rounded" />
              <label htmlFor="remember" className="text-[13px] text-gray-700 select-none cursor-pointer">Trust this device (keep me logged in)</label>
            </div>

            <button type="submit" className="btn w-full justify-center mt-4">
              Sign In
            </button>
          </div>
        </form>

        {process.env.NODE_ENV !== "production" && (
          <div className="mt-8 pt-6 border-t border-[var(--border-light)]">
            <p className="text-[11px] text-[var(--muted)]">
              Demo credentials: <span className="mono">admin / admin123</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
