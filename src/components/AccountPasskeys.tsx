"use client";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { getSafeNextPath } from "@/lib/safe-next-path";

const subscribe = () => () => {};
const serverUnsupported = () => false;

type SavedPasskey = { id: string; name: string; created_at: string; last_used_at: string | null };
async function requestPasskey(body: Record<string, unknown>) {
  const response = await fetch("/api/auth/passkeys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not complete the passkey request.");
  return data;
}
function message(error: unknown) {
  if (error instanceof Error && error.name === "NotAllowedError") return "Passkey request cancelled or timed out. You can try again.";
  return error instanceof Error ? error.message : "Passkey request failed. Please try again.";
}
const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/8 disabled:opacity-50";
const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-white outline-none focus:border-violet-300/50";

export function PasskeyLogin({ nextPath }: { nextPath: string }) {
  const supported = useSyncExternalStore(subscribe, browserSupportsWebAuthn, serverUnsupported);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login() {
    setBusy(true); setError("");
    try {
      const optionsJSON = await requestPasskey({ action: "login-options" });
      const response = await startAuthentication({ optionsJSON });
      await requestPasskey({ action: "login-verify", response });
      window.location.assign(getSafeNextPath(nextPath));
    } catch (error) { setError(message(error)); setBusy(false); }
  }
  if (!supported) return null;
  return <div className="grid gap-2"><button type="button" onClick={login} disabled={busy} className="min-h-11 w-full rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm font-semibold text-violet-700 dark:text-violet-100">{busy ? "Confirm on your device…" : "Sign in with passkey"}</button><p className="text-center text-xs text-zinc-500 dark:text-white/45">Use Face ID, Touch ID or your device passcode.</p>{error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}</div>;
}

export default function AccountPasskeys({ mfaEnabled }: { mfaEnabled: boolean }) {
  const router = useRouter();
  const supported = useSyncExternalStore(subscribe, browserSupportsWebAuthn, serverUnsupported);
  const [items, setItems] = useState<SavedPasskey[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<"add" | SavedPasskey | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  function load() {
    return fetch("/api/auth/passkeys", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Could not load your passkeys. Please retry.");
      const data = await response.json(); setItems(data.passkeys); setLoaded(true); setError("");
    }).catch(error => { setError(message(error)); });
  }
  useEffect(() => { void load(); }, []);
  function close() { setAction(null); setPassword(""); setCode(""); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (action === "add") {
        const optionsJSON = await requestPasskey({ action: "register-options", password, code });
        setPassword(""); setCode("");
        const response = await startRegistration({ optionsJSON });
        await requestPasskey({ action: "register-verify", response, name });
        setNotice("Passkey added. You can now use it to sign in."); setName("");
      } else if (action) {
        const result = await requestPasskey({ action: "delete", id: action.id, password, code });
        if (result.signedOut) { router.replace("/login"); router.refresh(); return; }
        setNotice("Passkey removed. Sessions using it have been signed out.");
      }
      close(); await load();
    } catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  return <section className="binder-panel rounded-2xl p-4 sm:p-5" aria-labelledby="passkeys-title">
    <h2 id="passkeys-title" className="text-base font-semibold text-white">Passkeys</h2>
    <p className="mt-1 text-sm text-white/60">Sign in with Face ID, Touch ID or your device passcode.</p>
    <p className="mt-1 text-xs text-white/45">Keep your password and authenticator as a backup.</p>
    {!loaded && !error && <p role="status" className="mt-3 text-sm text-white/60">Loading passkeys…</p>}
    {loaded && items.length === 0 && <p className="mt-3 text-sm text-white/60">No passkeys added yet.</p>}
    {items.length > 0 && <ul className="mt-4 divide-y divide-white/10">{items.map(item => <li key={item.id} className="flex min-w-0 items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-semibold text-white">{item.name}</p><p className="text-xs text-white/45">{item.last_used_at ? `Last used ${new Date(item.last_used_at).toLocaleDateString()}` : "Not used yet"}</p></div><button type="button" disabled={busy || action !== null} className={buttonClass} onClick={() => { setError(""); setNotice(""); setAction(item); }}>Remove<span className="sr-only"> {item.name}</span></button></li>)}</ul>}
    {!action && loaded && supported && <button type="button" className={`${buttonClass} mt-4`} onClick={() => { setNotice(""); setError(""); setAction("add"); }}>Add passkey</button>}
    {!supported && loaded && <p className="mt-3 text-sm text-white/60">Use a browser and device that support passkeys to add one.</p>}
    {action && <form onSubmit={submit} className="mt-4 grid max-w-lg gap-3">
      <h3 className="text-sm font-semibold text-white">{action === "add" ? "Add a passkey" : `Remove ${action.name}?`}</h3>
      {action === "add" && <label className="text-sm text-white/70">Passkey name<input className={inputClass} value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="e.g. iPhone" required disabled={busy} /></label>}
      <label className="text-sm text-white/70">Confirm current password<input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={256} disabled={busy} /></label>
      {mfaEnabled && <label className="text-sm text-white/70">Authenticator code<input className={inputClass} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={code} onChange={e => setCode(e.target.value)} required disabled={busy} /></label>}
      <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={busy} type="submit">{busy ? "Confirm on your device…" : action === "add" ? "Continue" : "Confirm removal"}</button><button className={buttonClass} disabled={busy} type="button" onClick={close}>Cancel</button></div>
    </form>}
    {error && <div className="mt-3"><p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>{!loaded && <button type="button" onClick={load} className={`${buttonClass} mt-2`}>Retry</button>}</div>}
    {notice && <p role="status" className="mt-3 text-sm text-emerald-600 dark:text-emerald-300">{notice}</p>}
  </section>;
}
