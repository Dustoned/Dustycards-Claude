"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut } from "lucide-react";

export default function AccountActions() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not log out. Check your connection and try again.");
      setLoggingOut(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    try {
      if (newPassword !== newPasswordConfirm) {
        setError("New passwords do not match");
        return;
      }

      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, newPasswordConfirm }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Password change failed");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setMessage("Password updated. Other signed-in sessions were ended for your security.");
    } catch {
      setError("Could not update your password. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="binder-panel rounded-2xl p-4 sm:p-5">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">
            Security
          </h2>
          <p className="mt-0.5 text-sm text-white/45">
            Update your password or end the current browser session.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-2.5 py-1 text-xs font-semibold text-emerald-200">
          <KeyRound className="h-3.5 w-3.5" />
          Password protected
        </span>
      </div>

      <form onSubmit={changePassword} className="grid gap-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="grid gap-1.5 text-sm font-medium text-white/75">
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "account-security-error" : undefined}
              className="min-h-11 rounded-xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition focus:border-white/24"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-white/75">
            New password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "account-security-error" : undefined}
              className="min-h-11 rounded-xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition focus:border-white/24"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-white/75">
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPasswordConfirm}
              onChange={(event) => setNewPasswordConfirm(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "account-security-error" : undefined}
              className="min-h-11 rounded-xl border border-white/10 bg-white/8 px-3 py-2.5 text-white outline-none transition focus:border-white/24"
            />
          </label>
        </div>
        {message && <p role="status" aria-live="polite" className="text-sm font-medium text-emerald-600 dark:text-emerald-300">{message}</p>}
        {error && <p id="account-security-error" role="alert" className="text-sm font-medium text-red-600 dark:text-red-300">{error}</p>}

        <div className="flex flex-col gap-2 border-t border-white/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-950 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Saving..." : "Save password"}
          </button>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/12 disabled:cursor-wait disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      </form>
    </section>
  );
}
