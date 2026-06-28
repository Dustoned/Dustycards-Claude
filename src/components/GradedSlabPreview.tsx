"use client";

import { memo } from "react";
import Image from "next/image";
import {
  BGS_SUBGRADE_KEYS,
  createSlabCertNumber,
  formatBgsSubgradeName,
  formatPsaHeaderLine,
  formatPsaNameLine,
  formatPsaSetLine,
  getBgsGradeDescriptor,
  getPsaGradeDescriptor,
  type BgsSubgrades,
  type SupportedGradedSlabCompany,
} from "@/lib/graded-slabs";
import { getCachedImageUrl } from "@/lib/image-cache";

type GradedPreviewTileSize = "xsmall" | "small" | "medium" | "large";

interface Props {
  company: SupportedGradedSlabCompany;
  grade: string;
  name: string;
  episodeName: string;
  episodeCode?: string | null;
  episodeSeries?: string | null;
  episodeReleaseDate?: string | null;
  cardNumber?: string | null;
  imageUrl: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
  sizes?: string;
  loading?: "lazy" | "eager";
  priority?: boolean;
  // Accepted for API compatibility. The label is now fully scale-invariant
  // (container-query units), so it renders identically at every size and these
  // no longer change the layout.
  variant?: "tile" | "detail";
  tileSize?: GradedPreviewTileSize;
  bgsSubgrades?: BgsSubgrades | null;
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

function BeckettLogoMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center font-black uppercase leading-none tracking-[0] text-white [text-shadow:0_1px_0_rgba(0,0,0,0.35)] ${className}`}
    >
      (B)
    </span>
  );
}

function BarcodeStrip({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-full items-end gap-[0.14cqw] overflow-hidden ${className}`}
    >
      {Array.from({ length: 28 }, (_, index) => {
        const digit = Number(value[index % value.length] ?? 1);
        const width = (1 + (digit % 3)) * 0.24;
        const height = 44 + ((digit + index) % 5) * 12;
        return (
          <span
            key={`${value}-${index}`}
            className="block bg-[#111827]"
            style={{ width: `${width}cqw`, height: `${height}%` }}
          />
        );
      })}
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
        labelOuter: "border-[0.22cqw] border-[#df1f2d] bg-[#fbfbf8]",
        labelInner:
          "bg-[linear-gradient(180deg,rgba(255,255,255,0.998),rgba(245,246,247,0.982))]",
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
        labelOuter:
          "border-[0.22cqw] border-[#2b2114]/80 bg-[linear-gradient(180deg,#f9eac0_0%,#d7bd75_45%,#b89038_100%)]",
        labelInner: "bg-[linear-gradient(180deg,rgba(255,250,225,0.9),rgba(184,132,45,0.28))]",
        labelDivider: "bg-black/35",
        gradeDivider: "border-l border-black/28",
        window:
          "border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))]",
      };
    case "CGC":
      return {
        shell:
          "border-white/28 bg-[linear-gradient(180deg,rgba(197,230,255,0.19),rgba(197,230,255,0.07)_35%,rgba(255,255,255,0.03)_100%)]",
        inner:
          "border-white/12 bg-[linear-gradient(180deg,rgba(197,230,255,0.09),rgba(255,255,255,0.03)_38%,rgba(255,255,255,0.015)_100%)]",
        labelOuter:
          "border-[0.22cqw] border-sky-300/55 bg-[linear-gradient(180deg,rgba(239,247,255,0.97),rgba(208,233,255,0.9))]",
        labelInner: "bg-transparent",
        labelDivider: "bg-sky-500/20",
        gradeDivider: "border-l border-sky-400/30",
        window:
          "border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))]",
      };
    case "SGC":
      return {
        shell:
          "border-white/24 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.045)_34%,rgba(255,255,255,0.018)_100%)]",
        inner:
          "border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025)_38%,rgba(255,255,255,0.012)_100%)]",
        labelOuter:
          "border-[0.22cqw] border-white/50 bg-[linear-gradient(180deg,rgba(12,12,14,0.98),rgba(2,2,3,0.96))]",
        labelInner: "bg-transparent",
        labelDivider: "bg-white/38",
        gradeDivider: "border-l border-white/22",
        window:
          "border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.014))]",
      };
    case "ACE":
      return {
        shell:
          "border-white/28 bg-[linear-gradient(180deg,rgba(229,210,255,0.18),rgba(207,230,255,0.07)_35%,rgba(255,255,255,0.03)_100%)]",
        inner:
          "border-white/12 bg-[linear-gradient(180deg,rgba(229,210,255,0.09),rgba(255,255,255,0.03)_38%,rgba(255,255,255,0.015)_100%)]",
        labelOuter:
          "border-[0.22cqw] border-violet-300/50 bg-[linear-gradient(135deg,rgba(75,47,133,0.95),rgba(25,111,132,0.9))]",
        labelInner: "bg-transparent",
        labelDivider: "bg-cyan-200/28",
        gradeDivider: "border-l border-cyan-200/24",
        window:
          "border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))]",
      };
    case "TAG":
      return {
        shell:
          "border-white/24 bg-[linear-gradient(180deg,rgba(204,255,234,0.16),rgba(204,255,234,0.055)_36%,rgba(255,255,255,0.025)_100%)]",
        inner:
          "border-white/12 bg-[linear-gradient(180deg,rgba(204,255,234,0.075),rgba(255,255,255,0.028)_38%,rgba(255,255,255,0.014)_100%)]",
        labelOuter:
          "border-[0.22cqw] border-emerald-200/45 bg-[linear-gradient(180deg,rgba(9,46,42,0.96),rgba(6,25,31,0.94))]",
        labelInner: "bg-transparent",
        labelDivider: "bg-emerald-200/30",
        gradeDivider: "border-l border-emerald-200/24",
        window:
          "border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))]",
      };
  }
}

