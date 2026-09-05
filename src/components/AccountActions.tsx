"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import AccountPasskeys from "@/components/AccountPasskeys";
import { Copy, Download, KeyRound, LogOut, ShieldCheck } from "lucide-react";

export default function AccountActions({
  initialMfaEnabled,
  isAdmin,
}: {
  initialMfaEnabled: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(initialMfaEnabled);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaUri, setMfaUri] = useState<string | null>(null);
  const [mfaQrCode, setMfaQrCode] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [recoveryCodesSaved, setRecoveryCodesSaved] = useState(false);

  useEffect(() => {
    if (recoveryCodes.length === 0 || recoveryCodesSaved) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function warnBeforeNavigation(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const target = new URL(link.href, window.location.href);
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      if (!window.confirm("Your recovery codes are shown only once. Leave without confirming you saved them?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    document.addEventListener("click", warnBeforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      document.removeEventListener("click", warnBeforeNavigation, true);
    };
  }, [recoveryCodes.length, recoveryCodesSaved]);

  async function copyMfaValue(value: string, successMessage: string) {
    setMfaError(null);
    try {
      await navigator.clipboard.writeText(value);
      setMfaMessage(successMessage);
    } catch {
      setMfaError("Could not copy automatically. Select and copy the text below, or download your recovery codes.");
    }
  }

  function downloadRecoveryCodes() {
    const file = new Blob([
      "DustyCards recovery codes\nKeep these somewhere private. Each code can be used once.\n\n",
      recoveryCodes.join("\n"),
      "\n",
    ], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dustycards-recovery-codes.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMfaMessage("Recovery code download started. Confirm below once you have saved them somewhere private.");
  }

  async function prepareMfa() {
    setMfaLoading(true);
    setMfaError(null);
    setMfaMessage(null);
    try {
      const response = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare" }),
      });
      const data = (await response.json()) as { error?: string; secret?: string; uri?: string; qrCode?: string };
      if (!response.ok || !data.secret || !data.uri) throw new Error(data.error ?? "Could not start MFA setup");
      setMfaSecret(data.secret);
      setMfaUri(data.uri);
      setMfaQrCode(data.qrCode ?? null);
    } catch (caught) {
      setMfaError(caught instanceof Error ? caught.message : "Could not start MFA setup");
    } finally {
      setMfaLoading(false);
    }
  }

  async function enableMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMfaLoading(true);
    setMfaError(null);
    setMfaMessage(null);
    try {
      const response = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable", code: mfaCode }),
      });
      const data = (await response.json()) as { error?: string; recoveryCodes?: string[] };
      if (!response.ok) throw new Error(data.error ?? "Could not enable MFA");
      setMfaEnabled(true);
      setMfaSecret(null);
      setMfaUri(null);
      setMfaQrCode(null);
      setRecoveryCodes(data.recoveryCodes ?? []);
      setRecoveryCodesSaved(false);
      setMfaCode("");
      setMfaMessage("Authenticator protection is now enabled. Save your recovery codes before leaving this page.");
      router.refresh();
    } catch (caught) {
      setMfaError(caught instanceof Error ? caught.message : "Could not enable MFA");
    } finally {
      setMfaLoading(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Could not log out. Check your connection and try again.");
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
    <div className="grid gap-4">
    <AccountPasskeys mfaEnabled={mfaEnabled} />
    <section className="binder-panel rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-violet-200" />
            <h2 className="text-base font-semibold text-white">Authenticator protection</h2>
          </div>
          <p className="mt-1 text-sm text-white/45">
            {isAdmin ? "Required before admin controls can be used." : "Protect your account with a second sign-in factor."}
          </p>
        </div>
        <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${mfaEnabled ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200" : "border-amber-400/20 bg-amber-400/[0.08] text-amber-200"}`}>
          {mfaEnabled ? "Enabled" : isAdmin ? "Setup required" : "Not enabled"}
        </span>
      </div>

      {!mfaEnabled && !mfaSecret ? (
        <button type="button" onClick={prepareMfa} disabled={mfaLoading} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60">
          {mfaLoading ? "Preparing..." : "Set up authenticator"}
        </button>
      ) : null}

      {!mfaEnabled && mfaSecret && mfaUri ? (
        <form onSubmit={enableMfa} className="mt-4 grid gap-3 rounded-xl border border-violet-300/15 bg-violet-500/[0.06] p-4">
          <p className="text-sm text-white/65">Scan with your authenticator app, or add the setup key manually.</p>
          {mfaQrCode ? <Image src={mfaQrCode} alt="Authenticator setup QR code" width={256} height={256} unoptimized className="mx-auto h-auto max-w-full rounded-lg" /> : null}
          <code className="break-all rounded-lg bg-black/25 p-3 text-sm font-bold tracking-[0.12em] text-violet-100">{mfaSecret}</code>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => copyMfaValue(mfaSecret, "Setup key copied.")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm font-semibold text-white hover:bg-white/8"><Copy className="size-4" aria-hidden="true" />Copy setup key</button>
            <a href={mfaUri} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-violet-200 underline underline-offset-4">Open in authenticator app</a>
          </div>
          <label className="grid gap-1.5 text-sm font-medium text-white/75">
            Six-digit code
            <input value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" aria-invalid={Boolean(mfaError)} aria-describedby={mfaError ? "account-mfa-error" : undefined} className="min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 font-mono tracking-[0.2em] text-white outline-none focus:border-violet-300/40" />
          </label>
          <button type="submit" disabled={mfaLoading} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60">Verify and enable</button>
        </form>
      ) : null}

      {mfaError && <p id="account-mfa-error" role="alert" className="mt-3 text-sm font-medium text-red-600 dark:text-red-300">{mfaError}</p>}
      {mfaMessage && <p role="status" aria-live="polite" className="mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-300">{mfaMessage}</p>}

      {recoveryCodes.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-500/[0.07] p-4">
          <p className="text-sm font-semibold text-amber-100">Save these one-time recovery codes now. They are shown only once.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 font-mono text-sm text-white/75 min-[360px]:grid-cols-2 lg:grid-cols-5">
            {recoveryCodes.map((code) => <code className="select-all" key={code}>{code}</code>)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => copyMfaValue(recoveryCodes.join("\n"), "Recovery codes copied. Store them somewhere private before leaving.")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm font-semibold text-white hover:bg-white/8"><Copy className="size-4" aria-hidden="true" />Copy recovery codes</button>
            <button type="button" onClick={downloadRecoveryCodes} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm font-semibold text-white hover:bg-white/8"><Download className="size-4" aria-hidden="true" />Download codes</button>
          </div>
          <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-white/75">
            <input type="checkbox" checked={recoveryCodesSaved} onChange={(event) => setRecoveryCodesSaved(event.target.checked)} className="size-4 accent-violet-600" />
            I have saved my recovery codes somewhere private.
          </label>
        </div>
      ) : null}
    </section>

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
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--dc-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--dc-on-primary)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Saving..." : "Save password"}
          </button>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut || (recoveryCodes.length > 0 && !recoveryCodesSaved)}
            aria-describedby={logoutError ? "account-logout-error" : undefined}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/12 disabled:cursor-wait disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
        {logoutError && <p id="account-logout-error" role="alert" className="text-sm font-medium text-red-600 dark:text-red-300">{logoutError}</p>}
      </form>
    </section>
    </div>
  );
}
