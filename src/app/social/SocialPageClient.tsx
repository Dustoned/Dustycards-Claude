"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Check,
  Clock3,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import type {
  SocialCollectorSummary,
  SocialFriendSummary,
  SocialRelationship,
  SocialRequestSummary,
} from "@/lib/social";

interface Props {
  collectors: SocialCollectorSummary[];
  friends: SocialFriendSummary[];
  incomingRequests: SocialRequestSummary[];
  outgoingRequests: SocialRequestSummary[];
  activeFriendId: string | null;
  gameParam: string | null;
}

type PendingAction =
  | { kind: "add_collector"; id: string }
  | { kind: "accept"; id: string }
  | { kind: "remove"; id: string }
  | { kind: "request_full_access"; id: string }
  | { kind: "accept_full_access"; id: string }
  | { kind: "revoke_full_access"; id: string }
  | null;
type PendingActionKind =
  | "add_collector"
  | "accept"
  | "remove"
  | "request_full_access"
  | "accept_full_access"
  | "revoke_full_access";

type FullAccessAction = "request_full_access" | "accept_full_access" | "revoke_full_access";

type PersonRow = {
  id: string;
  displayName: string;
  initial: string;
  relationship: SocialRelationship;
  connectionId: string | null;
  cards: number | null;
  binders: number | null;
  collector: SocialCollectorSummary | null;
  friend: SocialFriendSummary | null;
};

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function buildFriendHref(friendId: string, gameParam: string | null): string {
  const params = new URLSearchParams({ friend: friendId });
  if (gameParam) params.set("game", gameParam);
  return `/social?${params.toString()}`;
}

function isPendingAction(pendingAction: PendingAction, kind: PendingActionKind, id?: string) {
  if (!pendingAction || pendingAction.kind !== kind) return false;
  return "id" in pendingAction ? pendingAction.id === id : true;
}

function getFullAccessLabel(friend: SocialFriendSummary): string {
  if (friend.hasFullAccess) return "accepted";
  if (friend.canAcceptFullAccess) return "requested";
  if (friend.fullAccessPendingByMe) return "waiting";
  return "limited";
}

function getPersonMeta(person: PersonRow): string {
  if (person.cards !== null && person.binders !== null) {
    return `${formatCount(person.cards)} cards / ${formatCount(person.binders)} binders`;
  }

  if (person.relationship === "request_received") return "Incoming request";
  if (person.relationship === "request_sent") return "Waiting for response";
  return "Collector";
}

function getRelationshipLabel(person: PersonRow, active: boolean): string {
  if (active) return "Viewing";
  if (person.relationship === "friend") return "Friend";
  if (person.relationship === "request_received") return "Request";
  if (person.relationship === "request_sent") return "Sent";
  return "Collector";
}

function getRelationshipClass(person: PersonRow, active: boolean): string {
  if (active) return "border-violet-300/24 bg-violet-500/[0.13] text-violet-50";
  if (person.relationship === "friend") {
    return "border-emerald-300/18 bg-emerald-500/[0.10] text-emerald-100";
  }
  if (person.relationship === "request_received") {
    return "border-sky-300/18 bg-sky-500/[0.10] text-sky-100";
  }
  if (person.relationship === "request_sent") {
    return "border-amber-300/18 bg-amber-500/[0.10] text-amber-100";
  }
  return "border-white/10 bg-black/18 text-white/50";
}

