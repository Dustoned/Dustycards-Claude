export const modalOverlayClass =
  "dc-modal-overlay fixed inset-0 flex items-center justify-center p-4";

export const modalBottomSheetOverlayClass =
  `${modalOverlayClass} max-[640px]:items-end max-[640px]:p-0`;

export const modalCenteredMobileOverlayClass =
  `${modalOverlayClass} max-[640px]:items-center max-[640px]:p-3`;

export const modalPanelBaseClass =
  "dc-modal-panel relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-3xl border border-white/12 text-white shadow-2xl shadow-black/60";

export const modalBottomSheetPanelClass =
  `${modalPanelBaseClass} max-[640px]:max-h-[calc(100dvh-0.75rem)] max-[640px]:rounded-b-none max-[640px]:rounded-t-[26px] max-[640px]:border-x-0 max-[640px]:border-b-0`;

export const modalCenteredPanelClass =
  `${modalPanelBaseClass} max-[640px]:max-h-[calc(100dvh-1rem)] max-[640px]:max-w-[min(26rem,100%)] max-[640px]:rounded-[22px]`;

export const modalHeaderClass =
  "flex items-start gap-3 border-b border-white/10 px-6 py-5 max-[640px]:px-4 max-[640px]:py-3.5";

export const modalCompactHeaderClass =
  "flex items-start gap-3 border-b border-white/10 px-6 py-5 max-[640px]:px-4 max-[640px]:py-3";

export const modalBodyClass =
  "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pb-6 pt-5 max-[640px]:px-4 max-[640px]:pb-4 max-[640px]:pt-3";

export const modalActionRowClass =
  "dc-modal-surface mt-6 flex gap-3 rounded-[22px] border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-surface-primary)] p-2.5 shadow-[inset_0_1px_0_var(--dc-sheen)] max-[640px]:mt-4 max-[640px]:gap-2 max-[640px]:rounded-2xl max-[640px]:p-2";

export const modalCloseButtonClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-surface-elevated)] text-[rgb(var(--dc-text-primary-rgb)/0.66)] transition-colors hover:bg-[var(--dc-surface-hover)] hover:text-[var(--dc-text-primary)] max-[640px]:h-8 max-[640px]:w-8";

export const modalInputClass =
  "dc-modal-field w-full rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-surface-elevated)] px-3 py-2.5 text-[var(--dc-text-primary)] outline-none transition-colors placeholder:text-[rgb(var(--dc-text-muted-rgb)/0.72)] focus:border-[rgb(var(--dc-primary-rgb)/0.55)] max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2 max-[640px]:text-[16px]";

export const modalSelectClass =
  "dc-modal-field w-full rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-surface-elevated)] px-3 py-2.5 text-[var(--dc-text-primary)] outline-none transition-colors focus:border-[rgb(var(--dc-primary-rgb)/0.55)] max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2 max-[640px]:text-[16px]";

export const modalLabelClass = "space-y-1.5 text-sm max-[640px]:text-[12px]";

export const modalOptionClass = "bg-[var(--dc-surface-primary)] text-[var(--dc-text-primary)]";

export const modalPrimaryButtonClass =
  "flex-1 rounded-2xl border border-[rgb(var(--dc-primary-soft-rgb)/0.35)] bg-[rgb(var(--dc-primary-rgb)/0.92)] px-4 py-3 font-semibold text-[var(--dc-on-primary)] shadow-[0_14px_34px_rgb(var(--dc-primary-rgb)/0.24)] transition-colors hover:bg-[var(--dc-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60 max-[640px]:rounded-xl max-[640px]:py-2.5 max-[640px]:text-[13px]";

export const modalSecondaryButtonClass =
  "rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[var(--dc-surface-elevated)] px-4 py-3 font-semibold text-[rgb(var(--dc-text-primary-rgb)/0.72)] transition-colors hover:bg-[var(--dc-surface-hover)] hover:text-[var(--dc-text-primary)] disabled:cursor-not-allowed disabled:opacity-60 max-[640px]:rounded-xl max-[640px]:px-3 max-[640px]:py-2.5 max-[640px]:text-[13px]";

export const modalDangerButtonClass =
  "flex-1 rounded-2xl bg-rose-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60 max-[640px]:rounded-xl max-[640px]:py-2.5 max-[640px]:text-[13px]";
