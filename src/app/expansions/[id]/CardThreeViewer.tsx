"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { useSettings, type Card3dSize } from "@/components/SettingsProvider";
import PriceRefreshCountdown from "@/components/PriceRefreshCountdown";
import IllustratorLink from "@/components/IllustratorLink";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import { withCardMarketFilters } from "@/lib/cardmarket";
import { formatCurrency } from "@/lib/format";
import useBodyScrollLock from "@/lib/useBodyScrollLock";
import { getPreferredGradedLabel } from "@/components/card-modal/utils";
import {
  BGS_SUBGRADE_KEYS,
  PSA_SLAB_MODEL_DIMENSIONS,
  RAW_TCG_CARD_DIMENSIONS,
  formatBgsSubgradeName,
  formatPsaNameLine,
  formatPsaSetLine,
  getBgsGradeDescriptor,
  getPsaGradeDescriptor,
  normalizeGradingCompanyLabel,
  normalizeGradingGradeLabel,
  type BgsSubgrades,
} from "@/lib/graded-slabs";
import { getCachedImageUrl } from "@/lib/image-cache";
import { normalizeRarityLabel } from "@/lib/rarity";
import { rarityBadgeDark } from "@/lib/rarity-styles";

const ACTIVE_SEGMENT_CLASS =
  "border border-violet-400/40 bg-violet-600 text-white";

interface ViewerCard {
  id: string;
  name: string;
  card_number: string | null;
  episode_id: string;
  episode_name?: string | null;
  episode_code?: string | null;
  rarity: string | null;
  hp: number | string | null;
  supertype: string | null;
  subtypes: string | null;
  artist: string | null;
  price_source_status: string | null;
  price_source_checked_at: string | null;
  price_fetched_at: string | null;
  price: {
    cm_en_lowest_nm: number | null;
    tcp_market: number | null;
    tcp_mid: number | null;
    tcp_low: number | null;
    cm_en_avg_7d: number | null;
    cm_en_avg_30d: number | null;
  } | null;
  graded_prices?: Array<{
    label: string;
    price: number;
    company?: string;
    grade?: string;
  }>;
  ebay_sold_graded_prices?: Array<{
    source: "ebay_sold";
    label: string;
    company: string;
    grade: string;
    median_price: number;
    currency: string;
    sample_size: number | null;
    median_price_eur?: number | null;
    exchange_rate_usd_eur?: number | null;
    exchange_rate_date?: string | null;
  }>;
  collection_item?: {
    grading_company: string | null;
    grading_grade: string | null;
    grading_subgrades?: BgsSubgrades | null;
  } | null;
}

interface Props {
  card: ViewerCard;
  frontImageUrl: string;
  cardMarketUrl: string | null;
  showGradedSlabPreview?: boolean;
  onClose: () => void;
}

const CARD_WIDTH = 2.5;
const CARD_HEIGHT = (CARD_WIDTH * RAW_TCG_CARD_DIMENSIONS.height) / RAW_TCG_CARD_DIMENSIONS.width;
const CARD_DEPTH = 0.018;
const CARD_CORNER_RADIUS = 0.078;
const CARD_FACE_OFFSET = 0.0009;
const CARD_FRONT_TEXTURE_INSET = 0;
const CARD_FRONT_TEXTURE_BLEED = 0.02;
const CARD_BACK_TEXTURE_INSET = 0.02;
const CARD_BACK_URL = "/assets/pokemon-card-back.jpg";
const CARD_PAPER_COLOR = "#ece7df";
const PSA_SLAB_WIDTH = (CARD_WIDTH * PSA_SLAB_MODEL_DIMENSIONS.width) / RAW_TCG_CARD_DIMENSIONS.width;
const PSA_SLAB_HEIGHT =
  (CARD_WIDTH * PSA_SLAB_MODEL_DIMENSIONS.height) / RAW_TCG_CARD_DIMENSIONS.width;
const PSA_SLAB_DEPTH = (CARD_WIDTH * PSA_SLAB_MODEL_DIMENSIONS.depth) / RAW_TCG_CARD_DIMENSIONS.width;
const PSA_MODEL_DEPTH_SCALE = PSA_SLAB_DEPTH / PSA_SLAB_MODEL_DIMENSIONS.depth;
const PSA_FRONT_RECESS_Z =
  (5 - PSA_SLAB_MODEL_DIMENSIONS.depth / 2) * PSA_MODEL_DEPTH_SCALE;
const PSA_CARD_CENTER_Y = -PSA_SLAB_HEIGHT * 0.085;
const PSA_CARD_SCALE = 1.09;
const PSA_LABEL_WIDTH = PSA_SLAB_WIDTH * 0.888;
const PSA_LABEL_HEIGHT = PSA_SLAB_HEIGHT * 0.123;
const PSA_LABEL_WELL_WIDTH = PSA_LABEL_WIDTH * 1.002;
const PSA_LABEL_WELL_HEIGHT = PSA_LABEL_HEIGHT * 1.002;
const PSA_LABEL_Y = PSA_SLAB_HEIGHT * 0.387;
const PSA_LABEL_WELL_Z = -0.014;
const PSA_LABEL_Z = -0.01;
const PSA_CARD_COVER_Z = PSA_FRONT_RECESS_Z + 0.0015;
const PSA_LABEL_COVER_Z = PSA_FRONT_RECESS_Z + 0.0015;
const DEFAULT_CAMERA_DISTANCE = 8.55;
const MIN_CAMERA_DISTANCE = 4.4;
const MAX_CAMERA_DISTANCE = 22;
const CAMERA_TARGET_FOLLOW = 0.16;
const MOBILE_DETAIL_PANEL_CLEARANCE_OFFSET = 0.28;

interface Card3dSizeConfig {
  resetDistanceScale: number;
  minimumFitScale: number;
  offsetScale: number;
}

const CARD_3D_SIZE_CONFIG: Record<Card3dSize, Card3dSizeConfig> = {
  small: {
    resetDistanceScale: 1.28,
    minimumFitScale: 1.16,
    offsetScale: 1.22,
  },
  medium: {
    resetDistanceScale: 1.04,
    minimumFitScale: 0.98,
    offsetScale: 1.14,
  },
  large: {
    resetDistanceScale: 0.86,
    minimumFitScale: 0.86,
    offsetScale: 1.08,
  },
};

function getCard3dSizeConfig(size: Card3dSize, isMobileViewport: boolean): Card3dSizeConfig {
  const baseConfig = CARD_3D_SIZE_CONFIG[size] ?? CARD_3D_SIZE_CONFIG.medium;

  if (!isMobileViewport) {
    return baseConfig;
  }

  if (size === "large") {
    return {
      resetDistanceScale: 0.7,
      minimumFitScale: 0.72,
      offsetScale: 0.94,
    };
  }

  if (size === "medium") {
    return {
      resetDistanceScale: 0.83,
      minimumFitScale: 0.83,
      offsetScale: 0.98,
    };
  }

  return {
    resetDistanceScale: 0.98,
    minimumFitScale: 0.94,
    offsetScale: 1.02,
  };
}


interface FoilProfile {
  foilStrength: number;
  rainbowStrength: number;
}

function getFoilProfile(rarity: string | null): FoilProfile {
  const normalized = normalizeRarityLabel(rarity);

  if (!normalized) {
    return { foilStrength: 1.02, rainbowStrength: 0.26 };
  }

  if (normalized === "Common" || normalized === "Uncommon") {
    return { foilStrength: 0.98, rainbowStrength: 0 };
  }

  if (
    normalized.includes("Secret") ||
    normalized.includes("Hyper") ||
    normalized.includes("Illustration") ||
    normalized.includes("Shiny") ||
    normalized.includes("Rainbow") ||
    normalized.includes("Ultra")
  ) {
    return { foilStrength: 1.28, rainbowStrength: 0.94 };
  }

  if (
    normalized === "Rare" ||
    normalized.includes("Holo") ||
    normalized.includes("Amazing") ||
    normalized === "Promo"
  ) {
    return { foilStrength: 1.16, rainbowStrength: 0.58 };
  }

  return { foilStrength: 1.1, rainbowStrength: 0.5 };
}

function createEdgeTexture(THREE: typeof import("three")) {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 512;

  const context = canvas.getContext("2d");
  if (!context) return null;

  const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, "#bdb5aa");
  gradient.addColorStop(0.35, "#e6e0d7");
  gradient.addColorStop(0.7, "#cdc5bb");
  gradient.addColorStop(1, "#aca394");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 8) {
    context.fillStyle = y % 16 === 0 ? "rgba(255,255,255,0.22)" : "rgba(70,64,56,0.14)";
    context.fillRect(0, y, canvas.width, 3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 6);
  return texture;
}

