import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/auth-crypto";
import {
  isSpecificTradingCardGame,
  type TradingCardGameFilter,
} from "@/lib/games";

export type SocialConnectionStatus = "pending" | "accepted";
export type SocialFullAccessStatus = "none" | "pending" | "accepted";
export type SocialRelationship = "none" | "friend" | "request_sent" | "request_received";

export class SocialError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SocialError";
    this.status = status;
  }
}

export interface SocialUserSummary {
  id: string;
  email: string;
  displayName: string;
  initial: string;
}

export interface SocialFriendSummary extends SocialUserSummary {
  connectionId: string;
  acceptedAt: string | null;
  fullAccessStatus: SocialFullAccessStatus;
  fullAccessRequesterId: string | null;
  fullAccessRequestedAt: string | null;
  fullAccessAcceptedAt: string | null;
  hasFullAccess: boolean;
  fullAccessPendingByMe: boolean;
  canAcceptFullAccess: boolean;
  cards: number;
  binders: number;
  sealedUnits: number;
}

export interface SocialRequestSummary extends SocialUserSummary {
  connectionId: string;
  createdAt: string;
}

export interface SocialCollectorSummary extends SocialUserSummary {
  relationship: SocialRelationship;
  connectionId: string | null;
  cards: number;
  binders: number;
}

export interface SocialPageData {
  collectors: SocialCollectorSummary[];
  friends: SocialFriendSummary[];
  incomingRequests: SocialRequestSummary[];
  outgoingRequests: SocialRequestSummary[];
  activeFriend: SocialFriendSummary | null;
}

export interface SocialTradeMatchCard {
  id: string;
  name: string;
  cardNumber: string | null;
  episodeName: string;
  imageUrl: string | null;
  value: number | null;
  availableCopies: number;
}

export interface SocialTradeMatches {
  yourCardsTheyWant: SocialTradeMatchCard[];
  theirCardsYouWant: SocialTradeMatchCard[];
  yourOfferValue: number;
  theirOfferValue: number;
}

export interface SocialTradeOpportunity {
  friend: SocialUserSummary;
  matches: SocialTradeMatches;
}

type SocialConnectionWithUsers = Awaited<ReturnType<typeof getUserConnections>>[number];