// A single, fully scale-invariant metric set. Every size is expressed as a
// percentage of the slab box (layout) or in `cqw` — container-query width units
// where 1cqw = 1% of the slab's width. Because the slab keeps a fixed aspect
// ratio, this renders the label identically at any size: featured thumbnail,
// grid tile, modal, or detail. No JS measuring, no per-variant tuning.
const M = {
  shellRadius: "rounded-[4cqw]",
  innerInset: "inset-[1.1%] rounded-[3.4cqw]",
  // PSA
  psaLabel: "inset-x-[4%] top-[2.8%] h-[12.7%] rounded-[1.7cqw]",
  psaInnerBorder: "inset-[0.5cqw] rounded-[1cqw] border-[0.4cqw] border-[#df1f2d]",
  psaMidDivider: "inset-x-[3.4%] bottom-[22%] h-[0.18cqw]",
  psaLeft: "left-[3.3cqw] right-[31%] top-[1.7cqw]",
  psaEyebrow: "text-[1.82cqw]",
  psaName: "mt-[0.8cqw] text-[3.85cqw]",
  psaSet: "mt-[0.7cqw] text-[2.55cqw]",
  psaRight: "right-[2.9cqw] top-[1.2cqw] w-[24%]",
  psaRightMeta: "text-[3.1cqw]",
  psaDescriptor: "mt-[0.5cqw]",
  psaGrade: "text-[6.7cqw]",
  psaLogoWrap: "left-1/2 bottom-[4cqw] h-[4.55cqw] w-[23%] rounded-[0.7cqw] p-[0.36cqw]",
  psaLogoInner: "rounded-[0.5cqw]",
  psaLogo: "text-[4cqw]",
  psaCertArea: "left-[3.1cqw] right-[2.9cqw] bottom-[0.95cqw] h-[3.1cqw] gap-[1.4cqw]",
  psaCertText: "text-[1.9cqw]",
  // BGS / generic
  genericLabel: "inset-x-[3.6%] top-[3%] h-[13.2%] rounded-[1.7cqw]",
  genericTopDivider: "h-[0.7cqw]",
  genericContent: "px-[2.86cqw] py-[2.14cqw]",
  genericEyebrow: "text-[2cqw]",
  genericName: "mt-[1.4cqw] text-[4.3cqw]",
  genericSet: "mt-[0.95cqw] text-[2.86cqw]",
  genericGradeColumn: "min-w-[30%] px-[1.6cqw]",
  genericGradeLabel: "text-[2cqw]",
  genericGrade: "mt-[0.7cqw] text-[7.85cqw]",
  bgsSubgradeName: "text-[1.66cqw]",
  bgsSubgradeValue: "text-[2.86cqw]",
  bgsSubgradeGrid: "mt-[0.7cqw] rounded-[0.5cqw] border-[0.22cqw]",
  bgsSubgradeCell: "border-r-[0.22cqw] px-[0.5cqw] py-[0.24cqw]",
  bgsCert: "mt-[0.5cqw]",
  // Card window
  cardWindow: "left-1/2 top-[18.6%] h-[77.1%] aspect-[63/88] -translate-x-1/2 rounded-[1.9cqw]",
  cardBorderOuter: "inset-x-0 inset-y-[0.95cqw] rounded-[1.4cqw]",
  cardBorderInner: "inset-x-[0.24cqw] inset-y-[1.2cqw] rounded-[1.2cqw]",
  cardImageInset: "inset-x-[0.7cqw] inset-y-[0.48cqw] rounded-[0.95cqw]",
  glare: "inset-x-[15%] top-[4%] h-[4.7%]",
} as const;