function createFoilOverlayMaterial(
  THREE: typeof import("three"),
  profile: FoilProfile,
  cardTexture: import("three").Texture
) {
  const textureImage = cardTexture.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | OffscreenCanvas
    | undefined;
  const textureWidth =
    textureImage && "naturalWidth" in textureImage && typeof textureImage.naturalWidth === "number"
      ? textureImage.naturalWidth
      : textureImage && "width" in textureImage && typeof textureImage.width === "number"
        ? textureImage.width
        : 1024;
  const textureHeight =
    textureImage && "naturalHeight" in textureImage && typeof textureImage.naturalHeight === "number"
      ? textureImage.naturalHeight
      : textureImage && "height" in textureImage && typeof textureImage.height === "number"
        ? textureImage.height
        : 1024;

  const uniforms = {
    uFoilStrength: { value: profile.foilStrength },
    uRainbowStrength: { value: profile.rainbowStrength },
    uPointerUv: { value: new THREE.Vector2(0.5, 0.5) },
    uPointerStrength: { value: 0 },
    uCardTexture: { value: cardTexture },
    uTexelSize: { value: new THREE.Vector2(1 / textureWidth, 1 / textureHeight) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;

      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uFoilStrength;
      uniform float uRainbowStrength;
      uniform vec2 uPointerUv;
      uniform float uPointerStrength;
      uniform sampler2D uCardTexture;
      uniform vec2 uTexelSize;

      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;

      vec3 screenBlend(vec3 base, vec3 blend) {
        return 1.0 - (1.0 - base) * (1.0 - blend);
      }

      vec3 colorDodgeBlend(vec3 base, vec3 blend) {
        return min(base / max(vec3(0.001), 1.0 - blend), vec3(1.0));
      }

      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 0.6666667, 0.3333333, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      vec3 sampleCard(vec2 uv) {
        return texture2D(uCardTexture, clamp(uv, 0.0, 1.0)).rgb;
      }

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 reflectDir = normalize(reflect(-viewDir, normal));
        float facing = clamp(dot(normal, viewDir), 0.0, 1.0);
        float fresnel = pow(1.0 - facing, 1.28);
        vec2 centeredUv = vUv - 0.5;
        vec2 holoDrift = vec2(reflectDir.x * 0.24, reflectDir.y * 0.18);
        vec2 pointerUv = mix(vec2(0.5, 0.5), uPointerUv, clamp(uPointerStrength, 0.0, 1.0));
        vec3 artColor = sampleCard(vUv);
        vec3 artSampleX = sampleCard(vUv + vec2(uTexelSize.x * 2.0, 0.0));
        vec3 artSampleY = sampleCard(vUv + vec2(0.0, uTexelSize.y * 2.0));
        vec3 artSampleDiag = sampleCard(vUv + uTexelSize * vec2(1.75, -1.75));
        float artLuma = dot(artColor, vec3(0.299, 0.587, 0.114));
        float artMax = max(max(artColor.r, artColor.g), artColor.b);
        float artMin = min(min(artColor.r, artColor.g), artColor.b);
        float artSaturation = artMax - artMin;
        float artDetail = clamp(
          (length(artColor - artSampleX) + length(artColor - artSampleY) + length(artColor - artSampleDiag)) * 1.28,
          0.0,
          1.0
        );
        float lumaDx = dot(artSampleX - artColor, vec3(0.299, 0.587, 0.114));
        float lumaDy = dot(artSampleY - artColor, vec3(0.299, 0.587, 0.114));
        vec2 localGradient = vec2(lumaDx, lumaDy);
        float gradientStrength = clamp(length(localGradient) * 8.0 + artDetail * 0.45, 0.0, 1.0);
        vec2 artAxis = normalize(
          localGradient +
          vec2(
            (artColor.r - artColor.b) * 0.06 + 0.001,
            (artColor.g - artColor.r) * 0.06 + 0.001
          )
        );
        float artRegion = dot(artColor, vec3(0.88, 1.34, 1.71));
        float artSweep = 1.0 - smoothstep(
          0.08,
          0.32,
          abs(
            dot(centeredUv, artAxis * vec2(1.0, 0.72)) +
              reflectDir.x * mix(0.38, 0.96, gradientStrength) -
              reflectDir.y * mix(0.22, 0.78, gradientStrength) +
              (artRegion - 1.0) * 0.12
          )
        );
        float artSpecular = pow(
          clamp(dot(reflectDir, normalize(vec3(artAxis * vec2(0.82, 0.56), 1.0))), 0.0, 1.0),
          mix(28.0, 8.0, gradientStrength)
        );
        float microSpecular = pow(
          clamp(dot(reflectDir, normalize(vec3(vec2(-artAxis.y, artAxis.x) * vec2(0.56, 0.4), 1.0))), 0.0, 1.0),
          mix(40.0, 14.0, gradientStrength)
        ) * (0.12 + artDetail * 0.88);
        float detailPresence = clamp(gradientStrength * 0.72 + artDetail * 0.58, 0.0, 1.0);
        float textInkMask =
          smoothstep(0.28, 0.82, detailPresence) *
          smoothstep(0.02, 0.22, 1.0 - artSaturation) *
          smoothstep(0.12, 0.74, 1.0 - artLuma);
        float readabilityMask = mix(
          mix(1.0, 0.74, smoothstep(0.24, 0.92, detailPresence)),
          0.42,
          textInkMask
        );
        float localFoilFocus = clamp(
          artDetail * 0.82 + gradientStrength * 0.68 + artSpecular * 0.52 + artSaturation * 0.28,
          0.0,
          1.0
        );
        float foilMask = clamp(
          0.08 + artSaturation * 0.39 + artDetail * 0.6 + gradientStrength * 0.34 + (1.0 - artLuma) * 0.04,
          0.0,
          1.0
        ) * readabilityMask;
        float microBand = 1.0 - smoothstep(
          0.05,
          0.2,
          abs(
            dot(centeredUv, normalize(vec2(-artAxis.y, artAxis.x) * vec2(0.88, 0.72))) +
              reflectDir.x * mix(0.16, 0.48, gradientStrength) -
              reflectDir.y * mix(0.1, 0.32, gradientStrength) +
              (artRegion - 1.0) * 0.08
          )
        );
        float localFoilBoost = 1.0 + localFoilFocus * (0.12 + microBand * 0.34);

        float cursorDistance = distance(
          vUv + holoDrift * 0.16,
          pointerUv + vec2(reflectDir.x * 0.06, -reflectDir.y * 0.04)
        );
        float cursorSoft = pow(clamp(1.0 - cursorDistance * 2.8, 0.0, 1.0), 4.0) * uPointerStrength;
        float cursorHighlight = pow(clamp(1.0 - cursorDistance * 4.9, 0.0, 1.0), 9.0) * uPointerStrength;

        float tiltSweep = 1.0 - smoothstep(
          0.1,
          0.34,
          abs(
            dot(centeredUv, normalize(vec2(0.86, -0.52))) + reflectDir.x * 0.98 - reflectDir.y * 0.64
          )
        );
        float secondarySweep = 1.0 - smoothstep(
          0.12,
          0.36,
          abs(
            dot(centeredUv, normalize(vec2(-0.38, 0.92))) - reflectDir.x * 0.48 - reflectDir.y * 0.38
          )
        );
        float grazingHighlight = pow(
          clamp(dot(reflectDir, normalize(vec3(0.16, 0.14, 1.0))), 0.0, 1.0),
          8.0
        );

        vec3 silverColor = mix(
          vec3(0.72, 0.76, 0.82),
          vec3(1.0, 0.98, 0.95),
          clamp(
            grazingHighlight * 0.82 +
              artSweep * 0.32 +
              artSpecular * 0.74 +
              microSpecular * 0.46 +
              microBand * 0.18 +
              cursorHighlight * 0.12,
            0.0,
            1.0
          )
        );
        vec3 baseFoil =
          silverColor *
          clamp(
            0.1 +
              fresnel * 0.13 +
              tiltSweep * 0.08 +
              secondarySweep * 0.055 +
              artSweep * 0.34 +
              artSpecular * 0.5 +
              microSpecular * 0.3 +
              microBand * 0.12 +
              cursorSoft * 0.1,
            0.0,
            1.0
          ) *
          foilMask *
          localFoilBoost *
          uFoilStrength;
        vec3 color = screenBlend(vec3(0.02), baseFoil);
        color = screenBlend(
          color,
          vec3(1.0, 0.98, 0.94) *
            cursorHighlight *
            foilMask *
            0.08 *
            uFoilStrength
        );
        color = screenBlend(
          color,
          vec3(1.0) * microSpecular * foilMask * 0.1 * uFoilStrength
        );
        float alpha = clamp(
          foilMask *
            (0.026 +
              fresnel * 0.06 +
              artSweep * 0.12 +
              artSpecular * 0.17 +
              microSpecular * 0.11 +
              microBand * 0.09 +
              cursorHighlight * 0.055 +
              grazingHighlight * 0.15) *
            mix(1.0, 1.18, localFoilFocus * microBand) *
            uFoilStrength,
          0.0,
          0.54
        );

        if (uRainbowStrength > 0.0) {
          float prismPhase =
            dot(centeredUv, artAxis * vec2(1.0, 0.76)) * 0.82 +
            reflectDir.x * 0.78 -
            reflectDir.y * 0.46 +
            artRegion * 0.22;
          float prismBand = 1.0 - smoothstep(
            0.12,
            0.34,
            abs(prismPhase)
          );
          float rainbowSweep = 1.0 - smoothstep(
            0.14,
            0.52,
            abs(
              dot(centeredUv, normalize(vec2(0.78, -0.62))) +
                reflectDir.x * 0.95 -
                reflectDir.y * 0.68
            )
          );
          float prismMask = clamp(
            foilMask *
              (
                0.13 +
                artSaturation * 0.45 +
                artDetail * 0.43 +
                gradientStrength * 0.26 +
                artSpecular * 0.3 +
                localFoilFocus * 0.18
              ) *
              (rainbowSweep * 0.84 + prismBand * 0.38 + microBand * 0.28 + cursorSoft * 0.13),
            0.0,
            1.0
          ) * uRainbowStrength;
          vec3 rainbow = hsv2rgb(
            vec3(
              fract(
                artRegion * 0.9 +
                  dot(centeredUv, artAxis) * 0.8 +
                  reflectDir.x * 0.78 -
                  reflectDir.y * 0.46
              ),
              0.96,
              1.0
            )
          );
          vec3 rainbowBlend = rainbow * prismMask;
          color = screenBlend(color, rainbowBlend * 1.18);
          color = mix(color, colorDodgeBlend(color, rainbowBlend * 1.06), 0.52);
          alpha += prismMask * 0.35;
        }

        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.68));
      }
    `,
  });

  return { material, uniforms };
}

function createRoundedRectShape(
  THREE: typeof import("three"),
  width: number,
  height: number,
  radius: number
) {
  const shape = new THREE.Shape();
  appendRoundedRectPath(shape, -width / 2, -height / 2, width, height, radius);
  return shape;
}

function appendRoundedRectPath(
  target: import("three").Shape | import("three").Path,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const w = width;
  const h = height;
  const r = Math.min(radius, width / 2, height / 2);

  target.moveTo(x + r, y);
  target.lineTo(x + w - r, y);
  target.quadraticCurveTo(x + w, y, x + w, y + r);
  target.lineTo(x + w, y + h - r);
  target.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  target.lineTo(x + r, y + h);
  target.quadraticCurveTo(x, y + h, x, y + h - r);
  target.lineTo(x, y + r);
  target.quadraticCurveTo(x, y, x + r, y);
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const clampedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + clampedRadius, y);
  context.lineTo(x + width - clampedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
  context.lineTo(x + width, y + height - clampedRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
  context.lineTo(x + clampedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
  context.lineTo(x, y + clampedRadius);
  context.quadraticCurveTo(x, y, x + clampedRadius, y);
  context.closePath();
}

function drawPsaLogoMark(
  context: CanvasRenderingContext2D,
  centerX: number,
  baselineY: number,
  fontSize: number
) {
  const drawLetter = (
    letter: string,
    x: number,
    color: string,
    scale = 1
  ) => {
    context.save();
    context.translate(x, baselineY);
    context.scale(scale, scale);
    context.font = `900 ${fontSize}px Arial Black, Arial, sans-serif`;
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.lineJoin = "round";
    context.lineWidth = fontSize * 0.08;
    context.strokeStyle = "rgba(17,17,17,0.78)";
    context.shadowColor = "rgba(255,255,255,0.92)";
    context.shadowBlur = fontSize * 0.05;
    context.shadowOffsetY = fontSize * 0.025;
    context.strokeText(letter, 0, 0);
    context.fillStyle = color;
    context.fillText(letter, 0, 0);
    context.restore();
  };

  drawLetter("P", centerX - fontSize * 0.92, "#1f57ab", 1.02);
  drawLetter("S", centerX - fontSize * 0.27, "#f53933", 1.17);
  drawLetter("A", centerX + fontSize * 0.41, "#1f57ab", 1.02);
}

function createPsaLabelTexture(
  THREE: typeof import("three"),
  cardName: string,
  episodeName: string | null | undefined,
  cardNumber: string | null,
  grade: string
) {
  const scale = 2;
  const s = (value: number) => value * scale;
  const canvas = document.createElement("canvas");
  canvas.width = s(1400);
  canvas.height = s(420);

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#e13b37";
  drawRoundedRect(context, 0, 0, canvas.width, canvas.height - s(34), s(30));
  context.fill();

  context.fillStyle = "#fbfbfb";
  drawRoundedRect(context, s(16), s(16), canvas.width - s(32), canvas.height - s(66), s(24));
  context.fill();

  const leftX = s(50);
  const rightX = canvas.width - s(48);
  const eyebrowY = s(92);
  const nameY = s(184);
  const setY = s(258);
  const cardNumberY = s(104);
  const descriptorY = s(180);
  const gradeY = s(302);

  context.fillStyle = "#111111";
  context.font = `700 ${s(34)}px Arial, sans-serif`;
  context.fillText("POKEMON TCG", leftX, eyebrowY);

  context.font = `700 ${s(68)}px Arial, sans-serif`;
  context.fillText(formatPsaNameLine(cardName), leftX, nameY);

  context.globalAlpha = 0.85;
  context.font = `600 ${s(46)}px Arial, sans-serif`;
  context.fillText(formatPsaSetLine(episodeName ?? cardName, cardNumber), leftX, setY);
  context.globalAlpha = 1;

  context.textAlign = "right";
  context.font = `700 ${s(52)}px Arial, sans-serif`;
  if (cardNumber) {
    context.fillText(`#${cardNumber}`, rightX, cardNumberY);
  }

  context.font = `700 ${s(52)}px Arial, sans-serif`;
  context.fillText(getPsaGradeDescriptor(grade) ?? "GRADE", rightX, descriptorY);

  context.font = `900 ${s(128)}px Arial Black, Arial, sans-serif`;
  context.fillText(grade, rightX, gradeY);
  context.textAlign = "start";

  context.fillStyle = "#e13b37";
  const logoOuterWidth = canvas.width * 0.27;
  const logoOuterX = (canvas.width - logoOuterWidth) / 2;
  const logoOuterY = canvas.height - s(72);
  drawRoundedRect(context, logoOuterX, logoOuterY, logoOuterWidth, s(62), s(10));
  context.fill();

  context.fillStyle = "#fcfcfc";
  drawRoundedRect(
    context,
    logoOuterX + s(8),
    logoOuterY + s(8),
    logoOuterWidth - s(16),
    s(50),
    s(8)
  );
  context.fill();
  drawPsaLogoMark(context, canvas.width / 2, canvas.height - s(24), s(52));

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createPsaCertNumber(cardName: string, cardNumber: string | null, grade: string) {
  const input = `${cardName}|${cardNumber ?? ""}|${grade}`;
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return String(10000000 + (hash % 90000000));
}