function getDisplayName(email: string): string {
  const localPart = email.split("@")[0]?.trim();
  if (!localPart) return "Collector";

  return localPart
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function toUserSummary(user: { id: string; email: string }): SocialUserSummary {
  const displayName = getDisplayName(user.email);
  return {
    id: user.id,
    email: user.email,
    displayName,
    initial: displayName.slice(0, 1).toUpperCase() || user.email.slice(0, 1).toUpperCase(),
  };
}

function getConnectionPair(userId: string, targetUserId: string) {
  return userId < targetUserId
    ? { user_a_id: userId, user_b_id: targetUserId }
    : { user_a_id: targetUserId, user_b_id: userId };
}

function normalizeFullAccessStatus(
  status: string | null | undefined
): SocialFullAccessStatus {
  return status === "pending" || status === "accepted" ? status : "none";
}

function getOtherUser(connection: SocialConnectionWithUsers, currentUserId: string) {
  return connection.requester_id === currentUserId
    ? connection.addressee
    : connection.requester;
}

function getRelationship(
  connection: SocialConnectionWithUsers | undefined,
  currentUserId: string
): SocialRelationship {
  if (!connection) return "none";
  if (connection.status === "accepted") return "friend";
  return connection.requester_id === currentUserId ? "request_sent" : "request_received";
}

function isParticipant(
  connection: {
    requester_id: string;
    addressee_id: string;
    user_a_id?: string;
    user_b_id?: string;
  },
  userId: string
) {
  return (
    connection.requester_id === userId ||
    connection.addressee_id === userId ||
    connection.user_a_id === userId ||
    connection.user_b_id === userId
  );
}

async function getUserConnections(userId: string) {
  return db.socialConnection.findMany({
    where: {
      OR: [{ user_a_id: userId }, { user_b_id: userId }],
    },
    orderBy: [{ status: "asc" }, { updated_at: "desc" }],
    include: {
      requester: { select: { id: true, email: true } },
      addressee: { select: { id: true, email: true } },
    },
  });
}

async function getFriendStats(userId: string) {
  const [cards, binders, sealed] = await Promise.all([
    db.collectionCard.count({
      where: { user_id: userId, for_sale: false, sold_at: null },
    }),
    db.collectionBinder.count({ where: { user_id: userId } }),
    db.collectionSealed.aggregate({
      where: { user_id: userId },
      _sum: { quantity: true },
    }),
  ]);

  return {
    cards,
    binders,
    sealedUnits: sealed._sum.quantity ?? 0,
  };
}

async function getDiscoverableCollectors(
  currentUserId: string,
  connections: SocialConnectionWithUsers[]
): Promise<SocialCollectorSummary[]> {
  const connectionByUserId = new Map<string, SocialConnectionWithUsers>();
  for (const connection of connections) {
    connectionByUserId.set(getOtherUser(connection, currentUserId).id, connection);
  }

  const users = await db.user.findMany({
    where: {
      id: { not: currentUserId },
      disabled: false,
      email_verified_at: { not: null },
      collectionCards: {
        some: { for_sale: false, sold_at: null },
      },
    },
    select: {
      id: true,
      email: true,
      _count: {
        select: {
          collectionCards: {
            where: { for_sale: false, sold_at: null },
          },
          binders: true,
        },
      },
    },
    orderBy: { email: "asc" },
  });

  return users
    .map((user) => {
      const connection = connectionByUserId.get(user.id);

      return {
        ...toUserSummary(user),
        relationship: getRelationship(connection, currentUserId),
        connectionId: connection?.id ?? null,
        cards: user._count.collectionCards,
        binders: user._count.binders,
      };
    })
    .sort((a, b) => {
      const relationshipOrder: Record<SocialRelationship, number> = {
        none: 0,
        request_received: 1,
        request_sent: 2,
        friend: 3,
      };

      return (
        relationshipOrder[a.relationship] - relationshipOrder[b.relationship] ||
        b.cards - a.cards ||
        a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
      );
    });
}

async function toFriendSummary(
  connection: SocialConnectionWithUsers,
  currentUserId: string
): Promise<SocialFriendSummary> {
  const user = getOtherUser(connection, currentUserId);
  const stats = await getFriendStats(user.id);
  const fullAccessStatus = normalizeFullAccessStatus(connection.full_access_status);
  const fullAccessRequesterId = connection.full_access_requester_id ?? null;

  return {
    ...toUserSummary(user),
    connectionId: connection.id,
    acceptedAt: connection.accepted_at?.toISOString() ?? null,
    fullAccessStatus,
    fullAccessRequesterId,
    fullAccessRequestedAt: connection.full_access_requested_at?.toISOString() ?? null,
    fullAccessAcceptedAt: connection.full_access_accepted_at?.toISOString() ?? null,
    hasFullAccess: fullAccessStatus === "accepted",
    fullAccessPendingByMe:
      fullAccessStatus === "pending" && fullAccessRequesterId === currentUserId,
    canAcceptFullAccess:
      fullAccessStatus === "pending" && fullAccessRequesterId !== currentUserId,
    ...stats,
  };
}

function toRequestSummary(
  connection: SocialConnectionWithUsers,
  currentUserId: string
): SocialRequestSummary {
  const user = getOtherUser(connection, currentUserId);
  return {
    ...toUserSummary(user),
    connectionId: connection.id,
    createdAt: connection.created_at.toISOString(),
  };
}

export async function getSocialPageData(
  currentUserId: string,
  selectedFriendId?: string | null
): Promise<SocialPageData> {
  const connections = await getUserConnections(currentUserId);
  const acceptedConnections = connections.filter((connection) => connection.status === "accepted");
  const incomingConnections = connections.filter(
    (connection) =>
      connection.status === "pending" && connection.addressee_id === currentUserId
  );
  const outgoingConnections = connections.filter(
    (connection) =>
      connection.status === "pending" && connection.requester_id === currentUserId
  );
  const friends = await Promise.all(
    acceptedConnections.map((connection) => toFriendSummary(connection, currentUserId))
  );
  const collectors = await getDiscoverableCollectors(currentUserId, connections);
  const sortedFriends = friends.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
  );
  const activeFriend =
    sortedFriends.find((friend) => friend.id === selectedFriendId) ??
    sortedFriends[0] ??
    null;

  return {
    collectors,
    friends: sortedFriends,
    incomingRequests: incomingConnections.map((connection) =>
      toRequestSummary(connection, currentUserId)
    ),
    outgoingRequests: outgoingConnections.map((connection) =>
      toRequestSummary(connection, currentUserId)
    ),
    activeFriend,
  };
}

