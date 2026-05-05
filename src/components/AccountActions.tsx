"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AccountActions() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Password change failed");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password updated.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={changePassword} className="glass grid gap-4 rounded-2xl p-6 shadow-md shadow-black/5">
        <div>
          <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Password</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/45">Update your account password.</p>
        </div>
        <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-white/75">
          Current password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-gray-950 outline-none transition focus:border-gray-400 dark:border-white/10 dark:bg-white/8 dark:text-white"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-white/75">
          New password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-gray-950 outline-none transition focus:border-gray-400 dark:border-white/10 dark:bg-white/8 dark:text-white"
          />
        </label>
        {message && <p className="text-sm font-medium text-emerald-600 dark:text-emerald-300">{message}</p>}
        {error && <p className="text-sm font-medium text-red-600 dark:text-red-300">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-fit rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-white/90"
        >
          {loading ? "Saving..." : "Save password"}
        </button>
      </form>

      <button
        type="button"
        onClick={logout}
        className="w-fit rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition hover:border-black/20 hover:bg-black/5 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
      >
        Log out
      </button>
    </div>
  );
}