function createPsaLabelBackTexture(
  THREE: typeof import("three"),
  cardName: string,
  cardNumber: string | null,
  grade: string
) {
  const scale = 2;
  const s = (value: number) => value * scale;
  const canvas = document.createElement("canvas");
  canvas.width = s(1400);
  canvas.height = s(420);

  const context = canvas.getContext("2d");
  if (!context) return null;

  const certNumber = createPsaCertNumber(cardName, cardNumber, grade);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, "#f8f7f3");
  background.addColorStop(0.5, "#eeece6");
  background.addColorStop(1, "#faf9f5");
  context.fillStyle = background;
  drawRoundedRect(context, 0, 0, canvas.width, canvas.height, s(28));
  context.fill();

  context.fillStyle = "#d93431";
  drawRoundedRect(context, 0, 0, canvas.width, s(62), s(24));
  context.fill();
  context.fillRect(0, s(34), canvas.width, s(34));

  context.strokeStyle = "rgba(20,34,55,0.12)";
  context.lineWidth = s(3);
  for (let y = s(96); y < canvas.height - s(70); y += s(42)) {
    context.beginPath();
    context.moveTo(s(56), y);
    context.lineTo(canvas.width - s(56), y);
    context.stroke();
  }

  context.fillStyle = "#17223a";
  context.font = `900 ${s(34)}px Arial Black, Arial, sans-serif`;
  context.fillText("PSA CERTIFICATION", s(56), s(120));
  context.font = `700 ${s(24)}px Arial, sans-serif`;
  context.fillStyle = "rgba(23,34,58,0.72)";
  context.fillText("Verify certification and population data at PSAcard.com/cert", s(56), s(160));

  context.fillStyle = "#101828";
  context.font = `900 ${s(78)}px Arial Black, Arial, sans-serif`;
  context.fillText(certNumber, s(56), s(250));
  context.font = `800 ${s(30)}px Arial, sans-serif`;
  context.fillStyle = "rgba(16,24,40,0.62)";
  context.fillText(`GRADE ${grade}`, s(58), s(300));

  const barcodeX = s(56);
  const barcodeY = s(326);
  const barcodeH = s(56);
  let x = barcodeX;
  for (let index = 0; index < 52; index += 1) {
    const digit = Number(certNumber[index % certNumber.length]);
    const width = s(2 + (digit % 4));
    context.fillStyle = digit % 2 === 0 ? "#111827" : "#334155";
    context.fillRect(x, barcodeY, width, barcodeH);
    x += width + s(3 + (digit % 3));
  }

  const qrSize = s(180);
  const qrX = canvas.width - s(260);
  const qrY = s(122);
  context.fillStyle = "#f9fafb";
  drawRoundedRect(context, qrX - s(14), qrY - s(14), qrSize + s(28), qrSize + s(28), s(16));
  context.fill();
  context.strokeStyle = "rgba(17,24,39,0.18)";
  context.lineWidth = s(3);
  context.stroke();

  context.fillStyle = "#111827";
  const cell = qrSize / 9;
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const seed = certNumber[(row + col * 3) % certNumber.length].charCodeAt(0);
      const finder =
        (row < 3 && col < 3) ||
        (row < 3 && col > 5) ||
        (row > 5 && col < 3);
      if (finder || (seed + row + col) % 3 === 0) {
        context.fillRect(qrX + col * cell, qrY + row * cell, cell * 0.72, cell * 0.72);
      }
    }
  }

  drawPsaLogoMark(context, canvas.width - s(150), canvas.height - s(42), s(56));

  context.fillStyle = "rgba(255,255,255,0.92)";
  context.font = `900 ${s(28)}px Arial Black, Arial, sans-serif`;
  context.fillText("PSA", s(56), s(43));
  context.textAlign = "right";
  context.font = `700 ${s(22)}px Arial, sans-serif`;
  context.fillText("AUTHENTICATED AND GRADED", canvas.width - s(56), s(42));
  context.textAlign = "left";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createBgsLabelTexture(
  THREE: typeof import("three"),
  cardName: string,
  episodeName: string | null | undefined,
  cardNumber: string | null,
  grade: string,
  subgrades: BgsSubgrades | null | undefined
) {
  const scale = 2;
  const s = (value: number) => value * scale;
  const canvas = document.createElement("canvas");
  canvas.width = s(1500);
  canvas.height = s(420);

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const goldGradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  goldGradient.addColorStop(0, "#fff4bc");
  goldGradient.addColorStop(0.25, "#ddb95a");
  goldGradient.addColorStop(0.62, "#8b631e");
  goldGradient.addColorStop(1, "#f2d57a");
  context.fillStyle = goldGradient;
  drawRoundedRect(context, 0, 0, canvas.width, canvas.height, s(26));
  context.fill();

  context.strokeStyle = "rgba(39,24,7,0.72)";
  context.lineWidth = s(7);
  context.stroke();

  context.fillStyle = "rgba(255,255,255,0.42)";
  context.fillRect(s(18), s(18), canvas.width - s(36), s(48));

  context.fillStyle = "#1b1207";
  context.font = `900 ${s(30)}px Arial Black, Arial, sans-serif`;
  context.fillText("BECKETT GRADING SERVICES", s(36), s(52));
  context.textAlign = "right";
  context.fillStyle = "#771b14";
  context.font = `900 ${s(35)}px Arial Black, Arial, sans-serif`;
  context.fillText("BGS", canvas.width - s(36), s(54));
  context.textAlign = "left";

  const subgradeX = s(34);
  const subgradeY = s(92);
  const subgradeW = s(390);
  const subgradeH = s(258);
  context.fillStyle = "rgba(255,249,222,0.62)";
  drawRoundedRect(context, subgradeX, subgradeY, subgradeW, subgradeH, s(16));
  context.fill();
  context.strokeStyle = "rgba(37,24,9,0.46)";
  context.lineWidth = s(3);
  context.stroke();

  const cellW = subgradeW / 2;
  const cellH = subgradeH / 2;
  BGS_SUBGRADE_KEYS.forEach((key, index) => {
    const x = subgradeX + (index % 2) * cellW;
    const y = subgradeY + Math.floor(index / 2) * cellH;
    context.strokeStyle = "rgba(37,24,9,0.26)";
    context.lineWidth = s(2);
    context.strokeRect(x, y, cellW, cellH);
    context.fillStyle = "#33230b";
    context.font = `800 ${s(22)}px Arial, sans-serif`;
    context.fillText(formatBgsSubgradeName(key).toUpperCase(), x + s(18), y + s(38));
    context.fillStyle = "#111";
    context.font = `900 ${s(54)}px Arial Black, Arial, sans-serif`;
    context.fillText(subgrades?.[key] ?? "-", x + s(20), y + s(98));
  });

  const detailsX = s(456);
  const detailsRight = canvas.width - s(330);
  context.fillStyle = "#17110a";
  context.font = `900 ${s(52)}px Arial Black, Arial, sans-serif`;
  context.fillText(formatPsaNameLine(cardName), detailsX, s(150), detailsRight - detailsX);
  context.globalAlpha = 0.82;
  context.font = `800 ${s(32)}px Arial, sans-serif`;
  context.fillText(formatPsaSetLine(episodeName ?? cardName, cardNumber), detailsX, s(206), detailsRight - detailsX);
  context.globalAlpha = 1;
  context.font = `700 ${s(24)}px Arial, sans-serif`;
  context.fillText("CERTIFIED AUTHENTIC", detailsX, s(284));
  context.fillText("SUBGRADES", subgradeX, s(384));

  const gradeX = canvas.width - s(292);
  const gradeY = s(92);
  const gradeW = s(258);
  const gradeH = s(258);
  const gradeGradient = context.createLinearGradient(gradeX, gradeY, gradeX, gradeY + gradeH);
  gradeGradient.addColorStop(0, "#2b1c09");
  gradeGradient.addColorStop(1, "#050403");
  context.fillStyle = gradeGradient;
  drawRoundedRect(context, gradeX, gradeY, gradeW, gradeH, s(16));
  context.fill();
  context.strokeStyle = "rgba(255,229,151,0.44)";
  context.lineWidth = s(4);
  context.stroke();
  context.textAlign = "center";
  context.fillStyle = "#f9df83";
  context.font = `900 ${s(25)}px Arial Black, Arial, sans-serif`;
  context.fillText(getBgsGradeDescriptor(grade), gradeX + gradeW / 2, gradeY + s(52));
  context.fillStyle = "#ffffff";
  context.font = `900 ${s(132)}px Arial Black, Arial, sans-serif`;
  context.fillText(grade, gradeX + gradeW / 2, gradeY + s(190));
  context.textAlign = "left";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function fitStlGeometry(
  geometry: import("three").BufferGeometry,
  THREE: typeof import("three"),
  targetSize: { width: number; height: number; depth: number }
) {
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return;

  const center = new THREE.Vector3();
  bounds.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);

  geometry.computeBoundingBox();
  const centeredBounds = geometry.boundingBox;
  if (!centeredBounds) return;

  const size = new THREE.Vector3();
  centeredBounds.getSize(size);
  const scale = Math.min(
    targetSize.width / Math.max(size.x, 0.0001),
    targetSize.height / Math.max(size.y, 0.0001),
    targetSize.depth / Math.max(size.z, 0.0001)
  );

  geometry.scale(scale, scale, scale);
}

function sliceGeometryByCentroidZ(
  THREE: typeof import("three"),
  geometry: import("three").BufferGeometry,
  predicate: (centroidZ: number) => boolean
) {
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");

  if (!positions || positions.count % 3 !== 0) {
    return null;
  }

  const nextPositions: number[] = [];
  const nextNormals: number[] = [];

  for (let index = 0; index < positions.count; index += 3) {
    const az = positions.getZ(index);
    const bz = positions.getZ(index + 1);
    const cz = positions.getZ(index + 2);
    const centroidZ = (az + bz + cz) / 3;

    if (!predicate(centroidZ)) {
      continue;
    }

    for (let vertexIndex = 0; vertexIndex < 3; vertexIndex += 1) {
      const offset = index + vertexIndex;
      nextPositions.push(
        positions.getX(offset),
        positions.getY(offset),
        positions.getZ(offset)
      );

      if (normals) {
        nextNormals.push(
          normals.getX(offset),
          normals.getY(offset),
          normals.getZ(offset)
        );
      }
    }
  }

  if (nextPositions.length === 0) {
    return null;
  }

  const nextGeometry = new THREE.BufferGeometry();
  nextGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(nextPositions, 3)
  );

  if (nextNormals.length === nextPositions.length) {
    nextGeometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(nextNormals, 3)
    );
  } else {
    nextGeometry.computeVertexNormals();
  }

  return nextGeometry;
}