export async function assertCanViewSocialCollection(
  currentUserId: string,
  targetUserId: string
): Promise<void> {
  if (currentUserId === targetUserId) return;

  const pair = getConnectionPair(currentUserId, targetUserId);
  const connection = await db.socialConnection.findUnique({
    where: { user_a_id_user_b_id: pair },
    select: { status: true },
  });

  if (connection?.status !== "accepted") {
    throw new SocialError("You can only view accepted friends.", 403);
  }
}

export async function getSocialTradeMatches(
  currentUserId: string,
  friendUserId: string,
  game: TradingCardGameFilter = "all"
): Promise<SocialTradeMatches | null> {
  const pairIds = getConnectionPair(currentUserId, friendUserId);
  const connection = await db.socialConnection.findUnique({
    where: { user_a_id_user_b_id: pairIds },
    select: { status: true, full_access_status: true },
  });
  if (connection?.status !== "accepted" || connection.full_access_status !== "accepted") {
    return null;
  }

  const [yourCopies, theirCopies, yourWants, theirWants] = await Promise.all([
    db.collectionCard.findMany({
      where: {
        user_id: currentUserId,
        sold_at: null,
        ...(isSpecificTradingCardGame(game) ? { card: { game } } : {}),
      },
      select: { card_id: true, for_sale: true },
    }),
    db.collectionCard.findMany({
      where: {
        user_id: friendUserId,
        sold_at: null,
        ...(isSpecificTradingCardGame(game) ? { card: { game } } : {}),
      },
      select: { card_id: true, for_sale: true },
    }),
    db.collectionWant.findMany({
      where: {
        user_id: currentUserId,
        dismissed_at: null,
        ...(isSpecificTradingCardGame(game) ? { card: { game } } : {}),
      },
      select: { card_id: true },
    }),
    db.collectionWant.findMany({
      where: {
        user_id: friendUserId,
        dismissed_at: null,
        ...(isSpecificTradingCardGame(game) ? { card: { game } } : {}),
      },
      select: { card_id: true },
    }),
  ]);

  function available(rows: Array<{ card_id: string; for_sale: boolean }>) {
    const grouped = new Map<string, { total: number; listed: number }>();
    for (const row of rows) {
      const value = grouped.get(row.card_id) ?? { total: 0, listed: 0 };
      value.total += 1;
      if (row.for_sale) value.listed += 1;
      grouped.set(row.card_id, value);
    }
    return new Map(
      [...grouped.entries()]
        .map(([cardId, value]) => [cardId, Math.max(value.listed, value.total - 1)] as const)
        .filter((entry) => entry[1] > 0)
    );
  }

  const yours = available(yourCopies);
  const theirs = available(theirCopies);
  const yourWantIds = new Set(yourWants.map((item) => item.card_id));
  const theirWantIds = new Set(theirWants.map((item) => item.card_id));
  const yourMatchIds = [...yours.keys()].filter((cardId) => theirWantIds.has(cardId));
  const theirMatchIds = [...theirs.keys()].filter((cardId) => yourWantIds.has(cardId));
  const ids = [...new Set([...yourMatchIds, ...theirMatchIds])];
  if (ids.length === 0) {
    return { yourCardsTheyWant: [], theirCardsYouWant: [], yourOfferValue: 0, theirOfferValue: 0 };
  }
  const cards = await db.card.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      card_number: true,
      image_url: true,
      episode: { select: { name: true } },
      prices: {
        where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
        orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
        take: 1,
        select: { cm_en_lowest_nm: true },
      },
    },
  });
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const build = (cardIds: string[], counts: Map<string, number>) => cardIds
    .map((cardId) => {
      const card = cardById.get(cardId);
      if (!card) return null;
      return {
        id: card.id,
        name: card.name,
        cardNumber: card.card_number,
        episodeName: card.episode.name,
        imageUrl: card.image_url,
        value: card.prices[0]?.cm_en_lowest_nm ?? null,
        availableCopies: counts.get(card.id) ?? 1,
      };
    })
    .filter((card): card is SocialTradeMatchCard => Boolean(card))
    .sort((left, right) => (right.value ?? -1) - (left.value ?? -1))
    .slice(0, 12);
  const yourCardsTheyWant = build(yourMatchIds, yours);
  const theirCardsYouWant = build(theirMatchIds, theirs);
  const sum = (items: SocialTradeMatchCard[]) => Number(items.reduce((total, item) => total + (item.value ?? 0), 0).toFixed(2));
  return {
    yourCardsTheyWant,
    theirCardsYouWant,
    yourOfferValue: sum(yourCardsTheyWant),
    theirOfferValue: sum(theirCardsYouWant),
  };
}