function mergePeople({
  collectors,
  friends,
  incomingRequests,
  outgoingRequests,
  activeFriendId,
}: Pick<Props, "collectors" | "friends" | "incomingRequests" | "outgoingRequests" | "activeFriendId">) {
  const peopleById = new Map<string, PersonRow>();
  const friendsById = new Map(friends.map((friend) => [friend.id, friend]));

  for (const collector of collectors) {
    peopleById.set(collector.id, {
      id: collector.id,
      displayName: collector.displayName,
      initial: collector.initial,
      relationship: collector.relationship,
      connectionId: collector.connectionId,
      cards: collector.cards,
      binders: collector.binders,
      collector,
      friend: friendsById.get(collector.id) ?? null,
    });
  }

  for (const friend of friends) {
    const existing = peopleById.get(friend.id);
    peopleById.set(friend.id, {
      id: friend.id,
      displayName: friend.displayName,
      initial: friend.initial,
      relationship: "friend",
      connectionId: friend.connectionId,
      cards: friend.cards,
      binders: friend.binders,
      collector: existing?.collector ?? null,
      friend,
    });
  }

  for (const request of incomingRequests) {
    if (peopleById.has(request.id)) continue;
    peopleById.set(request.id, {
      id: request.id,
      displayName: request.displayName,
      initial: request.initial,
      relationship: "request_received",
      connectionId: request.connectionId,
      cards: null,
      binders: null,
      collector: null,
      friend: null,
    });
  }

  for (const request of outgoingRequests) {
    if (peopleById.has(request.id)) continue;
    peopleById.set(request.id, {
      id: request.id,
      displayName: request.displayName,
      initial: request.initial,
      relationship: "request_sent",
      connectionId: request.connectionId,
      cards: null,
      binders: null,
      collector: null,
      friend: null,
    });
  }

  const relationshipOrder: Record<SocialRelationship, number> = {
    request_received: 0,
    none: 1,
    request_sent: 2,
    friend: 3,
  };

  return Array.from(peopleById.values()).sort((a, b) => {
    if (a.id === activeFriendId) return -1;
    if (b.id === activeFriendId) return 1;

    return (
      relationshipOrder[a.relationship] - relationshipOrder[b.relationship] ||
      (b.cards ?? -1) - (a.cards ?? -1) ||
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
    );
  });
}

interface FullAccessControlsProps {
  friend: SocialFriendSummary;
  pendingAction: PendingAction;
  disabled: boolean;
  onUpdate: (
    connectionId: string,
    action: FullAccessAction,
    successMessage: string
  ) => Promise<void>;
}