function flattenTextureOnCardSurface(
  THREE: typeof import("three"),
  texture: import("three").Texture,
  fillColor: string
) {
  const image = texture.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | OffscreenCanvas
    | undefined;

  if (!image) {
    return texture;
  }

  const width =
    "naturalWidth" in image && typeof image.naturalWidth === "number"
      ? image.naturalWidth
      : "width" in image && typeof image.width === "number"
        ? image.width
        : 0;
  const height =
    "naturalHeight" in image && typeof image.naturalHeight === "number"
      ? image.naturalHeight
      : "height" in image && typeof image.height === "number"
        ? image.height
        : 0;

  if (!width || !height) {
    return texture;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return texture;
  }

  try {
    const bleed = Math.max(2, Math.round(width * CARD_FRONT_TEXTURE_BLEED));

    context.fillStyle = fillColor;
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, -bleed, -bleed, width + bleed * 2, height + bleed * 2);
    context.drawImage(image, 0, 0, width, height);

    const flattenedTexture = new THREE.CanvasTexture(canvas);
    flattenedTexture.colorSpace = THREE.SRGBColorSpace;
    flattenedTexture.anisotropy = texture.anisotropy;
    flattenedTexture.minFilter = texture.minFilter;
    flattenedTexture.magFilter = texture.magFilter;
    flattenedTexture.generateMipmaps = texture.generateMipmaps;
    flattenedTexture.needsUpdate = true;
    return flattenedTexture;
  } catch (error) {
    console.warn("Failed to flatten card texture onto paper surface", error);
    return texture;
  }
}