export async function getSocialTradeOpportunities(
  currentUserId: string,
  game: TradingCardGameFilter = "all"
): Promise<SocialTradeOpportunity[]> {
  const connections = (await getUserConnections(currentUserId)).filter(
    (connection) =>
      connection.status === "accepted" && connection.full_access_status === "accepted"
  );

  const opportunities = await Promise.all(
    connections.map(async (connection) => {
      const friend = toUserSummary(getOtherUser(connection, currentUserId));
      const matches = await getSocialTradeMatches(currentUserId, friend.id, game);
      return matches ? { friend, matches } : null;
    })
  );

  return opportunities
    .filter((item): item is SocialTradeOpportunity => Boolean(item))
    .sort((left, right) => {
      const leftCount =
        left.matches.yourCardsTheyWant.length + left.matches.theirCardsYouWant.length;
      const rightCount =
        right.matches.yourCardsTheyWant.length + right.matches.theirCardsYouWant.length;
      return (
        rightCount - leftCount ||
        left.friend.displayName.localeCompare(right.friend.displayName, undefined, {
          sensitivity: "base",
        })
      );
    });
}

async function sendFriendRequestToTarget(
  currentUserId: string,
  targetUser: {
    id: string;
    disabled: boolean;
    email_verified_at: Date | null;
  } | null
) {
  if (!targetUser || targetUser.disabled || !targetUser.email_verified_at) {
    throw new SocialError("No active account found.", 404);
  }

  if (targetUser.id === currentUserId) {
    throw new SocialError("You cannot add your own account.");
  }

  const pair = getConnectionPair(currentUserId, targetUser.id);
  const existing = await db.socialConnection.findUnique({
    where: { user_a_id_user_b_id: pair },
  });

  if (existing?.status === "accepted") {
    return { status: "accepted" as const, connectionId: existing.id };
  }

  if (existing?.status === "pending") {
    if (existing.addressee_id === currentUserId) {
      const accepted = await db.socialConnection.update({
        where: { id: existing.id },
        data: {
          status: "accepted",
          accepted_at: new Date(),
        },
      });
      return { status: "accepted" as const, connectionId: accepted.id };
    }

    throw new SocialError("Friend request already sent.");
  }

  const connection = await db.socialConnection.create({
    data: {
      requester_id: currentUserId,
      addressee_id: targetUser.id,
      ...pair,
      status: "pending",
    },
  });

  return { status: "pending" as const, connectionId: connection.id };
}

export async function sendFriendRequest(currentUserId: string, email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || normalizedEmail.length > 320) {
    throw new SocialError("Fill in a valid email address.");
  }

  const targetUser = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      disabled: true,
      email_verified_at: true,
    },
  });

  return sendFriendRequestToTarget(currentUserId, targetUser);
}

export async function sendFriendRequestToUserId(currentUserId: string, targetUserId: string) {
  const targetUser = await db.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      disabled: true,
      email_verified_at: true,
    },
  });

  return sendFriendRequestToTarget(currentUserId, targetUser);
}

