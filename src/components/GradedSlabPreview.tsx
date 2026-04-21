"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  formatPsaNameLine,
  formatPsaSetLine,
  getPsaGradeDescriptor,
  type SupportedGradedSlabCompany,
} from "@/lib/graded-slabs";

interface Props {
  company: SupportedGradedSlabCompany;
  grade: string;
  name: string;
  episodeName: string;
  episodeCode?: string | null;
  cardNumber?: string | null;
  imageUrl: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
  sizes?: string;
  loading?: "lazy" | "eager";
  priority?: boolean;
  variant?: "tile" | "detail";
  tileSize?: "small" | "medium" | "large";
}

function PsaLogoMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex items-end justify-center font-black uppercase leading-none tracking-[0] ${className}`}
    >
      <span className="relative z-[1] text-[#1f57ab] [text-shadow:0_0_0.7px_#111,0_1px_0_rgba(255,255,255,0.92)]">
        P
      </span>
      <span
        className="relative z-[2] -mx-[0.14em] text-[#f53933] [text-shadow:0_0_0.8px_#111,0_1px_0_rgba(255,255,255,0.92)]"
        style={{ transform: "scale(1.17) translateY(0.01em)" }}
      >
        S
      </span>
      <span className="relative z-[1] text-[#1f57ab] [text-shadow:0_0_0.7px_#111,0_1px_0_rgba(255,255,255,0.92)]">
        A
      </span>
    </span>
  );
}

function getGradedSlabTheme(company: SupportedGradedSlabCompany) {
  switch (company) {
    case "PSA":
      return {
        shell:
          "border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.045)_36%,rgba(255,255,255,0.012)_100%)]",
        inner:
          "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.022)_40%,rgba(255,255,255,0.01)_100%)]",
        labelOuter: "bg-[#e13b37]",
        labelInner:
          "bg-[linear-gradient(180deg,rgba(255,255,255,0.995),rgba(246,246,246,0.976))]",
        labelDivider: "bg-black/14",
        gradeDivider: "border-l border-black/10",
        window:
          "border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.038),rgba(255,255,255,0.012))]",
      };
    case "BGS":
      return {
        shell:
          "border-white/28 bg-[linear-gradient(180deg,rgba(255,244,214,0.18),rgba(255,244,214,0.06)_35%,rgba(255,255,255,0.03)_100%)]",
        inner:
          "border-white/12 bg-[linear-gradient(180deg,rgba(255,244,214,0.08),rgba(255,255,255,0.03)_38%,rgba(255,255,255,0.015)_100%)]",
        labelOuter: "border border-amber-300/55 bg-[linear-gradient(180deg,rgba(83,55,21,0.94),rgba(51,35,17,0.9))]",
        labelInner: "bg-transparent",
        labelDivider: "bg-amber-300/25",
        gradeDivider: "border-l border-amber-300/30",
        window:
          "border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))]",
      };
    case "CGC":
      return {
        shell:
          "border-white/28 bg-[linear-gradient(180deg,rgba(197,230,255,0.19),rgba(197,230,255,0.07)_35%,rgba(255,255,255,0.03)_100%)]",
        inner:
          "border-white/12 bg-[linear-gradient(180deg,rgba(197,230,255,0.09),rgba(255,255,255,0.03)_38%,rgba(255,255,255,0.015)_100%)]",
        labelOuter: "border border-sky-300/55 bg-[linear-gradient(180deg,rgba(239,247,255,0.97),rgba(208,233,255,0.9))]",
        labelInner: "bg-transparent",
        labelDivider: "bg-sky-500/20",
        gradeDivider: "border-l border-sky-400/30",
        window:
          "border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))]",
      };
  }
}

const TILE_METRICS = {
  shellRadius: "rounded-[12px]",
  innerInset: "inset-[1.3%] rounded-[10px]",
  psaLabel:
    "inset-x-[4%] top-[2.8%] h-[12.7%] min-h-[30px] rounded-[4px] p-[2.4px]",
  psaLeft: "left-[7px] right-[31%] top-[5px]",
  psaEyebrow: "text-[5px]",
  psaName: "mt-[4px] text-[9px]",
  psaSet: "mt-[2px] text-[6px]",
  psaRight: "right-[6px] top-[5px] w-[22%]",
  psaRightMeta: "text-[7px]",
  psaGrade: "mt-[2px] text-[14px]",
  psaLogoWrap: "bottom-[-1.5px] h-[10px] w-[27%] rounded-t-[2px] p-[1.1px]",
  psaLogoInner: "rounded-t-[1px]",
  psaLogo: "text-[9px]",
  genericLabel:
    "inset-x-[3.7%] top-[3.2%] h-[13%] min-h-[30px] rounded-[4px] px-[2px]",
  genericContent: "px-[8px] py-[6px]",
  genericEyebrow: "text-[5px]",
  genericName: "mt-[4px] text-[8px]",
  genericSet: "mt-[2px] text-[6px]",
  genericGradeColumn: "min-w-[31%] px-2",
  genericGradeLabel: "text-[5px]",
  genericGrade: "mt-[1px] text-[14px]",
  cardWindow:
    "left-1/2 top-[18.9%] h-[76.1%] aspect-[63/88] -translate-x-1/2 rounded-[4px]",
  cardBorderOuter: "-inset-x-[1px] inset-y-[3px] rounded-[3px]",
  cardBorderInner: "inset-x-0 inset-y-[4px] rounded-[2px]",
  cardImageInset: "inset-x-[2px] inset-y-[1px] rounded-[2px]",
  glare: "inset-x-[17%] top-[4%] h-[5%]",
} as const;

const DETAIL_METRICS = {
  shellRadius: "rounded-[18px]",
  innerInset: "inset-[1.05%] rounded-[15px]",
  psaLabel:
    "inset-x-[4%] top-[2.8%] h-[12.7%] min-h-[48px] rounded-[7px] p-[3px]",
  psaLeft: "left-[14px] right-[31%] top-[8px]",
  psaEyebrow: "text-[8.5px]",
  psaName: "mt-[5px] text-[18px]",
  psaSet: "mt-[4px] text-[12px]",
  psaRight: "right-[12px] top-[8px] w-[22%]",
  psaRightMeta: "text-[13px]",
  psaGrade: "mt-[4px] text-[33px]",
  psaLogoWrap: "bottom-[-2px] h-[18px] w-[27%] rounded-t-[3px] p-[1.6px]",
  psaLogoInner: "rounded-t-[2px]",
  psaLogo: "text-[17px]",
  genericLabel:
    "inset-x-[3.6%] top-[3%] h-[13.2%] min-h-[42px] rounded-[7px] px-[3px]",
  genericContent: "px-[12px] py-[9px]",
  genericEyebrow: "text-[8.5px]",
  genericName: "mt-[6px] text-[18px]",
  genericSet: "mt-[4px] text-[12px]",
  genericGradeColumn: "min-w-[30%] px-3",
  genericGradeLabel: "text-[8.5px]",
  genericGrade: "mt-[3px] text-[33px]",
  cardWindow:
    "left-1/2 top-[18.5%] h-[77.2%] aspect-[63/88] -translate-x-1/2 rounded-[8px]",
  cardBorderOuter: "inset-x-0 inset-y-[4px] rounded-[6px]",
  cardBorderInner: "inset-x-[1px] inset-y-[5px] rounded-[5px]",
  cardImageInset: "inset-x-[3px] inset-y-[2px] rounded-[4px]",
  glare: "inset-x-[15%] top-[4%] h-[4.7%]",
} as const;

const DETAIL_LABEL_BASE_WIDTH = 420;

function getTileLabelScale(tileSize: "small" | "medium" | "large"): number {
  if (tileSize === "small") return 0.84;
  if (tileSize === "large") return 1.28;
  return 1;
}

function clampScale(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function GradedSlabPreview({
  company,
  grade,
  name,
  episodeName,
  episodeCode,
  cardNumber,
  imageUrl,
  alt,
  className = "",
  imageClassName = "object-contain",
  sizes = "320px",
  loading,
  priority = false,
  variant = "tile",
  tileSize = "medium",
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [slabWidth, setSlabWidth] = useState(0);

  useEffect(() => {
    if (variant !== "detail") {
      return;
    }

    const element = rootRef.current;
    if (!element) {
      return;
    }

    const updateWidth = (nextWidth: number) => {
      const normalizedWidth = Math.round(nextWidth);
      setSlabWidth((currentWidth) =>
        currentWidth === normalizedWidth ? currentWidth : normalizedWidth
      );
    };

    updateWidth(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateWidth(entry.contentRect.width);
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [variant]);

  const theme = getGradedSlabTheme(company);
  const isPsa = company === "PSA";
  const metrics = variant === "detail" ? DETAIL_METRICS : TILE_METRICS;
  const detailLabelScale =
    slabWidth > 0 ? clampScale(slabWidth / DETAIL_LABEL_BASE_WIDTH, 0.72, 1.02) : 0.88;
  const labelScale = variant === "detail" ? detailLabelScale : getTileLabelScale(tileSize);
  const scaledLabelContentStyle =
    labelScale === 1
      ? undefined
      : {
          width: `${100 / labelScale}%`,
          height: `${100 / labelScale}%`,
          transform: `scale(${labelScale})`,
          transformOrigin: "top left",
        };
  const psaDescriptor = isPsa ? getPsaGradeDescriptor(grade) : null;
  const psaNameLine = isPsa ? formatPsaNameLine(name) : null;
  const psaSetLine = isPsa ? formatPsaSetLine(episodeName, cardNumber ?? null) : null;
  const slabSubtitle = [episodeCode ?? episodeName, cardNumber ? `#${cardNumber}` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={rootRef} className={`relative h-full w-full text-left ${className}`}>
      <div
        className={`relative h-full w-full overflow-hidden border shadow-[0_14px_30px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.18)] ${metrics.shellRadius} ${theme.shell}`}
      >
        <div
          className={`absolute border shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${metrics.innerInset} ${theme.inner}`}
        />

        {isPsa ? (
          <div
            className={`absolute z-[2] shadow-sm shadow-black/15 ${metrics.psaLabel} ${theme.labelOuter}`}
          >
            <div className="relative h-full w-full" style={scaledLabelContentStyle}>
              <div className={`relative h-full w-full rounded-[2px] ${theme.labelInner}`}>
                <div
                  className={`absolute flex flex-col items-start text-left leading-none text-[#111111] ${metrics.psaLeft}`}
                >
                  <p
                    className={`truncate font-bold uppercase tracking-[0.18em] ${metrics.psaEyebrow}`}
                  >
                    Pokemon TCG
                  </p>
                  <p
                    className={`truncate font-bold uppercase tracking-[0.03em] ${metrics.psaName}`}
                  >
                    {psaNameLine}
                  </p>
                  <p
                    className={`truncate font-semibold uppercase tracking-[0.07em] opacity-85 ${metrics.psaSet}`}
                  >
                    {psaSetLine}
                  </p>
                </div>

                <div
                  className={`absolute flex flex-col items-end text-right text-[#111111] ${metrics.psaRight}`}
                >
                  <p
                    className={`truncate font-bold leading-none tracking-[0.02em] ${metrics.psaRightMeta}`}
                  >
                    {cardNumber ? `#${cardNumber}` : ""}
                  </p>
                  <p
                    className={`mt-[4px] truncate font-bold leading-none tracking-[0.08em] ${metrics.psaRightMeta}`}
                  >
                    {psaDescriptor ?? "GRADE"}
                  </p>
                  <p className={`font-black leading-none ${metrics.psaGrade}`}>{grade}</p>
                </div>
              </div>

              <div
                className={`absolute left-1/2 -translate-x-1/2 bg-[#e13b37] shadow-[0_1px_0_rgba(255,255,255,0.16)] ${metrics.psaLogoWrap}`}
              >
                <div
                  className={`flex h-full w-full items-center justify-center bg-[#fffefe] ${metrics.psaLogoInner}`}
                >
                  <PsaLogoMark className={metrics.psaLogo} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`absolute z-[2] overflow-hidden shadow-sm shadow-black/8 ${metrics.genericLabel} ${theme.labelOuter}`}
          >
            <div className="relative h-full w-full" style={scaledLabelContentStyle}>
              <div className={`relative flex h-full w-full overflow-hidden`}>
                <div className={`absolute inset-x-0 top-0 h-[3px] ${theme.labelDivider}`} />
                <div
                  className={`relative min-w-0 flex-1 text-left leading-none text-white ${metrics.genericContent}`}
                >
                  <span
                    className={`font-black uppercase tracking-[0.22em] ${metrics.genericEyebrow}`}
                  >
                    {company}
                  </span>
                  <p
                    className={`truncate font-semibold uppercase tracking-[0.08em] ${metrics.genericName}`}
                  >
                    {name}
                  </p>
                  <p
                    className={`truncate font-medium uppercase tracking-[0.12em] opacity-75 ${metrics.genericSet}`}
                  >
                    {slabSubtitle}
                  </p>
                </div>
                <div
                  className={`relative flex flex-col items-center justify-center text-white ${metrics.genericGradeColumn} ${theme.gradeDivider}`}
                >
                  <span
                    className={`font-bold uppercase tracking-[0.18em] opacity-70 ${metrics.genericGradeLabel}`}
                  >
                    Grade
                  </span>
                  <span className={`font-black leading-none tracking-[0] ${metrics.genericGrade}`}>
                    {grade}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div
          className={`absolute overflow-hidden border shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] ${metrics.cardWindow} ${theme.window}`}
        >
          <div
            className={`absolute border border-black/42 dark:border-white/20 ${metrics.cardBorderOuter}`}
          />
          <div
            className={`absolute border border-white/14 dark:border-black/20 ${metrics.cardBorderInner}`}
          />
          <div className={`absolute overflow-hidden ${metrics.cardImageInset}`}>
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={alt}
                fill
                className={imageClassName}
                sizes={sizes}
                loading={loading}
                priority={priority}
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-black/6 text-xs text-gray-300 dark:bg-white/6">
                {name.slice(0, 2)}
              </div>
            )}
          </div>
        </div>

        <div
          className={`pointer-events-none absolute rounded-full bg-white/12 blur-md ${metrics.glare}`}
        />
      </div>
    </div>
  );
}