function normalizeGeometryUvs(THREE: typeof import("three"), geometry: import("three").BufferGeometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const positions = geometry.getAttribute("position");

  if (!bounds || !positions) return;

  const width = Math.max(bounds.max.x - bounds.min.x, 0.0001);
  const height = Math.max(bounds.max.y - bounds.min.y, 0.0001);
  const uvs = new Float32Array(positions.count * 2);

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    uvs[index * 2] = (x - bounds.min.x) / width;
    uvs[index * 2 + 1] = (y - bounds.min.y) / height;
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

function insetTexture(texture: import("three").Texture, inset: number) {
  texture.wrapS = 1001;
  texture.wrapT = 1001;
  texture.offset.set(inset, inset);
  texture.repeat.set(1 - inset * 2, 1 - inset * 2);
  texture.needsUpdate = true;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getSafeCameraDistance(
  camera: import("three").PerspectiveCamera,
  boundingRadius: number
) {
  const verticalHalfFov = (camera.fov * Math.PI) / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(camera.aspect, 0.01));
  const limitingHalfFov = Math.max(Math.min(verticalHalfFov, horizontalHalfFov), 0.01);
  return (boundingRadius / Math.sin(limitingHalfFov)) * 1.08;
}

function getBaseFramingOffset(viewportWidth: number) {
  if (viewportWidth >= 1536) return 0.94;
  if (viewportWidth >= 1280) return 0.62;
  if (viewportWidth >= 1024) return 0.5;
  if (viewportWidth >= 768) return 0.28;
  return 0;
}

function getFramingOffset(
  viewportWidth: number,
  cameraDistance: number,
  resetCameraDistance: number,
  offsetScale: number
) {
  const baseOffset = getBaseFramingOffset(viewportWidth);
  if (baseOffset === 0) return 0;

  const minOffset = 0;
  const zoomRange = Math.max(resetCameraDistance - MIN_CAMERA_DISTANCE, 0.001);
  const zoomProgress = clamp(
    (resetCameraDistance - cameraDistance) / zoomRange,
    0,
    1
  );

  const scaledBaseOffset = baseOffset * offsetScale;
  return scaledBaseOffset + (minOffset - scaledBaseOffset) * zoomProgress;
}

function getBaseVerticalFramingOffset(viewportWidth: number, viewportHeight: number) {
  if (viewportWidth >= 768) return 0;
  if (viewportHeight <= 700) return 1.36 + MOBILE_DETAIL_PANEL_CLEARANCE_OFFSET;
  if (viewportHeight <= 780) return 1.22 + MOBILE_DETAIL_PANEL_CLEARANCE_OFFSET;
  return 1.08 + MOBILE_DETAIL_PANEL_CLEARANCE_OFFSET;
}

function getVerticalFramingOffset(
  viewportWidth: number,
  viewportHeight: number,
  cameraDistance: number,
  resetCameraDistance: number,
  offsetScale: number
) {
  const baseOffset = getBaseVerticalFramingOffset(viewportWidth, viewportHeight);
  if (baseOffset === 0) return 0;

  const minOffset = baseOffset * 0.5;
  const zoomRange = Math.max(resetCameraDistance - MIN_CAMERA_DISTANCE, 0.001);
  const zoomProgress = clamp(
    (resetCameraDistance - cameraDistance) / zoomRange,
    0,
    1
  );

  const scaledBaseOffset = baseOffset * offsetScale;
  return scaledBaseOffset + (minOffset - scaledBaseOffset) * zoomProgress;
}

function normalizeGradeSelection(value: string | null | undefined): string {
  return value?.toUpperCase().replace(/[^A-Z0-9.]+/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function findSavedGradedLabel(
  prices: Array<{ label: string; company?: string; grade?: string }>,
  collectionItem: ViewerCard["collection_item"] | null | undefined
): string | null {
  const company = normalizeGradingCompanyLabel(collectionItem?.grading_company);
  const grade = normalizeGradingGradeLabel(collectionItem?.grading_grade);
  if (!company || !grade) return null;

  const normalizedCompany = normalizeGradeSelection(company);
  const normalizedGrade = normalizeGradeSelection(grade);
  const exactStructuredMatch = prices.find((price) => {
    if (!price.company || !price.grade) return false;
    return (
      normalizeGradeSelection(price.company) === normalizedCompany &&
      normalizeGradeSelection(price.grade) === normalizedGrade
    );
  });
  if (exactStructuredMatch) return exactStructuredMatch.label;

  return (
    prices.find((price) => {
      const label = normalizeGradeSelection(price.label);
      return label.includes(normalizedCompany) && label.includes(normalizedGrade);
    })?.label ?? null
  );
}

export default function CardThreeViewer({
  card,
  frontImageUrl,
  cardMarketUrl,
  showGradedSlabPreview = false,
  onClose,
}: Props) {
  const { displaySettings, isMobileViewport } = useSettings();
  const card3dSize = displaySettings.card3dSize;
  const [priceSource, setPriceSource] = useState<"cardmarket" | "tcgplayer">("cardmarket");
  const [gradedSource, setGradedSource] = useState<"cardmarket" | "ebay">("cardmarket");
  const [selectedGradedLabel, setSelectedGradedLabel] = useState<string | null>(
    () =>
      findSavedGradedLabel(card.graded_prices ?? [], card.collection_item) ??
      getPreferredGradedLabel(card.graded_prices ?? [])
  );
  const [selectedEbaySoldGradedLabel, setSelectedEbaySoldGradedLabel] = useState<string | null>(
    () =>
      findSavedGradedLabel(card.ebay_sold_graded_prices ?? [], card.collection_item) ??
      getPreferredGradedLabel(
        (card.ebay_sold_graded_prices ?? []).map((price) => ({
          label: price.label,
          price: price.median_price,
        }))
      )
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<{ reset: () => void } | null>(null);
  const viewerApiRef = useRef<{
    hitTest: (clientX: number, clientY: number) => boolean;
    pointerHover: (clientX: number, clientY: number) => void;
    pointerDown: (pointerId: number, clientX: number, clientY: number) => void;
    pointerMove: (pointerId: number, clientX: number, clientY: number) => void;
    pointerUp: (pointerId: number) => void;
    wheel: (deltaY: number) => void;
  } | null>(null);
  const dragStateRef = useRef<{ active: boolean; pointerIds: Set<number> }>({
    active: false,
    pointerIds: new Set<number>(),
  });
  const clickAwayRef = useRef({ active: false, startX: 0, startY: 0 });
  const initialRotationRef = useRef({ x: -0.21, y: -0.72, z: 0 });
  const autoRotateRef = useRef(true);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const filteredCardMarketUrl = cardMarketUrl ? withCardMarketFilters(cardMarketUrl) : null;
  const gradingCompanyLabel = normalizeGradingCompanyLabel(card.collection_item?.grading_company);
  const gradingGradeLabel = normalizeGradingGradeLabel(card.collection_item?.grading_grade);
  const isPsaSlabViewer = Boolean(
    showGradedSlabPreview && gradingCompanyLabel === "PSA" && gradingGradeLabel
  );
  const isBgsSlabViewer = Boolean(
    showGradedSlabPreview && gradingCompanyLabel === "BGS" && gradingGradeLabel
  );
  const isSlabViewer = isPsaSlabViewer || isBgsSlabViewer;

  useBodyScrollLock();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const rootElement = rootRef.current;
    const renderHostElement = containerRef.current;
    if (!renderHostElement) return;
    const renderHost: HTMLDivElement = renderHostElement;
    const host: HTMLDivElement = renderHostElement;
    const sizeConfig = getCard3dSizeConfig(card3dSize, isMobileViewport);

    setIsReady(false);
    setHasError(false);
    autoRotateRef.current = true;
    viewerApiRef.current = null;
    dragStateRef.current = { active: false, pointerIds: new Set<number>() };

    let mounted = true;
    let animationFrameId = 0;
    let renderer: import("three").WebGLRenderer | null = null;
    let resizeHandler: (() => void) | null = null;
    let cleanupTextures: (() => void) | null = null;

    async function mountScene() {
      try {
        const THREE = await import("three");

        if (!mounted) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
          32,
          host.clientWidth / host.clientHeight,
          0.1,
          100
        );
        camera.position.set(0, 0.1, DEFAULT_CAMERA_DISTANCE);

        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(host.clientWidth, host.clientHeight);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        renderer.domElement.style.pointerEvents = "none";
        renderHost.appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
        keyLight.position.set(3.2, 2.8, 4.4);
        const rimLight = new THREE.DirectionalLight(0xa7c7ff, 0.55);
        rimLight.position.set(-3.5, 1.4, -2.6);
        const fillLight = new THREE.PointLight(0xffffff, 0.8, 15);
        fillLight.position.set(0, -1.1, 4.4);
        scene.add(ambientLight, keyLight, rimLight, fillLight);

        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin("anonymous");

        const loadTexture = (url: string) =>
          new Promise<import("three").Texture>((resolve, reject) => {
            textureLoader.load(
              url,
              (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1;
                texture.generateMipmaps = true;
                texture.minFilter = THREE.LinearMipmapLinearFilter;
                texture.magFilter = THREE.LinearFilter;
                resolve(texture);
              },
              undefined,
              reject
            );
          });

        const [loadedFrontTexture, backTexture, stlLoaderModule] = await Promise.all([
          loadTexture(getCachedImageUrl(frontImageUrl) ?? frontImageUrl),
          loadTexture(CARD_BACK_URL),
          isPsaSlabViewer ? import("three/examples/jsm/loaders/STLLoader.js") : Promise.resolve(null),
        ]);

        if (!mounted) {
          loadedFrontTexture.dispose();
          backTexture.dispose();
          return;
        }

        const frontTexture = flattenTextureOnCardSurface(
          THREE,
          loadedFrontTexture,
          CARD_PAPER_COLOR
        );
        if (frontTexture !== loadedFrontTexture) {
          loadedFrontTexture.dispose();
        }

        insetTexture(frontTexture, CARD_FRONT_TEXTURE_INSET);
        insetTexture(backTexture, CARD_BACK_TEXTURE_INSET);

        const edgeTexture = createEdgeTexture(THREE);
        const foilProfile = getFoilProfile(card.rarity);
        const { material: holoMaterial, uniforms: holoUniforms } = createFoilOverlayMaterial(
          THREE,
          foilProfile,
          frontTexture
        );
        if (isSlabViewer) {
          holoUniforms.uFoilStrength.value *= 0.72;
          holoUniforms.uRainbowStrength.value *= 0.58;
        }
        const cardGroup = new THREE.Group();
        const cameraTarget = new THREE.Vector3();
        const pickTargets: import("three").Object3D[] = [];
        const edgeMaterial = new THREE.MeshPhysicalMaterial({
          color: "#d8d1c7",
          map: edgeTexture ?? undefined,
          roughness: 0.58,
          metalness: 0.02,
          clearcoat: 0.22,
          clearcoatRoughness: 0.45,
        });
        const frontMaterial = new THREE.MeshPhysicalMaterial({
          map: frontTexture,
          roughness: 0.52,
          metalness: 0.02,
          clearcoat: 0.18,
          clearcoatRoughness: 0.55,
        });
        const backMaterial = new THREE.MeshPhysicalMaterial({
          map: backTexture,
          roughness: 0.5,
          metalness: 0.02,
          clearcoat: 0.18,
          clearcoatRoughness: 0.52,
        });
        const hiddenFaceMaterial = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });

        const faceShape = createRoundedRectShape(
          THREE,
          CARD_WIDTH,
          CARD_HEIGHT,
          CARD_CORNER_RADIUS
        );
        const edgeGeometry = new THREE.ExtrudeGeometry(faceShape, {
          depth: CARD_DEPTH,
          steps: 1,
          bevelEnabled: false,
          curveSegments: 24,
        });
        edgeGeometry.translate(0, 0, -CARD_DEPTH / 2);
        const edgeMesh = new THREE.Mesh(edgeGeometry, [hiddenFaceMaterial, edgeMaterial]);

        const faceGeometry = new THREE.ShapeGeometry(faceShape, 16);
        normalizeGeometryUvs(THREE, faceGeometry);

        const frontMesh = new THREE.Mesh(faceGeometry, frontMaterial);
        frontMesh.position.z = CARD_DEPTH / 2 + CARD_FACE_OFFSET;
        frontMesh.renderOrder = 1;

        const holoMesh = new THREE.Mesh(faceGeometry, holoMaterial);
        holoMesh.position.z = CARD_DEPTH / 2 + CARD_FACE_OFFSET * 2.6;
        holoMesh.renderOrder = 2;

        const backMesh = new THREE.Mesh(faceGeometry, backMaterial);
        backMesh.position.z = -(CARD_DEPTH / 2 + CARD_FACE_OFFSET);
        backMesh.rotation.y = Math.PI;

        if (isSlabViewer) {
          edgeMesh.scale.setScalar(PSA_CARD_SCALE);
          frontMesh.scale.setScalar(PSA_CARD_SCALE);
          holoMesh.scale.setScalar(PSA_CARD_SCALE);
          backMesh.scale.setScalar(PSA_CARD_SCALE);
          edgeMesh.position.y = PSA_CARD_CENTER_Y;
          frontMesh.position.y = PSA_CARD_CENTER_Y;
          holoMesh.position.y = PSA_CARD_CENTER_Y;
          backMesh.position.y = PSA_CARD_CENTER_Y;
          edgeMesh.position.z = -0.012;
          frontMesh.position.z = -0.0025;
          holoMesh.position.z = 0.0005;
          backMesh.position.z = -(CARD_DEPTH + 0.003);
        }

        cardGroup.add(edgeMesh, frontMesh, holoMesh, backMesh);
        pickTargets.push(frontMesh, backMesh, edgeMesh);

        let slabGeometry: import("three").BufferGeometry | null = null;
        let slabShellGeometry: import("three").BufferGeometry | null = null;
        let slabFrontGeometry: import("three").BufferGeometry | null = null;
        let slabBackGeometry: import("three").BufferGeometry | null = null;
        let slabFrontMaterial: import("three").Material | null = null;
        let slabBackMaterial: import("three").Material | null = null;
        let slabFrontMesh: import("three").Mesh | null = null;
        let slabBackMesh: import("three").Mesh | null = null;
        let labelTexture: import("three").Texture | null = null;
        let labelBackTexture: import("three").Texture | null = null;
        let cardCoverGeometry: import("three").BufferGeometry | null = null;
        let cardCoverMaterial: import("three").Material | null = null;
        let labelWellGeometry: import("three").BufferGeometry | null = null;
        let labelWellMaterial: import("three").Material | null = null;
        let labelCoverGeometry: import("three").BufferGeometry | null = null;
        let labelCoverMaterial: import("three").Material | null = null;
        let labelFaceGeometry: import("three").BufferGeometry | null = null;
        let labelFrontMaterial: import("three").Material | null = null;
        let labelBackMaterial: import("three").Material | null = null;

        if (isPsaSlabViewer && gradingGradeLabel && stlLoaderModule) {
          const stlLoader = new stlLoaderModule.STLLoader();
          slabGeometry = await new Promise<import("three").BufferGeometry>((resolve, reject) => {
            stlLoader.load("/assets/slabs/psa-slab.stl", resolve, undefined, reject);
          });

          if (!mounted) {
            slabGeometry.dispose();
            frontTexture.dispose();
            backTexture.dispose();
            edgeTexture?.dispose();
            return;
          }

          fitStlGeometry(slabGeometry, THREE, {
            width: PSA_SLAB_WIDTH,
            height: PSA_SLAB_HEIGHT,
            depth: PSA_SLAB_DEPTH,
          });

          slabBackGeometry = sliceGeometryByCentroidZ(THREE, slabGeometry, (centroidZ) => centroidZ < 0);
          slabFrontGeometry = sliceGeometryByCentroidZ(THREE, slabGeometry, (centroidZ) => centroidZ >= 0);

          slabBackMaterial = new THREE.MeshPhysicalMaterial({
            color: "#ecebe7",
            roughness: 0.08,
            metalness: 0,
            transparent: true,
            opacity: 0.3,
            transmission: 0.26,
            thickness: 0.16,
            ior: 1.46,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
            side: THREE.DoubleSide,
          });
          slabFrontMaterial = new THREE.MeshPhysicalMaterial({
            color: "#f3f2ef",
            roughness: 0.08,
            metalness: 0,
            transparent: true,
            opacity: 0.3,
            transmission: 0.26,
            thickness: 0.16,
            ior: 1.46,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
            depthWrite: false,
            side: THREE.DoubleSide,
          });

          if (slabBackGeometry) {
            slabBackMesh = new THREE.Mesh(slabBackGeometry, slabBackMaterial);
            slabBackMesh.renderOrder = 0.25;
            cardGroup.add(slabBackMesh);
            pickTargets.push(slabBackMesh);
          }

          if (slabFrontGeometry) {
            slabFrontMesh = new THREE.Mesh(slabFrontGeometry, slabFrontMaterial);
            slabFrontMesh.renderOrder = 2.25;
            cardGroup.add(slabFrontMesh);
            pickTargets.push(slabFrontMesh);
          }

          cardCoverGeometry = new THREE.ShapeGeometry(faceShape, 16);
          normalizeGeometryUvs(THREE, cardCoverGeometry);
          cardCoverMaterial = new THREE.MeshBasicMaterial({
            color: "#ffffff",
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const cardCoverMesh = new THREE.Mesh(cardCoverGeometry, cardCoverMaterial);
          cardCoverMesh.scale.setScalar(PSA_CARD_SCALE * 1.006);
          cardCoverMesh.position.set(0, PSA_CARD_CENTER_Y, PSA_CARD_COVER_Z);
          cardCoverMesh.renderOrder = 2.15;
          cardGroup.add(cardCoverMesh);

          const labelWellShape = createRoundedRectShape(
            THREE,
            PSA_LABEL_WELL_WIDTH,
            PSA_LABEL_WELL_HEIGHT,
            0.09
          );
          labelWellGeometry = new THREE.ShapeGeometry(labelWellShape, 18);
          normalizeGeometryUvs(THREE, labelWellGeometry);
          labelWellMaterial = new THREE.MeshBasicMaterial({
            color: "#cac7c0",
            transparent: true,
            opacity: 0,
            depthWrite: false,
          });
          const labelWellMesh = new THREE.Mesh(labelWellGeometry, labelWellMaterial);
          labelWellMesh.position.set(0, PSA_LABEL_Y, PSA_LABEL_WELL_Z);
          labelWellMesh.renderOrder = 0.55;
          cardGroup.add(labelWellMesh);

          labelTexture = createPsaLabelTexture(
            THREE,
            card.name,
            card.episode_name,
            card.card_number,
            gradingGradeLabel
          );
          if (labelTexture) {
            labelBackTexture = createPsaLabelBackTexture(
              THREE,
              card.name,
              card.card_number,
              gradingGradeLabel
            );
            const labelShape = createRoundedRectShape(
              THREE,
              PSA_LABEL_WIDTH,
              PSA_LABEL_HEIGHT,
              0.085
            );
            labelFaceGeometry = new THREE.ShapeGeometry(labelShape, 18);
            normalizeGeometryUvs(THREE, labelFaceGeometry);
            labelFrontMaterial = new THREE.MeshBasicMaterial({
              map: labelTexture,
              transparent: true,
              alphaTest: 0.02,
              toneMapped: false,
            });
            const labelFrontMesh = new THREE.Mesh(labelFaceGeometry, labelFrontMaterial);
            labelFrontMesh.position.set(0, PSA_LABEL_Y, PSA_LABEL_Z + 0.0002);
            labelFrontMesh.renderOrder = 0.76;
            cardGroup.add(labelFrontMesh);
            pickTargets.push(labelFrontMesh);

            labelBackMaterial = new THREE.MeshBasicMaterial({
              map: labelBackTexture ?? undefined,
              color: labelBackTexture ? "#ffffff" : "#f2f1ed",
              toneMapped: false,
            });
            const labelBackMesh = new THREE.Mesh(labelFaceGeometry, labelBackMaterial);
            labelBackMesh.position.set(0, PSA_LABEL_Y, PSA_LABEL_Z - 0.0002);
            labelBackMesh.rotation.y = Math.PI;
            labelBackMesh.renderOrder = 0.71;
            cardGroup.add(labelBackMesh);

            labelCoverGeometry = new THREE.ShapeGeometry(labelShape, 18);
            normalizeGeometryUvs(THREE, labelCoverGeometry);
            labelCoverMaterial = new THREE.MeshBasicMaterial({
              color: "#ffffff",
              transparent: true,
              opacity: 0,
              depthWrite: false,
              side: THREE.DoubleSide,
            });
            const labelCoverMesh = new THREE.Mesh(labelCoverGeometry, labelCoverMaterial);
            labelCoverMesh.scale.set(1, 1, 1);
            labelCoverMesh.position.set(0, PSA_LABEL_Y, PSA_LABEL_COVER_Z);
            labelCoverMesh.renderOrder = 2.16;
            cardGroup.add(labelCoverMesh);
          }
        }

        if (isBgsSlabViewer && gradingGradeLabel) {
          const slabShape = createRoundedRectShape(
            THREE,
            PSA_SLAB_WIDTH * 1.018,
            PSA_SLAB_HEIGHT * 1.012,
            0.2
          );
          slabShellGeometry = new THREE.ExtrudeGeometry(slabShape, {
            depth: PSA_SLAB_DEPTH * 0.88,
            steps: 1,
            bevelEnabled: true,
            bevelSegments: 8,
            bevelSize: 0.025,
            bevelThickness: 0.022,
            curveSegments: 28,
          });
          slabShellGeometry.translate(0, 0, -(PSA_SLAB_DEPTH * 0.88) / 2);
          slabFrontMaterial = new THREE.MeshPhysicalMaterial({
            color: "#f6f2e6",
            roughness: 0.06,
            metalness: 0,
            transparent: true,
            opacity: 0.28,
            transmission: 0.22,
            thickness: 0.18,
            ior: 1.46,
            clearcoat: 1,
            clearcoatRoughness: 0.05,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          slabFrontMesh = new THREE.Mesh(slabShellGeometry, slabFrontMaterial);
          slabFrontMesh.renderOrder = 2.1;
          cardGroup.add(slabFrontMesh);
          pickTargets.push(slabFrontMesh);

          const labelShape = createRoundedRectShape(
            THREE,
            PSA_LABEL_WIDTH * 1.05,
            PSA_LABEL_HEIGHT * 1.08,
            0.09
          );
          labelFaceGeometry = new THREE.ShapeGeometry(labelShape, 18);
          normalizeGeometryUvs(THREE, labelFaceGeometry);
          labelTexture = createBgsLabelTexture(
            THREE,
            card.name,
            card.episode_name,
            card.card_number,
            gradingGradeLabel,
            card.collection_item?.grading_subgrades ?? null
          );

          if (labelTexture) {
            labelBackMaterial = new THREE.MeshBasicMaterial({
              color: "#d8b45f",
              side: THREE.DoubleSide,
            });
            const labelBackMesh = new THREE.Mesh(labelFaceGeometry, labelBackMaterial);
            labelBackMesh.position.set(0, PSA_LABEL_Y, PSA_SLAB_DEPTH * 0.42);
            labelBackMesh.renderOrder = 2.12;
            cardGroup.add(labelBackMesh);

            labelFrontMaterial = new THREE.MeshBasicMaterial({
              map: labelTexture,
              transparent: true,
              alphaTest: 0.02,
              toneMapped: false,
            });
            const labelFrontMesh = new THREE.Mesh(labelFaceGeometry, labelFrontMaterial);
            labelFrontMesh.position.set(0, PSA_LABEL_Y, PSA_SLAB_DEPTH * 0.43);
            labelFrontMesh.renderOrder = 2.18;
            cardGroup.add(labelFrontMesh);
            pickTargets.push(labelFrontMesh);
          }

          const cardCoverShape = createRoundedRectShape(
            THREE,
            CARD_WIDTH * PSA_CARD_SCALE * 1.03,
            CARD_HEIGHT * PSA_CARD_SCALE * 1.025,
            CARD_CORNER_RADIUS * PSA_CARD_SCALE
          );
          cardCoverGeometry = new THREE.ShapeGeometry(cardCoverShape, 18);
          normalizeGeometryUvs(THREE, cardCoverGeometry);
          cardCoverMaterial = new THREE.MeshBasicMaterial({
            color: "#ffffff",
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const cardCoverMesh = new THREE.Mesh(cardCoverGeometry, cardCoverMaterial);
          cardCoverMesh.position.set(0, PSA_CARD_CENTER_Y, PSA_SLAB_DEPTH * 0.435);
          cardCoverMesh.renderOrder = 2.2;
          cardGroup.add(cardCoverMesh);
        }

        cardGroup.rotation.set(
          initialRotationRef.current.x,
          initialRotationRef.current.y,
          initialRotationRef.current.z
        );
        scene.add(cardGroup);

        const objectBounds = new THREE.Box3().setFromObject(cardGroup);
        const objectSize = new THREE.Vector3();
        objectBounds.getSize(objectSize);
        const objectBoundingRadius = Math.max(objectSize.length() / 2, CARD_WIDTH * 0.8);

        const targetRotation = { ...initialRotationRef.current };
        const getFitCameraDistance = () =>
          Math.max(DEFAULT_CAMERA_DISTANCE, getSafeCameraDistance(camera, objectBoundingRadius));
        const getResetCameraDistance = () => {
          const fitDistance = getFitCameraDistance();
          return clamp(
            Math.max(
              fitDistance * sizeConfig.resetDistanceScale,
              fitDistance * sizeConfig.minimumFitScale
            ),
            MIN_CAMERA_DISTANCE,
            MAX_CAMERA_DISTANCE
          );
        };

        let targetCameraDistance = getResetCameraDistance();
        const activePointers = new Map<number, { x: number; y: number }>();
        let pinchStartDistance: number | null = null;
        let pinchStartCameraDistance = targetCameraDistance;
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const pointerTargetUv = new THREE.Vector2(0.5, 0.5);
        let pointerTargetStrength = 0;

        const applyCameraConstraints = () => {
          targetCameraDistance = clamp(targetCameraDistance, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
          camera.position.z = clamp(camera.position.z, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
          return MIN_CAMERA_DISTANCE;
        };

        const updateFraming = () => {
          const offsetX = getFramingOffset(
            host.clientWidth,
            camera.position.z,
            getResetCameraDistance(),
            sizeConfig.offsetScale
          );
          const offsetY = getVerticalFramingOffset(
            host.clientWidth,
            host.clientHeight,
            camera.position.z,
            getResetCameraDistance(),
            sizeConfig.offsetScale
          );
          cardGroup.position.x = offsetX;
          cardGroup.position.y = offsetY;
          cameraTarget.set(
            offsetX * CAMERA_TARGET_FOLLOW,
            offsetY * CAMERA_TARGET_FOLLOW * 0.35,
            0
          );
          camera.lookAt(cameraTarget);
        };

        camera.position.z = targetCameraDistance;

        const intersectCard = (clientX: number, clientY: number) => {
          const rect = host.getBoundingClientRect();
          if (
            clientX < rect.left ||
            clientX > rect.right ||
            clientY < rect.top ||
            clientY > rect.bottom
          ) {
            return null;
          }

          const x = ((clientX - rect.left) / rect.width) * 2 - 1;
          const y = -((clientY - rect.top) / rect.height) * 2 + 1;
          pointer.set(x, y);
          raycaster.setFromCamera(pointer, camera);
          const intersections = raycaster.intersectObjects(pickTargets, false);
          return intersections.find((intersection) => intersection.uv) ?? intersections[0] ?? null;
        };

        const hitTestCard = (clientX: number, clientY: number) => intersectCard(clientX, clientY) != null;

        const updateFoilPointer = (clientX: number, clientY: number) => {
          const intersection = intersectCard(clientX, clientY);
          if (intersection?.uv) {
            pointerTargetUv.set(intersection.uv.x, intersection.uv.y);
            pointerTargetStrength = 1;
            return;
          }

          pointerTargetStrength = 0;
        };

        const getPointerDistance = () => {
          const [first, second] = [...activePointers.values()];
          if (!first || !second) return null;
          return Math.hypot(second.x - first.x, second.y - first.y);
        };

        const beginPointerInteraction = (pointerId: number, clientX: number, clientY: number) => {
          autoRotateRef.current = false;
          updateFoilPointer(clientX, clientY);
          activePointers.set(pointerId, { x: clientX, y: clientY });
          pinchStartDistance = activePointers.size === 2 ? getPointerDistance() : null;
          pinchStartCameraDistance = targetCameraDistance;
          if (rootElement && !rootElement.hasPointerCapture(pointerId)) {
            rootElement.setPointerCapture(pointerId);
          }
          if (rootElement) rootElement.style.cursor = "grabbing";
        };

        const movePointerInteraction = (pointerId: number, clientX: number, clientY: number) => {
          const current = activePointers.get(pointerId);
          if (!current) return;

          updateFoilPointer(clientX, clientY);
          const next = { x: clientX, y: clientY };
          activePointers.set(pointerId, next);

          if (activePointers.size >= 2) {
            const distance = getPointerDistance();
            if (distance != null && pinchStartDistance != null) {
              targetCameraDistance = clamp(
                pinchStartCameraDistance - (distance - pinchStartDistance) * 0.01,
                MIN_CAMERA_DISTANCE,
                MAX_CAMERA_DISTANCE
              );
            }
            return;
          }

          const deltaX = next.x - current.x;
          const deltaY = next.y - current.y;
          targetRotation.y += deltaX * 0.0105;
          targetRotation.x = clamp(targetRotation.x + deltaY * 0.0085, -1.05, 1.05);
          targetRotation.z = 0;
        };

        const endPointerInteraction = (pointerId: number) => {
          activePointers.delete(pointerId);
          if (activePointers.size < 2) {
            pinchStartDistance = null;
            pinchStartCameraDistance = targetCameraDistance;
          }
          if (activePointers.size === 0 && rootElement) {
            rootElement.style.cursor = "";
          }
          if (rootElement?.hasPointerCapture(pointerId)) {
            rootElement.releasePointerCapture(pointerId);
          }
        };

        const zoomInteraction = (deltaY: number) => {
          autoRotateRef.current = false;
          targetCameraDistance = clamp(
            targetCameraDistance + deltaY * 0.0032,
            MIN_CAMERA_DISTANCE,
            MAX_CAMERA_DISTANCE
          );
        };

        controlsRef.current = {
          reset: () => {
            autoRotateRef.current = false;
            targetRotation.x = initialRotationRef.current.x;
            targetRotation.y = initialRotationRef.current.y;
            targetRotation.z = initialRotationRef.current.z;
            targetCameraDistance = getResetCameraDistance();
          },
        };
        viewerApiRef.current = {
          hitTest: hitTestCard,
          pointerHover: updateFoilPointer,
          pointerDown: beginPointerInteraction,
          pointerMove: movePointerInteraction,
          pointerUp: endPointerInteraction,
          wheel: zoomInteraction,
        };

        updateFraming();

        resizeHandler = () => {
          if (!renderer) return;
          camera.aspect = host.clientWidth / host.clientHeight;
          camera.updateProjectionMatrix();
          applyCameraConstraints();
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          renderer.setSize(host.clientWidth, host.clientHeight);
          updateFraming();
        };
        window.addEventListener("resize", resizeHandler);

        cleanupTextures = () => {
          edgeGeometry.dispose();
          faceGeometry.dispose();
          edgeMaterial.dispose();
          frontMaterial.dispose();
          holoMaterial.dispose();
          backMaterial.dispose();
          hiddenFaceMaterial.dispose();
          slabGeometry?.dispose();
          slabShellGeometry?.dispose();
          slabFrontGeometry?.dispose();
          slabBackGeometry?.dispose();
          slabFrontMaterial?.dispose();
          slabBackMaterial?.dispose();
          cardCoverGeometry?.dispose();
          cardCoverMaterial?.dispose();
          labelFaceGeometry?.dispose();
          labelFrontMaterial?.dispose();
          labelBackMaterial?.dispose();
          labelTexture?.dispose();
          labelBackTexture?.dispose();
          labelWellGeometry?.dispose();
          labelWellMaterial?.dispose();
          labelCoverGeometry?.dispose();
          labelCoverMaterial?.dispose();
          slabGeometry?.dispose();
          frontTexture.dispose();
          backTexture.dispose();
          edgeTexture?.dispose();
        };

        if (mounted) {
          setIsReady(true);
        }

        const animate = () => {
          animationFrameId = window.requestAnimationFrame(animate);
          holoUniforms.uPointerUv.value.lerp(pointerTargetUv, 0.18);
          holoUniforms.uPointerStrength.value +=
            (pointerTargetStrength - holoUniforms.uPointerStrength.value) * 0.16;
          const minCameraDistance = applyCameraConstraints();

          if (autoRotateRef.current) {
            targetRotation.y += 0.0022;
            targetRotation.x =
              initialRotationRef.current.x + Math.sin(performance.now() * 0.001) * 0.014;
          }

          cardGroup.rotation.x += (targetRotation.x - cardGroup.rotation.x) * 0.16;
          cardGroup.rotation.y += (targetRotation.y - cardGroup.rotation.y) * 0.16;
          cardGroup.rotation.z = 0;
          camera.position.z += (targetCameraDistance - camera.position.z) * 0.18;
          camera.position.z = clamp(camera.position.z, minCameraDistance, MAX_CAMERA_DISTANCE);
          const offsetX = getFramingOffset(
            host.clientWidth,
            camera.position.z,
            getResetCameraDistance(),
            sizeConfig.offsetScale
          );
          const offsetY = getVerticalFramingOffset(
            host.clientWidth,
            host.clientHeight,
            camera.position.z,
            getResetCameraDistance(),
            sizeConfig.offsetScale
          );
          cardGroup.position.x +=
            (offsetX - cardGroup.position.x) * 0.18;
          cardGroup.position.y +=
            (offsetY - cardGroup.position.y) * 0.18;
          cameraTarget.set(
            cardGroup.position.x * CAMERA_TARGET_FOLLOW,
            cardGroup.position.y * CAMERA_TARGET_FOLLOW * 0.35,
            0
          );
          camera.lookAt(cameraTarget);
          renderer?.render(scene, camera);
        };

        animate();
      } catch (error) {
        console.error("Failed to initialize 3D card viewer", error);
        if (mounted) {
          setHasError(true);
        }
      }
    }

    void mountScene();

    return () => {
      mounted = false;
      window.cancelAnimationFrame(animationFrameId);
      if (resizeHandler) {
        window.removeEventListener("resize", resizeHandler);
      }
      cleanupTextures?.();
      if (renderer && renderHost.contains(renderer.domElement)) {
        renderHost.removeChild(renderer.domElement);
      }
      renderer?.dispose();
      controlsRef.current = null;
      viewerApiRef.current = null;
      if (rootElement) {
        rootElement.style.cursor = "";
      }
    };
  }, [
    frontImageUrl,
    card.rarity,
    card.name,
    card.card_number,
    card.episode_name,
    card.collection_item?.grading_subgrades,
    gradingGradeLabel,
    isPsaSlabViewer,
    isBgsSlabViewer,
    isSlabViewer,
    card3dSize,
    isMobileViewport,
  ]);

  const cardMarketPriceRows = [
    { label: "CardMarket", value: card.price?.cm_en_lowest_nm, currency: "EUR" as const },
    { label: "7d avg", value: card.price?.cm_en_avg_7d, currency: "EUR" as const },
    { label: "30d avg", value: card.price?.cm_en_avg_30d, currency: "EUR" as const },
  ].filter(({ value }) => value != null);
  const tcgPriceRows = [
    { label: "TCGPlayer", value: card.price?.tcp_market, currency: "USD" as const },
    { label: "TCP Mid", value: card.price?.tcp_mid, currency: "USD" as const },
    { label: "TCP Low", value: card.price?.tcp_low, currency: "USD" as const },
  ].filter(({ value }) => value != null);
  const gradedPriceRows = card.graded_prices ?? [];
  const ebaySoldGradedPriceRows = card.ebay_sold_graded_prices ?? [];
  const compactMobileDetails = isMobileViewport;
  const showTcgSource = tcgPriceRows.length > 0;
  const activePriceSource = showTcgSource ? priceSource : "cardmarket";
  const activePriceRows = activePriceSource === "tcgplayer" ? tcgPriceRows : cardMarketPriceRows;
  const [primaryPriceRow, ...secondaryPriceRows] = activePriceRows;
  const compactSecondaryPriceRows = compactMobileDetails
    ? secondaryPriceRows.slice(0, 2)
    : secondaryPriceRows;
  const hasCardMarketGradedPricing = gradedPriceRows.length > 0;
  const hasEbayGradedPricing = ebaySoldGradedPriceRows.length > 0;
  const effectiveGradedSource =
    gradedSource === "ebay" && hasEbayGradedPricing
      ? "ebay"
      : hasCardMarketGradedPricing
        ? "cardmarket"
        : "ebay";
  const showGradedSourceToggle = hasCardMarketGradedPricing && hasEbayGradedPricing;
  const preferredGradedLabel = getPreferredGradedLabel(gradedPriceRows);
  const selectedGradedPrice =
    gradedPriceRows.find((price) => price.label === selectedGradedLabel) ??
    gradedPriceRows.find((price) => price.label === preferredGradedLabel) ??
    gradedPriceRows[0] ??
    null;
  const preferredEbaySoldGradedLabel = getPreferredGradedLabel(
    ebaySoldGradedPriceRows.map((price) => ({
      label: price.label,
      price: price.median_price,
    }))
  );
  const selectedEbaySoldGradedPrice =
    ebaySoldGradedPriceRows.find((price) => price.label === selectedEbaySoldGradedLabel) ??
    ebaySoldGradedPriceRows.find((price) => price.label === preferredEbaySoldGradedLabel) ??
    ebaySoldGradedPriceRows[0] ??
    null;
  const selectedEbaySoldMedianEur =
    selectedEbaySoldGradedPrice?.median_price_eur ??
    (selectedEbaySoldGradedPrice?.currency === "EUR"
      ? selectedEbaySoldGradedPrice.median_price
      : null);
  const selectedEbaySoldDisplayCurrency = selectedEbaySoldMedianEur != null
    ? "EUR"
    : selectedEbaySoldGradedPrice?.currency === "EUR"
      ? "EUR"
      : "USD";
  const selectedEbaySoldDisplayPrice =
    selectedEbaySoldMedianEur ?? selectedEbaySoldGradedPrice?.median_price ?? null;
  const selectedEbaySoldMetaLabel =
    selectedEbaySoldGradedPrice?.sample_size != null
      ? `${selectedEbaySoldGradedPrice.sample_size} sold`
      : null;

  function isPersistentUiTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false;
    if (detailsRef.current?.contains(target)) return true;
    return target instanceof Element && target.closest("[data-viewer-keepopen='true']") != null;
  }

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[320] touch-none bg-black/85 backdrop-blur-md"
      style={{ overscrollBehavior: "contain", touchAction: "none" }}
      onPointerDownCapture={(event) => {
        const viewerApi = viewerApiRef.current;
        const dragState = dragStateRef.current;
        const keepOpenTarget = isPersistentUiTarget(event.target);
        const hitCard = viewerApi?.hitTest(event.clientX, event.clientY) ?? false;
        const joinsActiveTouchGesture =
          event.pointerType === "touch" && dragState.active && !keepOpenTarget;

        if (hitCard || joinsActiveTouchGesture) {
          const pointerIds = new Set(dragState.pointerIds);
          pointerIds.add(event.pointerId);
          clickAwayRef.current.active = false;
          dragStateRef.current = { active: true, pointerIds };
          viewerApi?.pointerDown(event.pointerId, event.clientX, event.clientY);
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (keepOpenTarget) {
          clickAwayRef.current.active = false;
          return;
        }

        clickAwayRef.current = {
          active: true,
          startX: event.clientX,
          startY: event.clientY,
        };
      }}
      onPointerMoveCapture={(event) => {
        viewerApiRef.current?.pointerHover(event.clientX, event.clientY);
        const dragState = dragStateRef.current;
        if (!dragState.active || !dragState.pointerIds.has(event.pointerId)) return;
        viewerApiRef.current?.pointerMove(event.pointerId, event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerUpCapture={(event) => {
        const dragState = dragStateRef.current;
        if (dragState.active && dragState.pointerIds.has(event.pointerId)) {
          viewerApiRef.current?.pointerUp(event.pointerId);
          const pointerIds = new Set(dragState.pointerIds);
          pointerIds.delete(event.pointerId);
          dragStateRef.current = { active: pointerIds.size > 0, pointerIds };
          clickAwayRef.current.active = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (!clickAwayRef.current.active) return;

        const delta = Math.hypot(
          event.clientX - clickAwayRef.current.startX,
          event.clientY - clickAwayRef.current.startY
        );
        clickAwayRef.current.active = false;
        if (delta < 8) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      onWheelCapture={(event) => {
        const viewerApi = viewerApiRef.current;
        if (!viewerApi?.hitTest(event.clientX, event.clientY)) return;
        viewerApi.wheel(event.deltaY);
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerCancelCapture={(event) => {
        const dragState = dragStateRef.current;
        if (dragState.active && dragState.pointerIds.has(event.pointerId)) {
          viewerApiRef.current?.pointerUp(event.pointerId);
          const pointerIds = new Set(dragState.pointerIds);
          pointerIds.delete(event.pointerId);
          dragStateRef.current = { active: pointerIds.size > 0, pointerIds };
        } else if (dragState.active) {
          dragState.pointerIds.forEach((pointerId) => {
            viewerApiRef.current?.pointerUp(pointerId);
          });
          dragStateRef.current = { active: false, pointerIds: new Set<number>() };
        }
        clickAwayRef.current.active = false;
      }}
    >
      <div className="absolute inset-0">
        <div
          ref={containerRef}
          className="pointer-events-none absolute inset-0 z-30"
          aria-label={`3D view of ${card.name}`}
        />

        <div className="pointer-events-none absolute inset-0 z-20 px-3 pb-[calc(0.55rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:py-6">
          <div className="relative mx-auto h-full max-w-[84rem] lg:max-w-[88rem]">
            <div className="pointer-events-none relative flex h-full flex-col justify-end md:grid md:grid-cols-[minmax(19rem,22rem)_minmax(0,1fr)] md:items-center md:gap-5 lg:grid-cols-[minmax(20rem,23rem)_minmax(0,1fr)] lg:gap-6">
              <div className="pointer-events-none mt-4 md:mt-0 md:flex md:items-center">
                <div
                  ref={detailsRef}
                  data-three-details="true"
                  className={`pointer-events-auto mx-auto max-w-lg overscroll-contain rounded-2xl border border-white/14 bg-[#070708] md:mx-0 md:max-h-[calc(100vh-3rem)] md:w-full md:max-w-none md:overflow-y-auto md:rounded-3xl ${
                    compactMobileDetails
                      ? "max-h-none w-full max-w-[min(23rem,calc(100vw-1.5rem))] overflow-visible px-3 py-2.5"
                      : "max-h-[31dvh] overflow-y-auto px-4 py-3 sm:max-h-[36dvh] sm:px-5 sm:py-4"
                  }`}
                  style={{
                    background: "rgba(7,7,8,0.97)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    boxShadow: "0 28px 80px rgba(0,0,0,0.34)",
                    touchAction: "pan-y",
                    overscrollBehavior: "contain",
                  }}
                >
                  <div className="flex min-w-0 items-start justify-between gap-2.5">
                    <div className="min-w-0">
                      <p
                        className={`break-words font-semibold leading-tight text-white ${
                          compactMobileDetails ? "text-[17px]" : "text-xl sm:text-2xl"
                        }`}
                      >
                        {card.name}
                      </p>

                      <div
                        className={`flex flex-wrap gap-x-2.5 gap-y-0.5 text-white/55 ${
                          compactMobileDetails ? "mt-1 text-[11px]" : "mt-2 text-sm"
                        }`}
                      >
                        {card.card_number && <span>#{card.card_number}</span>}
                        {card.supertype && <span>{card.supertype}</span>}
                        {!compactMobileDetails && card.subtypes && <span>{card.subtypes}</span>}
                      </div>
                    </div>

                    {card.rarity && (
                      <span
                        className={`${compactMobileDetails ? "shrink-0 px-2 py-0.5 text-[10px]" : "mt-1 px-2.5 py-1 text-xs"} inline-flex rounded-full font-semibold ${rarityBadgeDark(
                          card.rarity
                        )}`}
                      >
                        {normalizeRarityLabel(card.rarity) ?? card.rarity}
                      </span>
                    )}
                  </div>

                  {activePriceRows.length > 0 && primaryPriceRow && (
                    <div
                      className={`rounded-2xl border border-white/10 bg-white/[0.045] ${
                        compactMobileDetails ? "mt-2.5 p-2" : "mt-4 p-3"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">
                          Current pricing
                        </p>

                        {showTcgSource && (
                          <div className="inline-flex overflow-hidden rounded-full border border-white/10 bg-black/18 p-0.5">
                            {[
                              { key: "cardmarket" as const, label: "CM" },
                              { key: "tcgplayer" as const, label: "TCG" },
                            ].map((source) => (
                              <button
                                key={source.key}
                                type="button"
                                onClick={() => setPriceSource(source.key)}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                  activePriceSource === source.key
                                    ? ACTIVE_SEGMENT_CLASS
                                    : "text-white/52 hover:text-white/82"
                                }`}
                              >
                                {source.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div
                        className={`grid ${
                          compactMobileDetails
                            ? "mt-1.5 grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-1.5"
                            : "mt-3 gap-2"
                        }`}
                      >
                        <div
                          className={`rounded-xl border ${
                            activePriceSource === "tcgplayer"
                              ? "border-blue-400/16 bg-blue-400/[0.1]"
                              : "border-emerald-400/16 bg-emerald-400/[0.1]"
                          } ${compactMobileDetails ? "px-2.5 py-2" : "px-3 py-2.5"}`}
                        >
                          <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">
                            {activePriceSource === "tcgplayer" ? "TCGPlayer" : "CardMarket"}
                          </span>
                          <span
                            className={`mt-1 block truncate font-semibold tabular-nums text-white ${
                              compactMobileDetails ? "text-base" : "text-xl"
                            }`}
                          >
                            {formatCurrency(primaryPriceRow.value, primaryPriceRow.currency)}
                          </span>
                        </div>

                        <div className="grid gap-1.5">
                          {compactSecondaryPriceRows.length > 0 ? (
                            compactSecondaryPriceRows.map(({ label, value, currency }) => (
                              <div
                                key={label}
                                className={`flex items-center justify-between gap-2 rounded-xl bg-white/8 ${
                                  compactMobileDetails
                                    ? "px-2 py-1.5 text-[11px]"
                                    : "px-3 py-2 text-sm"
                                }`}
                              >
                                <span className="truncate text-white/52">{label}</span>
                                <span className="shrink-0 font-semibold tabular-nums text-white">
                                  {formatCurrency(value, currency)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div
                              className={`rounded-xl bg-white/8 text-white/45 ${
                                compactMobileDetails ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-sm"
                              }`}
                            >
                              No extra prices
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {(hasCardMarketGradedPricing || hasEbayGradedPricing) && (
                    <div
                      className={`rounded-2xl border border-white/10 bg-white/[0.04] ${
                        compactMobileDetails ? "mt-2 p-2" : "mt-4 p-3"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">
                          Graded pricing
                        </p>

                        {showGradedSourceToggle ? (
                          <div className="inline-flex overflow-hidden rounded-full border border-white/10 bg-black/18 p-0.5">
                            {[
                              { key: "cardmarket" as const, label: "CM" },
                              { key: "ebay" as const, label: "eBay" },
                            ].map((source) => (
                              <button
                                key={source.key}
                                type="button"
                                onClick={() => setGradedSource(source.key)}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                  effectiveGradedSource === source.key
                                    ? ACTIVE_SEGMENT_CLASS
                                    : "text-white/52 hover:text-white/82"
                                }`}
                              >
                                {source.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/48">
                            {effectiveGradedSource === "ebay" ? "eBay" : "CM"}
                          </span>
                        )}
                      </div>

                      <div
                        className={`mt-1.5 grid gap-1.5 ${
                          compactMobileDetails
                            ? "grid-cols-[minmax(0,1fr)_auto]"
                            : "sm:grid-cols-[minmax(0,1fr)_auto]"
                        }`}
                      >
                        {effectiveGradedSource === "cardmarket" ? (
                          <>
                            {gradedPriceRows.length > 1 ? (
                              <select
                                value={selectedGradedPrice?.label ?? ""}
                                onChange={(event) => setSelectedGradedLabel(event.target.value)}
                                className={`min-w-0 rounded-xl border border-white/10 bg-white/[0.06] font-semibold text-white outline-none focus:border-white/24 ${
                                  compactMobileDetails
                                    ? "px-2 py-1.5 text-[11px]"
                                    : "px-3 py-2 text-sm"
                                }`}
                              >
                                {gradedPriceRows.map((gradedPrice) => (
                                  <option
                                    key={gradedPrice.label}
                                    value={gradedPrice.label}
                                    className="bg-[#111214] text-white"
                                  >
                                    {gradedPrice.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div
                                className={`min-w-0 truncate rounded-xl border border-violet-400/16 bg-violet-400/[0.08] font-semibold text-white/78 ${
                                  compactMobileDetails
                                    ? "px-2 py-1.5 text-[11px]"
                                    : "px-3 py-2 text-sm"
                                }`}
                              >
                                {selectedGradedPrice?.label ?? "Graded"}
                              </div>
                            )}

                            <div
                              className={`shrink-0 rounded-xl border border-violet-400/16 bg-violet-400/[0.08] text-right ${
                                compactMobileDetails ? "px-2 py-1.5" : "px-3 py-2"
                              }`}
                            >
                              <span
                                className={`block font-semibold tabular-nums text-white ${
                                  compactMobileDetails ? "text-[13px]" : "text-base"
                                }`}
                              >
                                {formatCurrency(selectedGradedPrice?.price ?? null, "EUR")}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            {ebaySoldGradedPriceRows.length > 1 ? (
                              <select
                                value={selectedEbaySoldGradedPrice?.label ?? ""}
                                onChange={(event) =>
                                  setSelectedEbaySoldGradedLabel(event.target.value)
                                }
                                className={`min-w-0 rounded-xl border border-white/10 bg-white/[0.06] font-semibold text-white outline-none focus:border-white/24 ${
                                  compactMobileDetails
                                    ? "px-2 py-1.5 text-[11px]"
                                    : "px-3 py-2 text-sm"
                                }`}
                              >
                                {ebaySoldGradedPriceRows.map((gradedPrice) => (
                                  <option
                                    key={gradedPrice.label}
                                    value={gradedPrice.label}
                                    className="bg-[#111214] text-white"
                                  >
                                    {gradedPrice.label}
                                    {gradedPrice.sample_size != null
                                      ? ` (${gradedPrice.sample_size})`
                                      : ""}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div
                                className={`min-w-0 truncate rounded-xl border border-sky-400/16 bg-sky-400/[0.08] font-semibold text-white/78 ${
                                  compactMobileDetails
                                    ? "px-2 py-1.5 text-[11px]"
                                    : "px-3 py-2 text-sm"
                                }`}
                              >
                                {selectedEbaySoldGradedPrice?.label ?? "eBay"}
                              </div>
                            )}

                            <div
                              className={`shrink-0 rounded-xl border border-sky-400/16 bg-sky-400/[0.08] text-right ${
                                compactMobileDetails ? "px-2 py-1.5" : "px-3 py-2"
                              }`}
                            >
                              <span
                                className={`block font-semibold tabular-nums text-white ${
                                  compactMobileDetails ? "text-[13px]" : "text-base"
                                }`}
                              >
                                {formatCurrency(
                                  selectedEbaySoldDisplayPrice,
                                  selectedEbaySoldDisplayCurrency
                                )}
                              </span>
                              {!compactMobileDetails && selectedEbaySoldMetaLabel && (
                                <span className="mt-0.5 block text-[11px] font-medium text-white/45">
                                  {selectedEbaySoldMetaLabel}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {!compactMobileDetails && (
                    <PriceRefreshCountdown
                      rarity={card.rarity}
                      priceFetchedAt={card.price_fetched_at}
                      priceSourceStatus={card.price_source_status}
                      priceSourceCheckedAt={card.price_source_checked_at}
                      className="mt-4"
                    />
                  )}

                  {!compactMobileDetails && card.artist && (
                    <p className="mt-2 text-sm text-white/44">
                      Illus.{" "}
                      <IllustratorLink
                        artist={card.artist}
                        className="text-white/72 transition-colors hover:text-white hover:underline underline-offset-2"
                      />
                    </p>
                  )}

                  <div
                    className={`grid gap-2 ${
                      compactMobileDetails
                        ? `mt-2 ${filteredCardMarketUrl ? "grid-cols-2" : "grid-cols-1"}`
                        : `mt-4 ${filteredCardMarketUrl ? "sm:grid-cols-2" : ""}`
                    }`}
                  >
                    {filteredCardMarketUrl && (
                      <a
                        href={filteredCardMarketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex w-full items-center justify-center bg-blue-600 text-center font-semibold text-white transition-colors hover:bg-blue-500 ${
                          compactMobileDetails
                            ? "rounded-xl px-3 py-2 text-[13px]"
                            : "rounded-2xl px-4 py-3"
                        }`}
                      >
                        CardMarket
                      </a>
                    )}
                    <CollectionAddCardButton
                      card={{
                        id: card.id,
                        name: card.name,
                        image_url: frontImageUrl,
                        episode: {
                          id: card.episode_id,
                          name: card.episode_name ?? "Set",
                          code: card.episode_code ?? null,
                        },
                      }}
                      mode="button"
                      theme="dark"
                      label="Add"
                      className={`w-full border-emerald-400/20 bg-emerald-600 text-white hover:border-emerald-300/40 hover:bg-emerald-500 ${
                        compactMobileDetails
                          ? "min-h-0 rounded-xl px-3 py-2 text-[13px]"
                          : "rounded-2xl px-4 py-3"
                      }`}
                    />
                  </div>

                  {!compactMobileDetails && (
                    <p className="mt-4 text-sm text-white/55">
                      Drag to rotate. Pinch or scroll to zoom.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 flex items-center gap-2 sm:right-6 sm:top-6">
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            clickAwayRef.current.active = false;
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            event.stopPropagation();
            clickAwayRef.current.active = false;
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            controlsRef.current?.reset();
          }}
          data-viewer-keepopen="true"
          className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/14 bg-black/45 text-white/85 backdrop-blur-xl transition-colors hover:bg-black/60 max-[640px]:h-10 max-[640px]:w-10"
          aria-label="Reset 3D view"
          title="Reset view"
        >
          <RotateCcw className="h-5 w-5 max-[640px]:h-4 max-[640px]:w-4" />
        </button>

        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            clickAwayRef.current.active = false;
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            event.stopPropagation();
            clickAwayRef.current.active = false;
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
          data-viewer-keepopen="true"
          className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/14 bg-black/45 text-white/85 backdrop-blur-xl transition-colors hover:bg-black/60"
          aria-label="Close 3D view"
          title="Close 3D view"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {!isReady && !hasError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full border border-white/12 bg-black/45 px-5 py-2 text-sm font-medium text-white/80 backdrop-blur-xl">
            Loading 3D view...
          </div>
        </div>
      )}

      {hasError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm rounded-3xl border border-white/12 bg-black/55 px-5 py-4 text-center backdrop-blur-xl">
            <p className="text-lg font-semibold text-white">3D view unavailable</p>
            <p className="mt-2 text-sm text-white/55">This card image could not be loaded as a texture.</p>
          </div>
        </div>
      )}
    </div>
  );
}
