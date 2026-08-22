import {
  BadgeCheck,
  Boxes,
  Heart,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import AccountActions from "@/components/AccountActions";
import AdminUsersPanel, { type AdminUserSummary } from "@/components/AdminUsersPanel";
import { PageHeroHeader, type HeaderStat } from "@/components/PageHeader";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/page-auth";
import AccountTabs from "./AccountTabs";

export const dynamic = "force-dynamic";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "--";
  return DATE_TIME_FORMATTER.format(new Date(value));
}

function formatCount(value: number): string {
  return NUMBER_FORMATTER.format(value);
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "emerald" | "amber" | "slate";
  children: ReactNode;
}) {
  const className =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200"
      : tone === "amber"
        ? "border-amber-400/20 bg-amber-400/[0.08] text-amber-200"
        : "border-white/10 bg-white/[0.055] text-white/70";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

function InfoTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/36">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-white" title={String(value)}>
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 truncate text-[11px] text-white/45" title={String(hint)}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function AccountOverview({
  account,
  activeSessionCount,
}: {
  account: {
    id: string;
    email: string;
    role: string;
    disabled: boolean;
    email_verified_at: Date | null;
    created_at: Date;
    updated_at: Date;
    settings_json: string | null;
    mfa_enabled_at: Date | null;
    _count: {
      binders: number;
      collectionCards: number;
      sealedItems: number;
      wants: number;
      sessions: number;
    };
  };
  activeSessionCount: number;
}) {
  const verified = Boolean(account.email_verified_at);
  const collectionTotal =
    account._count.collectionCards + account._count.sealedItems + account._count.wants;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <section className="binder-panel rounded-2xl p-4 sm:p-5">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-white/40" />
              <h2 className="text-base font-semibold text-white">
                Account Identity
              </h2>
            </div>
            <p className="mt-1 text-sm text-white/45">
              Login, role, verification, and session state.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge tone={account.disabled ? "amber" : "emerald"}>
              {account.disabled ? "Disabled" : "Active"}
            </StatusBadge>
            <StatusBadge tone={verified ? "emerald" : "amber"}>
              {verified ? "Verified" : "Not verified"}
            </StatusBadge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <InfoTile label="Email" value={account.email} hint="Primary login" />
          <InfoTile label="Role" value={account.role === "admin" ? "Admin" : "User"} hint="Access level" />
          <InfoTile label="Account ID" value={shortId(account.id)} hint="Internal reference" />
          <InfoTile label="Created" value={formatDateTime(account.created_at)} />
          <InfoTile label="Updated" value={formatDateTime(account.updated_at)} />
          <InfoTile
            label="Verified"
            value={account.email_verified_at ? formatDateTime(account.email_verified_at) : "--"}
            hint={verified ? "Email confirmed" : "Email not confirmed"}
          />
        </div>
      </section>

      <section className="binder-panel rounded-2xl p-4 sm:p-5">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-white/40" />
              <h2 className="text-base font-semibold text-white">
                Account Footprint
              </h2>
            </div>
            <p className="mt-1 text-sm text-white/45">
              Your saved library, sessions, and synced preferences.
            </p>
          </div>
          <StatusBadge tone={account.settings_json ? "emerald" : "slate"}>
            {account.settings_json ? "Settings synced" : "Default settings"}
          </StatusBadge>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          <InfoTile label="Collection cards" value={formatCount(account._count.collectionCards)} />
          <InfoTile label="Sealed items" value={formatCount(account._count.sealedItems)} />
          <InfoTile label="Binders" value={formatCount(account._count.binders)} />
          <InfoTile label="Wants" value={formatCount(account._count.wants)} />
          <InfoTile
            label="Active sessions"
            value={formatCount(activeSessionCount)}
            hint={`${formatCount(account._count.sessions)} stored total`}
          />
          <InfoTile label="Saved records" value={formatCount(collectionTotal)} hint="cards, sealed, wants" />
        </div>
      </section>
    </div>
  );
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; user?: string }>;
}) {
  const requested = await searchParams;
  const user = await requirePageUser("/account");
  const now = new Date();
  const [account, activeSessionCount] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        email_verified_at: true,
        role: true,
        disabled: true,
        settings_json: true,
        mfa_enabled_at: true,
        created_at: true,
        updated_at: true,
        _count: {
          select: {
            binders: true,
            collectionCards: true,
            sealedItems: true,
            wants: true,
            sessions: true,
          },
        },
      },
    }),
    db.session.count({
      where: {
        user_id: user.id,
        expires_at: { gt: now },
      },
    }),
  ]);

  if (!account) {
    throw new Error("Account record not found");
  }

  const managedUsers: AdminUserSummary[] =
    user.role === "admin"
      ? (
          await db.user.findMany({
            orderBy: [{ role: "asc" }, { disabled: "desc" }, { email: "asc" }],
            select: {
              id: true,
              email: true,
              email_verified_at: true,
              role: true,
              disabled: true,
              created_at: true,
              updated_at: true,
              _count: {
                select: {
                  binders: true,
                  collectionCards: true,
                  sealedItems: true,
                  sessions: true,
                },
              },
            },
          })
        ).map((managedUser) => ({
          id: managedUser.id,
          email: managedUser.email,
          emailVerifiedAt: managedUser.email_verified_at?.toISOString() ?? null,
          role: managedUser.role === "admin" ? "admin" : "user",
          disabled: managedUser.disabled,
          createdAt: managedUser.created_at.toISOString(),
          updatedAt: managedUser.updated_at.toISOString(),
          counts: {
            binders: managedUser._count.binders,
            cards: managedUser._count.collectionCards,
            sealed: managedUser._count.sealedItems,
            sessions: managedUser._count.sessions,
          },
        }))
      : [];

  const totalSavedItems =
    account._count.collectionCards + account._count.sealedItems + account._count.wants;
  const requestedUserId =
    typeof requested.user === "string" && managedUsers.some((managedUser) => managedUser.id === requested.user)
      ? requested.user
      : undefined;
  const defaultAccountTab =
    requested.tab === "security"
      ? "security"
      : requested.tab === "users" && user.role === "admin"
        ? "users"
        : "overview";
  const headerStats = [
    {
      label: "Role",
      value: account.role === "admin" ? "Admin" : "User",
      Icon: ShieldCheck,
      tone: account.role === "admin" ? "violet" : "slate",
    },
    {
      label: "Verified",
      value: account.email_verified_at ? "Yes" : "No",
      Icon: BadgeCheck,
      tone: account.email_verified_at ? "emerald" : "amber",
    },
    {
      label: "Active sessions",
      value: formatCount(activeSessionCount),
      Icon: LockKeyhole,
      tone: "sky",
    },
    {
      label: "Saved items",
      value: formatCount(totalSavedItems),
      Icon: Heart,
      tone: "rose",
    },
  ] satisfies HeaderStat[];

  return (
    <div className="page-container page-readable binder-bottom-safe mx-auto max-w-6xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <PageHeroHeader
        eyebrow="DustyCards Account"
        title="Account"
        description={`Signed in as ${account.email}. Manage your profile, security, sessions, and access.`}
        className="mb-8"
        stats={headerStats}
      />

      <AccountTabs
        defaultKey={defaultAccountTab}
        tabs={[
          {
            key: "overview",
            label: "Overview",
            description: "Account identity, activity footprint, and saved library stats.",
            content: <AccountOverview account={account} activeSessionCount={activeSessionCount} />,
          },
          {
            key: "security",
            label: "Security",
            description: "Password and current session controls.",
            content: <AccountActions initialMfaEnabled={Boolean(account.mfa_enabled_at)} isAdmin={account.role === "admin"} />,
          },
          ...(user.role === "admin"
            ? [
                {
                  key: "users",
                  label: "Users",
                  description: "Admin controls for accounts, roles, access, and password resets.",
                  content: (
                    <AdminUsersPanel
                      currentUserId={user.id}
                      initialUserId={requestedUserId}
                      users={managedUsers}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