export async function acceptFriendRequest(currentUserId: string, connectionId: string) {
  const connection = await db.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection || !isParticipant(connection, currentUserId)) {
    throw new SocialError("Friend request not found.", 404);
  }

  if (connection.addressee_id !== currentUserId) {
    throw new SocialError("Only the receiving account can accept this request.", 403);
  }

  if (connection.status === "accepted") {
    return { status: "accepted" as const, connectionId: connection.id };
  }

  const accepted = await db.socialConnection.update({
    where: { id: connection.id },
    data: {
      status: "accepted",
      accepted_at: new Date(),
    },
  });

  return { status: "accepted" as const, connectionId: accepted.id };
}

async function getAcceptedSocialConnection(currentUserId: string, connectionId: string) {
  const connection = await db.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection || !isParticipant(connection, currentUserId)) {
    throw new SocialError("Friend connection not found.", 404);
  }

  if (connection.status !== "accepted") {
    throw new SocialError("Full Access is only available for accepted friends.", 403);
  }

  return connection;
}

function fullAccessResult(
  connection: {
    id: string;
    full_access_status: string;
    full_access_requester_id: string | null;
  },
  currentUserId: string
) {
  const fullAccessStatus = normalizeFullAccessStatus(connection.full_access_status);

  return {
    connectionId: connection.id,
    fullAccessStatus,
    hasFullAccess: fullAccessStatus === "accepted",
    fullAccessPendingByMe:
      fullAccessStatus === "pending" &&
      connection.full_access_requester_id === currentUserId,
    canAcceptFullAccess:
      fullAccessStatus === "pending" &&
      connection.full_access_requester_id !== currentUserId,
  };
}

export async function requestSocialFullAccess(
  currentUserId: string,
  connectionId: string
) {
  const connection = await getAcceptedSocialConnection(currentUserId, connectionId);
  const fullAccessStatus = normalizeFullAccessStatus(connection.full_access_status);

  if (fullAccessStatus === "accepted") {
    return fullAccessResult(connection, currentUserId);
  }

  if (fullAccessStatus === "pending") {
    if (connection.full_access_requester_id === currentUserId) {
      return fullAccessResult(connection, currentUserId);
    }

    const accepted = await db.socialConnection.update({
      where: { id: connection.id },
      data: {
        full_access_status: "accepted",
        full_access_accepted_at: new Date(),
      },
    });

    return fullAccessResult(accepted, currentUserId);
  }

  const requested = await db.socialConnection.update({
    where: { id: connection.id },
    data: {
      full_access_status: "pending",
      full_access_requester_id: currentUserId,
      full_access_requested_at: new Date(),
      full_access_accepted_at: null,
    },
  });

  return fullAccessResult(requested, currentUserId);
}

export async function acceptSocialFullAccess(
  currentUserId: string,
  connectionId: string
) {
  const connection = await getAcceptedSocialConnection(currentUserId, connectionId);
  const fullAccessStatus = normalizeFullAccessStatus(connection.full_access_status);

  if (fullAccessStatus === "accepted") {
    return fullAccessResult(connection, currentUserId);
  }

  if (fullAccessStatus !== "pending") {
    throw new SocialError("No Full Access request is pending.", 400);
  }

  if (connection.full_access_requester_id === currentUserId) {
    throw new SocialError("The other account needs to accept Full Access.", 403);
  }

  const accepted = await db.socialConnection.update({
    where: { id: connection.id },
    data: {
      full_access_status: "accepted",
      full_access_accepted_at: new Date(),
    },
  });

  return fullAccessResult(accepted, currentUserId);
}

export async function resetSocialFullAccess(
  currentUserId: string,
  connectionId: string
) {
  const connection = await getAcceptedSocialConnection(currentUserId, connectionId);
  const fullAccessStatus = normalizeFullAccessStatus(connection.full_access_status);

  if (fullAccessStatus === "none") {
    return fullAccessResult(connection, currentUserId);
  }

  const reset = await db.socialConnection.update({
    where: { id: connection.id },
    data: {
      full_access_status: "none",
      full_access_requester_id: null,
      full_access_requested_at: null,
      full_access_accepted_at: null,
    },
  });

  return fullAccessResult(reset, currentUserId);
}

export async function removeSocialConnection(currentUserId: string, connectionId: string) {
  const connection = await db.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection || !isParticipant(connection, currentUserId)) {
    throw new SocialError("Friend connection not found.", 404);
  }

  await db.socialConnection.delete({ where: { id: connection.id } });
  return { ok: true };
}