function GradedSlabPreview({
  company,
  grade,
  name,
  episodeName,
  episodeCode,
  episodeSeries,
  episodeReleaseDate,
  cardNumber,
  imageUrl,
  alt,
  className = "",
  imageClassName = "object-contain",
  sizes = "320px",
  loading,
  priority = false,
  bgsSubgrades = null,
}: Props) {
  const theme = getGradedSlabTheme(company);
  const isPsa = company === "PSA";
  const isBgs = company === "BGS";

  const psaDescriptor = isPsa ? getPsaGradeDescriptor(grade) : null;
  const psaHeaderLine = isPsa
    ? formatPsaHeaderLine({ episodeSeries, episodeReleaseDate })
    : null;
  const psaNameLine = isPsa ? formatPsaNameLine(name) : null;
  const psaSetLine = isPsa ? formatPsaSetLine(episodeName, null) : null;
  const cachedImageUrl = getCachedImageUrl(imageUrl);
  const slabSubtitle = [episodeCode ?? episodeName, cardNumber ? `#${cardNumber}` : null]
    .filter(Boolean)
    .join(" ");
  const certNumber = createSlabCertNumber(company, name, cardNumber ?? null, grade);

  return (
    <div
      data-graded-slab-preview="true"
      className={`relative h-full w-full text-left [container-type:inline-size] ${className}`}
    >
      <div
        className={`relative h-full w-full overflow-hidden border shadow-[0_14px_30px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.18)] ${M.shellRadius} ${theme.shell}`}
      >
        <div
          className={`absolute border shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${M.innerInset} ${theme.inner}`}
        />

        {isPsa ? (
          <div
            className={`absolute z-[2] overflow-hidden shadow-sm shadow-black/15 ${M.psaLabel} ${theme.labelOuter}`}
          >
            <div className={`relative h-full w-full overflow-hidden ${theme.labelInner}`}>
              <div className={`absolute ${M.psaInnerBorder}`} />
              <div className={`absolute bg-black/14 ${M.psaMidDivider}`} />
              <div
                className={`absolute flex flex-col items-start text-left leading-none text-[#111111] ${M.psaLeft}`}
              >
                <p
                  className={`truncate font-bold uppercase leading-none tracking-[0.1em] ${M.psaEyebrow}`}
                >
                  {psaHeaderLine}
                </p>
                <p
                  className={`truncate font-black uppercase leading-none tracking-[0.02em] ${M.psaName}`}
                >
                  {psaNameLine}
                </p>
                <p
                  className={`truncate font-extrabold uppercase leading-none tracking-[0.08em] opacity-80 ${M.psaSet}`}
                >
                  {psaSetLine}
                </p>
              </div>

              <div
                className={`absolute flex flex-col items-end text-right text-[#111111] ${M.psaRight}`}
              >
                <p className={`truncate font-bold leading-none tracking-[0.02em] ${M.psaRightMeta}`}>
                  {cardNumber ? `#${cardNumber}` : ""}
                </p>
                <p
                  className={`truncate font-bold leading-none tracking-[0.06em] ${M.psaDescriptor} ${M.psaRightMeta}`}
                >
                  {psaDescriptor ?? "GRADE"}
                </p>
                <p className={`font-black leading-none ${M.psaGrade}`}>{grade}</p>
              </div>

              <div
                className={`absolute border border-black/10 bg-white shadow-[0_1px_0_rgba(255,255,255,0.7)] ${M.psaLogoWrap}`}
              >
                <div
                  className={`flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,#ffffff,#eef3fb_48%,#ffffff)] ${M.psaLogoInner}`}
                >
                  <PsaLogoMark className={M.psaLogo} />
                </div>
              </div>

              <div className={`absolute flex items-end ${M.psaCertArea}`}>
                <BarcodeStrip value={certNumber} className="min-w-0 flex-1 opacity-90" />
                <span
                  className={`shrink-0 font-black leading-none tracking-[0.05em] text-[#111827] ${M.psaCertText}`}
                >
                  {certNumber}
                </span>
              </div>
            </div>
          </div>
        ) : isBgs ? (
          <div
            className={`absolute z-[2] overflow-hidden shadow-sm shadow-black/20 ${M.genericLabel} ${theme.labelOuter}`}
          >
            <div
              className={`relative grid h-full w-full grid-cols-[20%_minmax(0,1fr)_25%] overflow-hidden ${theme.labelInner}`}
            >
              <div className={`absolute inset-x-0 top-0 ${M.genericTopDivider} ${theme.labelDivider}`} />
              <div className="absolute inset-x-0 bottom-0 h-px bg-white/35" />
              <div className="relative z-[1] flex flex-col items-center justify-center border-r border-black/35 bg-[linear-gradient(180deg,#777,#2d2d2d_45%,#111)] text-white">
                <BeckettLogoMark className={M.genericName} />
                <span
                  className={`mt-[0.5cqw] font-black uppercase leading-none tracking-[0.06em] ${M.genericEyebrow}`}
                >
                  BECKETT
                </span>
              </div>
              <div
                className={`relative z-[1] min-w-0 text-left leading-none text-[#17110a] ${M.genericContent}`}
              >
                <p className={`truncate font-black uppercase tracking-[0.05em] ${M.genericName}`}>
                  {name}
                </p>
                <p
                  className={`truncate font-bold uppercase tracking-[0.1em] text-[#33230b]/78 ${M.genericSet}`}
                >
                  {slabSubtitle}
                </p>
                <div
                  className={`grid grid-cols-4 overflow-hidden border-black/28 bg-[#fff4c7]/60 ${M.bgsSubgradeGrid}`}
                >
                  {BGS_SUBGRADE_KEYS.map((key) => (
                    <div
                      key={key}
                      className={`min-w-0 border-black/18 last:border-r-0 ${M.bgsSubgradeCell}`}
                    >
                      <span
                        className={`block truncate font-black uppercase leading-none tracking-[0.04em] opacity-70 ${M.bgsSubgradeName}`}
                      >
                        {formatBgsSubgradeName(key)}
                      </span>
                      <span
                        className={`mt-[0.24cqw] block font-black leading-none ${M.bgsSubgradeValue}`}
                      >
                        {bgsSubgrades?.[key] ?? "-"}
                      </span>
                    </div>
                  ))}
                </div>
                <p
                  className={`truncate font-bold uppercase tracking-[0.05em] text-[#31210d]/70 ${M.bgsCert} ${M.genericEyebrow}`}
                >
                  {certNumber}
                </p>
              </div>
              <div
                className={`relative z-[1] flex flex-col items-center justify-center bg-[linear-gradient(180deg,rgba(35,23,9,0.98),rgba(8,7,6,0.98))] text-[#f6d778] ${M.genericGradeColumn} ${theme.gradeDivider}`}
              >
                <span
                  className={`font-black uppercase tracking-[0.12em] text-[#f7e7ad] ${M.genericGradeLabel}`}
                >
                  {getBgsGradeDescriptor(grade)}
                </span>
                <span className={`font-black leading-none tracking-[0] text-white ${M.genericGrade}`}>
                  {grade}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`absolute z-[2] overflow-hidden shadow-sm shadow-black/8 ${M.genericLabel} ${theme.labelOuter}`}
          >
            <div className="relative flex h-full w-full overflow-hidden">
              <div className={`absolute inset-x-0 top-0 ${M.genericTopDivider} ${theme.labelDivider}`} />
              <div
                className={`relative min-w-0 flex-1 text-left leading-none text-white ${M.genericContent}`}
              >
                <span className={`font-black uppercase tracking-[0.2em] ${M.genericEyebrow}`}>
                  {company}
                </span>
                <p className={`truncate font-semibold uppercase tracking-[0.06em] ${M.genericName}`}>
                  {name}
                </p>
                <p
                  className={`truncate font-medium uppercase tracking-[0.1em] opacity-75 ${M.genericSet}`}
                >
                  {slabSubtitle}
                </p>
              </div>
              <div
                className={`relative flex flex-col items-center justify-center text-white ${M.genericGradeColumn} ${theme.gradeDivider}`}
              >
                <span
                  className={`font-bold uppercase tracking-[0.16em] opacity-70 ${M.genericGradeLabel}`}
                >
                  Grade
                </span>
                <span className={`font-black leading-none tracking-[0] ${M.genericGrade}`}>
                  {grade}
                </span>
              </div>
            </div>
          </div>
        )}

        <div
          className={`absolute overflow-hidden border shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] ${M.cardWindow} ${theme.window}`}
        >
          <div className={`absolute border border-black/42 dark:border-white/20 ${M.cardBorderOuter}`} />
          <div className={`absolute border border-white/14 dark:border-black/20 ${M.cardBorderInner}`} />
          <div className={`absolute overflow-hidden ${M.cardImageInset}`}>
            {cachedImageUrl ? (
              <Image
                src={cachedImageUrl}
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
          className={`pointer-events-none absolute rounded-full bg-white/12 blur-md ${M.glare}`}
        />
      </div>
    </div>
  );
}

const MemoizedGradedSlabPreview = memo(GradedSlabPreview);

MemoizedGradedSlabPreview.displayName = "GradedSlabPreview";

export default MemoizedGradedSlabPreview;
