"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LoaderCircle,
  MailCheck,
  MailWarning,
  Search,
  ShieldCheck,
  ShieldOff,
  UsersRound,
  X,
} from "lucide-react";

export type AdminUserSummary = {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  role: "admin" | "user";
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  counts: {
    binders: number;
    cards: number;
    sealed: number;
    sessions: number;
  };
};

type PendingAction = {
  action: "disabled" | "password" | "role";
  userId: string;
} | null;

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
const DATE_FORMATTER = new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "short",
  timeZone: "Europe/Amsterdam",
});

function formatCount(value: number): string {
  return NUMBER_FORMATTER.format(value);
}

function formatDate(value: string): string {
  return DATE_FORMATTER.format(new Date(value));
}

export default function AdminUsersPanel({
  currentUserId,
  users,
}: {
  currentUserId: string;
  users: AdminUserSummary[];
}) {
  const router = useRouter();
  const [draftRoles, setDraftRoles] = useState<Record<string, "admin" | "user">>(
    Object.fromEntries(users.map((user) => [user.id, user.role]))
  );
  const [passwords, setPasswords] = useState<Record<string, { first: string; second: string }>>({});
  const [pending, setPending] = useState<PendingAction>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = normalizedQuery
    ? users.filter((user) => user.email.toLowerCase().includes(normalizedQuery))
    : users;
  const activeUsers = users.filter((user) => !user.disabled).length;
  const adminUsers = users.filter((user) => user.role === "admin").length;
  const verifiedUsers = users.filter((user) => Boolean(user.emailVerifiedAt)).length;
  const activeSessions = users.reduce((total, user) => total + user.counts.sessions, 0);

  async function updateUser(
    userId: string,
    action: NonNullable<PendingAction>["action"],
    body: Record<string, unknown>
  ) {
    setPending({ action, userId });
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Could not update user");
        return;
      }

      if (action === "password") {
        setPasswords((current) => ({ ...current, [userId]: { first: "", second: "" } }));
      }
      setMessage("User updated.");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="binder-panel grid gap-4 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-white/40" />
            <h2 className="text-base font-semibold text-white">
              User Management
            </h2>
          </div>
          <p className="mt-1 text-sm text-white/45">
            Manage accounts, roles, access, and password resets.
          </p>
        </div>
        <label className="relative block min-w-0 lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            id="admin-user-search"
            name="user-filter-query"
            type="text"
            role="searchbox"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search users..."
            className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-2 pl-9 pr-9 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-white/18"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear user search"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/8 dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Users</p>
          <p className="mt-1 text-sm font-bold text-white">{formatCount(users.length)}</p>
          <p className="mt-0.5 text-[11px] text-gray-400">{formatCount(verifiedUsers)} verified</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Active</p>
          <p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">{formatCount(activeUsers)}</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Admins</p>
          <p className="mt-1 text-sm font-bold text-white">{formatCount(adminUsers)}</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Sessions</p>
          <p className="mt-1 text-sm font-bold text-white">{formatCount(activeSessions)}</p>
        </div>
      </div>

      {message && <p className="text-sm font-medium text-emerald-600 dark:text-emerald-300">{message}</p>}
      {error && <p className="text-sm font-medium text-red-600 dark:text-red-300">{error}</p>}

      <div className="grid min-w-0 gap-3">
        {filteredUsers.length === 0 ? (
          <p className="rounded-xl border border-black/6 px-3 py-2 text-sm text-gray-500 dark:border-white/8 dark:text-white/45">
            No users match this search.
          </p>
        ) : null}
        {filteredUsers.map((user) => {
          const isSelf = user.id === currentUserId;
          const role = draftRoles[user.id] ?? user.role;
          const password = passwords[user.id] ?? { first: "", second: "" };
          const busy = pending?.userId === user.id;
          const passwordMismatch =
            password.first.length > 0 && password.second.length > 0 && password.first !== password.second;

          return (
            <div
              key={user.id}
              className="grid min-w-0 gap-4 rounded-2xl border border-white/8 bg-white/[0.04] p-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 break-all text-sm font-semibold text-gray-950 dark:text-white sm:break-normal">
                    {user.email}
                  </p>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                    user.disabled
                      ? "bg-red-500/10 text-red-700 dark:text-red-200"
                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                  }`}>
                    {user.disabled ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    {user.disabled ? "Disabled" : "Active"}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                    user.emailVerifiedAt
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-200"
                  }`}>
                    {user.emailVerifiedAt ? <MailCheck className="h-3.5 w-3.5" /> : <MailWarning className="h-3.5 w-3.5" />}
                    {user.emailVerifiedAt ? "Verified" : "Not verified"}
                  </span>
                  <span className="rounded-full bg-black/5 px-2 py-1 text-xs font-semibold text-gray-600 dark:bg-white/8 dark:text-white/60">
                    {user.role}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-white/45">
                  Cards {formatCount(user.counts.cards)} | Binders{" "}
                  {formatCount(user.counts.binders)} | Sealed {formatCount(user.counts.sealed)} | Sessions{" "}
                  {formatCount(user.counts.sessions)}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-gray-400 dark:text-white/35">
                  Created {formatDate(user.createdAt)} | Updated {formatDate(user.updatedAt)}
                  {user.emailVerifiedAt ? ` | Verified ${formatDate(user.emailVerifiedAt)}` : ""}
                </p>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-white/75">
                    Role
                    <select
                      value={role}
                      onChange={(event) =>
                        setDraftRoles((current) => ({
                          ...current,
                          [user.id]: event.target.value as "admin" | "user",
                        }))
                      }
                      disabled={busy}
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-gray-950 outline-none transition focus:border-gray-400 disabled:opacity-60 dark:border-white/10 dark:bg-white/8 dark:text-white"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busy || role === user.role || (isSelf && role !== "admin")}
                    onClick={() => updateUser(user.id, "role", { role })}
                    className="self-end rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition hover:border-black/20 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
                  >
                    Save role
                  </button>
                </div>

                <button
                  type="button"
                  disabled={busy || isSelf}
                  onClick={() => updateUser(user.id, "disabled", { disabled: !user.disabled })}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition hover:border-black/20 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/12"
                >
                  {busy && pending?.action === "disabled" && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  {user.disabled ? "Enable user" : "Disable user"}
                </button>

                <div className="grid gap-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="password"
                      name={`admin-new-password-${user.id}`}
                      autoComplete="new-password"
                      minLength={8}
                      placeholder="New password"
                      value={password.first}
                      onChange={(event) =>
                        setPasswords((current) => ({
                          ...current,
                          [user.id]: { ...password, first: event.target.value },
                        }))
                      }
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:bg-white/8 dark:text-white"
                    />
                    <input
                      type="password"
                      name={`admin-confirm-password-${user.id}`}
                      autoComplete="new-password"
                      minLength={8}
                      placeholder="Confirm password"
                      value={password.second}
                      onChange={(event) =>
                        setPasswords((current) => ({
                          ...current,
                          [user.id]: { ...password, second: event.target.value },
                        }))
                      }
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:bg-white/8 dark:text-white"
                    />
                  </div>
                  {passwordMismatch && (
                    <p className="text-xs font-medium text-red-600 dark:text-red-300">
                      Passwords do not match.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={busy || password.first.length < 8 || passwordMismatch}
                    onClick={() =>
                      updateUser(user.id, "password", {
                        newPassword: password.first,
                        newPasswordConfirm: password.second,
                      })
                    }
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-white/90"
                  >
                    {busy && pending?.action === "password" && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    Reset password
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
