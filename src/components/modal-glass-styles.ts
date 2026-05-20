export const modalOverlayClass =
  "dc-modal-overlay fixed inset-0 flex items-center justify-center bg-[#050507] p-4";

export const modalBottomSheetOverlayClass =
  `${modalOverlayClass} max-[640px]:items-end max-[640px]:p-0`;

export const modalCenteredMobileOverlayClass =
  `${modalOverlayClass} max-[640px]:items-center max-[640px]:p-3`;

export const modalPanelBaseClass =
  "dc-modal-panel relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#07070a] text-white shadow-2xl shadow-black/60";

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
  "dc-modal-surface mt-6 flex gap-3 rounded-[22px] border border-white/10 bg-[#101014] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] max-[640px]:mt-4 max-[640px]:gap-2 max-[640px]:rounded-2xl max-[640px]:p-2";

export const modalCloseButtonClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#15151a] text-white/66 transition-colors hover:bg-[#1d1d24] hover:text-white max-[640px]:h-8 max-[640px]:w-8";

export const modalInputClass =
  "dc-modal-field w-full rounded-2xl border border-white/10 bg-[#111116] px-3 py-2.5 text-white outline-none transition-colors placeholder:text-white/28 focus:border-violet-300/35 max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2 max-[640px]:text-[16px]";

export const modalSelectClass =
  "dc-modal-field w-full rounded-2xl border border-white/10 bg-[#111116] px-3 py-2.5 text-white outline-none transition-colors focus:border-violet-300/35 max-[640px]:rounded-xl max-[640px]:px-2.5 max-[640px]:py-2 max-[640px]:text-[16px]";

export const modalLabelClass = "space-y-1.5 text-sm max-[640px]:text-[12px]";

export const modalOptionClass = "bg-[#080808] text-white";

export const modalPrimaryButtonClass =
  "flex-1 rounded-2xl border border-violet-300/35 bg-violet-600/85 px-4 py-3 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.26)] transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60 max-[640px]:rounded-xl max-[640px]:py-2.5 max-[640px]:text-[13px]";

export const modalSecondaryButtonClass =
  "rounded-2xl border border-white/10 bg-[#15151a] px-4 py-3 font-semibold text-white/72 transition-colors hover:bg-[#1d1d24] hover:text-white disabled:cursor-not-allowed disabled:opacity-60 max-[640px]:rounded-xl max-[640px]:px-3 max-[640px]:py-2.5 max-[640px]:text-[13px]";

export const modalDangerButtonClass =
  "flex-1 rounded-2xl bg-rose-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60 max-[640px]:rounded-xl max-[640px]:py-2.5 max-[640px]:text-[13px]";
