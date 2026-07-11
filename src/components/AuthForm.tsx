"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

export default function AuthForm({
  initialError = null,
  initialVerificationEmail = "",
  mode,
  nextPath = "/",
  showVerificationRecovery = false,
}: {
  initialError?: string | null;
  initialVerificationEmail?: string;
  mode: "login" | "register";
  nextPath?: string;
  showVerificationRecovery?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialVerificationEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState(initialVerificationEmail);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData(event.currentTarget);
      const submittedEmail = formData.get("email");
      const submittedPassword = formData.get("password");
      const submittedConfirmPassword = formData.get("confirmPassword");
      const passwordValue = typeof submittedPassword === "string" ? submittedPassword : password;
      const confirmPasswordValue =
        typeof submittedConfirmPassword === "string" ? submittedConfirmPassword : confirmPassword;

      if (isRegister && passwordValue !== confirmPasswordValue) {
        setError("Passwords do not match");
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: typeof submittedEmail === "string" ? submittedEmail : email,
          next: nextPath,
          password: passwordValue,
          passwordConfirm: confirmPasswordValue,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        code?: string;
        email?: string;
        error?: string;
        verificationSent?: boolean;
        verifyEmail?: boolean;
      };

      if (!response.ok) {
        setError(data.error ?? "Authentication failed");
        if (data.code === "unverified" && data.email) {
          setVerificationEmail(data.email);
        }
        setLoading(false);
        return;
      }

      if (isRegister && data.verifyEmail) {
        const target = new URL("/login", window.location.origin);
        target.searchParams.set("verify", data.verificationSent === false ? "failed" : "sent");
        target.searchParams.set("email", typeof submittedEmail === "string" ? submittedEmail : email);
        target.searchParams.set("next", nextPath);
        router.replace(`${target.pathname}${target.search}`);
        router.refresh();
        return;
      }

      window.location.assign(nextPath || "/");
    } catch {
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  }

  async function resendVerificationEmail() {
    const targetEmail = verificationEmail || email;
    if (!targetEmail) return;

    setResending(true);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, next: nextPath }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Could not send verification email. Please try again.");
        return;
      }

      setVerificationEmail(targetEmail);
      setNotice("Verification email sent. Check your inbox and spam folder.");
    } catch {
      setError("Could not send verification email. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <form
      action={`/api/auth/${mode}`}
      method="post"
      onSubmit={handleSubmit}
      className="mx-auto grid w-full max-w-sm gap-4 rounded-[24px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-6"
    >
      <input type="hidden" name="next" value={nextPath} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {isRegister ? "Create account" : "Log in"}
        </h1>
        <p className="mt-1 text-sm text-white/45">
          {isRegister ? "Build and track your collection in one place." : "Welcome back to DustyCards."}
        </p>
      </div>

      <label className="grid gap-1.5 text-sm font-medium text-white/75">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "auth-form-error" : undefined}
          className="min-h-11 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-white outline-none transition placeholder:text-white/30 focus:border-white/22"
        />
      </label>

      <label className="grid gap-1.5 text-sm font-medium text-white/75">
        Password
        <span className="relative block">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "auth-form-error" : undefined}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 pr-12 text-white outline-none transition placeholder:text-white/30 focus:border-white/22"
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((current) => !current)}
            className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-xl text-white/48 transition hover:bg-white/[0.06] hover:text-white"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
      </label>

      {isRegister && (
        <label className="grid gap-1.5 text-sm font-medium text-white/75">
          Confirm password
          <span className="relative block">
            <input
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "auth-form-error" : undefined}
              className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 pr-12 text-white outline-none transition placeholder:text-white/30 focus:border-white/22"
            />
            <button
              type="button"
              aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
              aria-pressed={showConfirmPassword}
              onClick={() => setShowConfirmPassword((current) => !current)}
              className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-xl text-white/48 transition hover:bg-white/[0.06] hover:text-white"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
      )}

      {error && (
        <p id="auth-form-error" role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      )}

      {notice && (
        <p role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200">
          {notice}
        </p>
      )}

      {!isRegister && (showVerificationRecovery || verificationEmail) && (
        <div className="grid gap-2 rounded-xl border border-violet-300/15 bg-violet-500/[0.07] p-3">
          <p className="text-xs leading-5 text-white/58">
            {email
              ? `Send a fresh verification link to ${email}.`
              : "Enter your email above to request a fresh verification link."}
          </p>
          <button
            type="button"
            disabled={resending || !(verificationEmail || email)}
            onClick={resendVerificationEmail}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {resending && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            <span>{resending ? "Sending..." : "Resend verification email"}</span>
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_36px_rgba(124,92,255,0.24)] transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-75"
      >
        {loading && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
        <span>{loading ? (isRegister ? "Creating..." : "Logging in...") : isRegister ? "Create account" : "Log in"}</span>
      </button>

      <p className="text-center text-sm text-white/45">
        {isRegister ? "Already have an account?" : "No account yet?"}{" "}
        <Link
          href={isRegister ? `/login?next=${encodeURIComponent(nextPath)}` : `/register?next=${encodeURIComponent(nextPath)}`}
          className="font-semibold text-white hover:underline"
        >
          {isRegister ? "Log in" : "Register"}
        </Link>
      </p>

      {!isRegister && (
        <Link
          href={`/forgot-password?next=${encodeURIComponent(nextPath)}`}
          className="text-center text-sm font-semibold text-white/70 hover:text-white hover:underline"
        >
          Forgot password?
        </Link>
      )}
    </form>
  );
}