function FullAccessControls({
  friend,
  pendingAction,
  disabled,
  onUpdate,
}: FullAccessControlsProps) {
  const fullAccessLabel = getFullAccessLabel(friend);
  const statusClass = friend.hasFullAccess
    ? "border-emerald-300/18 bg-emerald-500/[0.10] text-emerald-100"
    : friend.fullAccessStatus === "pending"
      ? "border-amber-300/18 bg-amber-500/[0.10] text-amber-100"
      : "border-white/10 bg-black/18 text-white/50";

  return (
    <div className="mt-2 rounded-xl border border-white/8 bg-black/16 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-black text-white/78">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-100/80" />
          <span className="truncate">Full Access</span>
        </span>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${statusClass}`}
        >
          {friend.hasFullAccess ? (
            <ShieldCheck className="h-3 w-3" />
          ) : friend.fullAccessStatus === "pending" ? (
            <Clock3 className="h-3 w-3" />
          ) : (
            <KeyRound className="h-3 w-3" />
          )}
          {fullAccessLabel}
        </span>
      </div>

      {friend.hasFullAccess ? (
        <button
          type="button"
          onClick={() =>
            onUpdate(friend.connectionId, "revoke_full_access", "Full Access turned off.")
          }
          disabled={disabled}
          className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.035] px-2 text-[11px] font-black text-white/68 transition-colors hover:border-rose-300/18 hover:bg-rose-500/[0.08] hover:text-rose-100 disabled:cursor-wait disabled:opacity-55"
        >
          {isPendingAction(pendingAction, "revoke_full_access", friend.connectionId) ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
          Turn Off
        </button>
      ) : friend.canAcceptFullAccess ? (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() =>
              onUpdate(friend.connectionId, "accept_full_access", "Full Access accepted.")
            }
            disabled={disabled}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-emerald-300/18 bg-emerald-500/[0.10] px-2 text-[10px] font-black text-emerald-100 transition-colors hover:bg-emerald-500/[0.15] disabled:cursor-wait disabled:opacity-55"
          >
            {isPendingAction(pendingAction, "accept_full_access", friend.connectionId) ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Accept
          </button>
          <button
            type="button"
            onClick={() =>
              onUpdate(friend.connectionId, "revoke_full_access", "Full Access declined.")
            }
            disabled={disabled}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.035] px-2 text-[10px] font-black text-white/58 transition-colors hover:border-rose-300/18 hover:bg-rose-500/[0.08] hover:text-rose-100 disabled:cursor-wait disabled:opacity-55"
          >
            <X className="h-3.5 w-3.5" />
            Decline
          </button>
        </div>
      ) : friend.fullAccessPendingByMe ? (
        <button
          type="button"
          onClick={() =>
            onUpdate(friend.connectionId, "revoke_full_access", "Full Access request canceled.")
          }
          disabled={disabled}
          className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.035] px-2 text-[11px] font-black text-white/68 transition-colors hover:border-rose-300/18 hover:bg-rose-500/[0.08] hover:text-rose-100 disabled:cursor-wait disabled:opacity-55"
        >
          {isPendingAction(pendingAction, "revoke_full_access", friend.connectionId) ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
          Cancel
        </button>
      ) : (
        <button
          type="button"
          onClick={() =>
            onUpdate(friend.connectionId, "request_full_access", "Full Access requested.")
          }
          disabled={disabled}
          className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-violet-300/22 bg-violet-500/[0.15] px-2 text-[11px] font-black text-violet-50 transition-colors hover:bg-violet-500/[0.22] disabled:cursor-wait disabled:opacity-55"
        >
          {isPendingAction(pendingAction, "request_full_access", friend.connectionId) ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <KeyRound className="h-3.5 w-3.5" />
          )}
          Request
        </button>
      )}
    </div>
  );
}

export default function SocialPageClient({
  collectors,
  friends,
  incomingRequests,
  outgoingRequests,
  activeFriendId,
  gameParam,
}: Props) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const people = useMemo(
    () =>
      mergePeople({
        collectors,
        friends,
        incomingRequests,
        outgoingRequests,
        activeFriendId,
      }),
    [activeFriendId, collectors, friends, incomingRequests, outgoingRequests]
  );

  async function addCollector(collector: SocialCollectorSummary) {
    if (pendingAction) return;

    setPendingAction({ kind: "add_collector", id: collector.id });
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/social/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: collector.id }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not add friend");
      }

      setMessage(
        data.status === "accepted"
          ? `${collector.displayName} added.`
          : `Friend request sent to ${collector.displayName}.`
      );
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not add friend");
    } finally {
      setPendingAction(null);
    }
  }

  async function acceptRequest(connectionId: string) {
    if (pendingAction) return;

    setPendingAction({ kind: "accept", id: connectionId });
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/social/friends/${encodeURIComponent(connectionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not accept request");
      }

      setMessage("Friend request accepted.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not accept request");
    } finally {
      setPendingAction(null);
    }
  }

  async function removeConnection(connectionId: string) {
    if (pendingAction) return;

    setPendingAction({ kind: "remove", id: connectionId });
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/social/friends/${encodeURIComponent(connectionId)}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove friend connection");
      }

      setMessage("Updated.");
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not remove friend connection"
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function updateFullAccess(
    connectionId: string,
    action: FullAccessAction,
    successMessage: string
  ) {
    if (pendingAction) return;

    setPendingAction({ kind: action, id: connectionId });
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/social/friends/${encodeURIComponent(connectionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not update Full Access");
      }

      setMessage(successMessage);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not update Full Access"
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="binder-panel rounded-[var(--ui-page-header-radius)] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] text-violet-100">
            <UsersRound className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-white">People</h2>
            <p className="truncate text-[11px] font-semibold text-white/42">
              Collectors & friends
            </p>
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-black/18 px-2 py-0.5 text-[10px] font-black text-white/48">
          {formatCount(people.length)}
        </span>
      </div>

      {people.length > 0 ? (
        <div className="grid max-h-[34rem] gap-2 overflow-y-auto pr-1">
          {people.map((person) => {
            const active = person.id === activeFriendId;
            const friend = person.friend;
            const isAdding = isPendingAction(pendingAction, "add_collector", person.id);
            const isAccepting = person.connectionId
              ? isPendingAction(pendingAction, "accept", person.connectionId)
              : false;
            const isRemoving = person.connectionId
              ? isPendingAction(pendingAction, "remove", person.connectionId)
              : false;

            return (
              <article
                key={person.id}
                className={`rounded-xl border p-2 transition-colors ${
                  active
                    ? "border-violet-300/28 bg-violet-500/[0.12]"
                    : "border-white/8 bg-white/[0.03]"
                }`}
              >
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/18 text-sm font-black text-white">
                    {person.initial}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-black text-white">
                      {person.displayName}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[10px] font-semibold text-white/40">
                        {getPersonMeta(person)}
                      </span>
                      <span
                        className={`inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-black ${getRelationshipClass(
                          person,
                          active
                        )}`}
                      >
                        {getRelationshipLabel(person, active)}
                      </span>
                      {person.friend?.hasFullAccess ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300/18 bg-emerald-500/[0.10] px-1.5 py-0.5 text-[9px] font-black text-emerald-100">
                          <ShieldCheck className="h-2.5 w-2.5" />
                          Full
                        </span>
                      ) : null}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center justify-end gap-1">
                    {person.relationship === "friend" && friend ? (
                      <>
                        {active ? (
                          <span className="inline-flex h-8 items-center justify-center rounded-lg border border-violet-300/22 bg-violet-500/[0.16] px-2 text-[10px] font-black text-violet-50">
                            Open
                          </span>
                        ) : (
                          <Link
                            href={buildFriendHref(person.id, gameParam)}
                            prefetch={false}
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-emerald-300/18 bg-emerald-500/[0.10] px-2 text-[10px] font-black text-emerald-100 transition-colors hover:bg-emerald-500/[0.16]"
                          >
                            Open
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => removeConnection(friend.connectionId)}
                          disabled={Boolean(pendingAction)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/18 text-white/42 transition-colors hover:border-rose-300/18 hover:bg-rose-500/[0.08] hover:text-rose-100 disabled:cursor-wait disabled:opacity-55"
                          aria-label={`Remove ${person.displayName}`}
                          title="Remove friend"
                        >
                          {isRemoving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </>
                    ) : person.relationship === "request_received" && person.connectionId ? (
                      <>
                        <button
                          type="button"
                          onClick={() => acceptRequest(person.connectionId as string)}
                          disabled={Boolean(pendingAction)}
                          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-emerald-300/18 bg-emerald-500/[0.10] px-2 text-[10px] font-black text-emerald-100 transition-colors hover:bg-emerald-500/[0.16] disabled:cursor-wait disabled:opacity-55"
                        >
                          {isAccepting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => removeConnection(person.connectionId as string)}
                          disabled={Boolean(pendingAction)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/18 text-white/42 transition-colors hover:border-rose-300/18 hover:bg-rose-500/[0.08] hover:text-rose-100 disabled:cursor-wait disabled:opacity-55"
                          aria-label={`Decline ${person.displayName}`}
                          title="Decline"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : person.relationship === "request_sent" && person.connectionId ? (
                      <button
                        type="button"
                        onClick={() => removeConnection(person.connectionId as string)}
                        disabled={Boolean(pendingAction)}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-amber-300/18 bg-amber-500/[0.10] px-2 text-[10px] font-black text-amber-100 transition-colors hover:bg-amber-500/[0.16] disabled:cursor-wait disabled:opacity-55"
                      >
                        {isRemoving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Clock3 className="h-3.5 w-3.5" />
                        )}
                        Sent
                      </button>
                    ) : person.collector ? (
                      <button
                        type="button"
                        onClick={() => addCollector(person.collector as SocialCollectorSummary)}
                        disabled={Boolean(pendingAction)}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-violet-300/22 bg-violet-500/[0.16] px-2 text-[10px] font-black text-violet-50 transition-colors hover:bg-violet-500/[0.22] disabled:cursor-wait disabled:opacity-55"
                      >
                        {isAdding ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="h-3.5 w-3.5" />
                        )}
                        Add
                      </button>
                    ) : null}
                  </span>
                </div>

                {active && friend ? (
                  <FullAccessControls
                    friend={friend}
                    pendingAction={pendingAction}
                    disabled={Boolean(pendingAction)}
                    onUpdate={updateFullAccess}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-6 text-center">
          <UsersRound className="mx-auto h-5 w-5 text-white/24" />
          <p className="mt-2 text-sm font-black text-white/74">No collectors with cards yet</p>
        </div>
      )}

      {message ? (
        <p className="mt-2 rounded-xl border border-emerald-300/14 bg-emerald-500/[0.07] px-3 py-2 text-[11px] font-semibold text-emerald-100">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-xl border border-rose-300/16 bg-rose-500/[0.08] px-3 py-2 text-[11px] font-semibold text-rose-100">
          {error}
        </p>
      ) : null}
    </section>
  );
}
