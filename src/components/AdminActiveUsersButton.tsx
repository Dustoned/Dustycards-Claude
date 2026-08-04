"use client";

import { ShieldCheck, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface ActiveUserItem {
  id: string;
  email: string;
  role: "admin" | "user";
  lastSeenAt: string;
  sessionCount: number;
}

interface ActiveUsersPayload {
  ok?: boolean;
  count?: number;
  activeWindowMinutes?: number;
  users?: ActiveUserItem[];
}

function displayName(email: string): string {
  return email.split("@")[0]?.replace(/[._-]+/g, " ") || email;
}

function activityLabel(value: string, referenceNow: number): string {
  const elapsed = referenceNow - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 75_000) return "Active now";
  return `${Math.max(1, Math.floor(elapsed / 60_000))}m ago`;
}

export default function AdminActiveUsersButton({
  initialCount = 0,
  placement = "below-right",
}: {
  initialCount?: number;
  placement?: "below-right" | "above-left";
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [users, setUsers] = useState<ActiveUserItem[]>([]);
  const [windowMinutes, setWindowMinutes] = useState(5);
  const [loading, setLoading] = useState(false);
  const [referenceNow, setReferenceNow] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/active-users", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as ActiveUsersPayload;
      if (!response.ok || !payload.ok) return;
      setCount(payload.count ?? 0);
      setUsers(payload.users ?? []);
      setWindowMinutes(payload.activeWindowMinutes ?? 5);
      setReferenceNow(Date.now());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    function refreshWhenVisible() {
      if (
        document.visibilityState === "visible" &&
        rootRef.current?.getClientRects().length
      ) {
        void load();
      }
    }

    const initialTimer = window.setTimeout(refreshWhenVisible, 0);
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", keydown);
    };
  }, [load, open]);

  return (
    <div ref={rootRef} className="relative shrink-0" data-admin-active-users>
      <button
        type="button"
        onClick={() => {
          if (!open) void load();
          setOpen((current) => !current);
        }}
        className="relative flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-300/12 bg-emerald-400/[0.055] px-2.5 text-emerald-100/72 transition-colors hover:border-emerald-300/22 hover:bg-emerald-400/[0.1] hover:text-emerald-50"
        aria-label={`${count} active ${count === 1 ? "user" : "users"}`}
        aria-expanded={open}
      >
        <UsersRound className="h-4 w-4" />
        <span className="text-[11px] font-black tabular-nums">{count}</span>
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
      </button>

      {open ? (
        <div
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          className={`fixed inset-0 z-[170] bg-black/30 backdrop-blur-sm sm:absolute sm:inset-auto sm:w-[20rem] sm:bg-transparent sm:backdrop-blur-0 ${
            placement === "above-left"
              ? "sm:bottom-[calc(100%+0.55rem)] sm:left-0"
              : "sm:right-0 sm:top-[calc(100%+0.55rem)]"
          }`}
        >
          <div className="absolute left-3 right-3 top-[calc(var(--ui-app-header-height)+env(safe-area-inset-top,0px)+0.5rem)] max-h-[calc(100dvh-var(--ui-app-header-height)-env(safe-area-inset-top,0px)-1rem)] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/94 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:relative sm:left-auto sm:right-auto sm:top-auto sm:max-h-[32rem]">
            <div className="flex items-start justify-between gap-3 border-b border-white/8 px-4 py-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-black text-white">
                  <UsersRound className="h-4 w-4 text-emerald-300" /> Active users
                </p>
                <p className="mt-0.5 text-[10px] font-semibold text-white/38">
                  Seen in the last {windowMinutes} minutes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 text-white/46 hover:text-white"
                aria-label="Close active users"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-[calc(100dvh-var(--ui-app-header-height)-env(safe-area-inset-top,0px)-5rem)] overscroll-contain overflow-y-auto p-2 sm:max-h-[24rem]">
              {users.length ? users.map((user) => {
                const activeNow = referenceNow - new Date(user.lastSeenAt).getTime() < 75_000;
                return (
                  <div key={user.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/[0.04]">
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.045] text-xs font-black uppercase text-white/72">
                      {user.email.slice(0, 1)}
                      <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-950 ${activeNow ? "bg-emerald-400" : "bg-amber-300"}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <strong className="truncate text-[12px] capitalize text-white/86">{displayName(user.email)}</strong>
                        {user.role === "admin" ? <ShieldCheck className="h-3 w-3 shrink-0 text-violet-300" /> : null}
                      </span>
                      <span className="block truncate text-[10px] text-white/34">{user.email}</span>
                    </span>
                    <span className={`shrink-0 text-[9px] font-bold ${activeNow ? "text-emerald-300" : "text-amber-200/72"}`}>
                      {activityLabel(user.lastSeenAt, referenceNow)}
                    </span>
                  </div>
                );
              }) : (
                <div className="px-4 py-9 text-center text-sm text-white/40">
                  {loading ? "Checking activity..." : "Nobody active right now."}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
