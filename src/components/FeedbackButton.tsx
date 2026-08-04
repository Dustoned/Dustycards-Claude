"use client";

import { createPortal } from "react-dom";
import {
  Bug,
  CheckCircle2,
  Database,
  Lightbulb,
  Loader2,
  MessageSquareText,
  Send,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import useBodyScrollLock from "@/lib/useBodyScrollLock";
import type { FeedbackCategory } from "@/lib/feedback";

const CATEGORY_OPTIONS: Array<{
  value: FeedbackCategory;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: "general",
    label: "General",
    description: "Something you noticed",
    icon: MessageSquareText,
  },
  {
    value: "bug",
    label: "Bug",
    description: "Something is not working",
    icon: Bug,
  },
  {
    value: "idea",
    label: "Idea",
    description: "A feature or improvement",
    icon: Lightbulb,
  },
  {
    value: "data",
    label: "Card data",
    description: "Price or card information",
    icon: Database,
  },
];

export default function FeedbackButton({
  className = "",
  iconClassName = "h-4 w-4",
  label = "Feedback",
  menuItem = false,
}: {
  className?: string;
  iconClassName?: string;
  label?: string;
  menuItem?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => textareaRef.current?.focus(), 80);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && status !== "sending") {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, status]);

  function closeDialog() {
    if (status === "sending") return;
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }

  function openDialog() {
    setError(null);
    setStatus("idle");
    setOpen(true);
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;

    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 8) {
      setError("Please add a little more detail.");
      textareaRef.current?.focus();
      return;
    }

    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category,
          message: trimmedMessage,
          pageUrl: window.location.href,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Feedback could not be sent.");
      }

      setStatus("sent");
      setMessage("");
      setCategory("general");
    } catch (submitError) {
      setStatus("idle");
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Feedback could not be sent. Please try again."
      );
    }
  }

  const dialog =
    open
      ? createPortal(
          <div
            data-feedback-dialog
            className="dc-modal-overlay fixed inset-0 z-[220] flex items-end justify-center p-3 sm:items-center sm:p-6"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) closeDialog();
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="feedback-dialog-title"
              aria-describedby="feedback-dialog-description"
              className="max-h-[min(44rem,calc(100dvh-1.5rem))] w-full max-w-xl overflow-y-auto rounded-[26px] border border-[rgb(var(--dc-border-rgb)/0.95)] bg-[linear-gradient(160deg,rgb(var(--dc-surface-elevated-rgb)/0.99),rgb(var(--dc-bg-main-rgb)/0.99))] p-4 text-[var(--dc-text-primary)] shadow-[0_32px_100px_rgba(0,0,0,0.72),0_0_70px_rgb(var(--dc-primary-rgb)/0.16)] sm:p-6"
            >
              <header className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--dc-primary-soft)]">
                    Help improve DustyCards
                  </p>
                  <h2 id="feedback-dialog-title" className="mt-1.5 text-2xl font-black">
                    Send feedback
                  </h2>
                  <p
                    id="feedback-dialog-description"
                    className="mt-1.5 text-sm leading-relaxed text-[var(--dc-text-muted)]"
                  >
                    Your message includes the page you are viewing so an admin can reproduce it.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDialog}
                  disabled={status === "sending"}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.92)] bg-[rgb(var(--dc-surface-hover-rgb)/0.55)] text-[var(--dc-text-muted)] transition hover:text-[var(--dc-text-primary)] disabled:opacity-50"
                  aria-label="Close feedback"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              {status === "sent" ? (
                <div className="mt-6 rounded-[22px] border border-emerald-400/20 bg-emerald-400/[0.07] p-5 text-center">
                  <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-300" />
                  <h3 className="mt-3 text-lg font-black">Feedback received</h3>
                  <p className="mt-1 text-sm text-[var(--dc-text-muted)]">
                    It is now visible in the admin feedback inbox.
                  </p>
                  <button
                    type="button"
                    onClick={closeDialog}
                    className="mt-5 min-h-11 rounded-xl border border-emerald-300/24 bg-emerald-400/12 px-5 text-sm font-black text-emerald-100"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={submitFeedback} className="mt-6">
                  <fieldset disabled={status === "sending"}>
                    <legend className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--dc-text-muted)]">
                      What is this about?
                    </legend>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {CATEGORY_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const selected = category === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setCategory(option.value)}
                            aria-pressed={selected}
                            className={`min-h-[4.6rem] rounded-2xl border p-3 text-left transition ${
                              selected
                                ? "border-[rgb(var(--dc-primary-soft-rgb)/0.42)] bg-[rgb(var(--dc-primary-rgb)/0.18)]"
                                : "border-[rgb(var(--dc-border-rgb)/0.84)] bg-[rgb(var(--dc-surface-primary-rgb)/0.45)] hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.64)]"
                            }`}
                          >
                            <span className="flex items-center gap-2 text-sm font-black">
                              <Icon
                                className={`h-4 w-4 ${
                                  selected
                                    ? "text-[var(--dc-primary-soft)]"
                                    : "text-[var(--dc-text-muted)]"
                                }`}
                              />
                              {option.label}
                            </span>
                            <span className="mt-1 block text-[10px] font-semibold leading-tight text-[var(--dc-text-muted)]">
                              {option.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <label
                      htmlFor="feedback-message"
                      className="mt-5 block text-[10px] font-black uppercase tracking-[0.12em] text-[var(--dc-text-muted)]"
                    >
                      Your feedback
                    </label>
                    <textarea
                      ref={textareaRef}
                      id="feedback-message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      maxLength={4_000}
                      rows={6}
                      placeholder="Tell us what happened, what you expected, or what would make this better…"
                      className="mt-2 min-h-36 w-full resize-y rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.95)] bg-[rgb(var(--dc-bg-main-rgb)/0.54)] px-4 py-3 text-sm leading-relaxed text-[var(--dc-text-primary)] outline-none placeholder:text-[var(--dc-text-disabled)] focus:border-[rgb(var(--dc-primary-soft-rgb)/0.48)] focus:ring-2 focus:ring-[rgb(var(--dc-primary-rgb)/0.14)]"
                    />
                    <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] font-semibold">
                      <span className="text-[var(--dc-text-muted)]">Minimum 8 characters</span>
                      <span className="tabular-nums text-[var(--dc-text-disabled)]">
                        {message.length}/4,000
                      </span>
                    </div>
                  </fieldset>

                  {error ? (
                    <p
                      role="alert"
                      className="mt-3 rounded-xl border border-rose-400/18 bg-rose-400/[0.07] px-3 py-2.5 text-xs font-semibold text-rose-200"
                    >
                      {error}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[rgb(var(--dc-primary-soft-rgb)/0.34)] bg-[linear-gradient(135deg,rgb(var(--dc-primary-rgb)/0.92),rgb(var(--dc-primary-rgb)/0.68))] px-4 text-sm font-black text-white shadow-[0_14px_32px_rgb(var(--dc-primary-rgb)/0.2)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-65"
                  >
                    {status === "sending" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {status === "sending" ? "Sending…" : "Send feedback"}
                  </button>
                </form>
              )}
            </section>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role={menuItem ? "menuitem" : undefined}
        onClick={openDialog}
        className={className}
      >
        <MessageSquareText className={iconClassName} aria-hidden="true" />
        {label}
      </button>
      {dialog}
    </>
  );
}
