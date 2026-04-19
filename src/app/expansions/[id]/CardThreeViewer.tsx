"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import PriceRefreshCountdown from "@/components/PriceRefreshCountdown";
import IllustratorLink from "@/components/IllustratorLink";
import { withCardMarketFilters } from "@/lib/cardmarket";
import { normalizeRarityLabel } from "@/lib/rarity";

type CurrencyCode = "EUR" | "USD";

interface ViewerCard {
  name: string;
  card_number: string | null;
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
}

interface Props {
  card: ViewerCard;
  frontImageUrl: string;
  cardMarketUrl: string | null;
  onClose: () => void;
}

const CARD_WIDTH = 2.5;
const CARD_HEIGHT = (CARD_WIDTH * 88) / 63;
const CARD_DEPTH = 0.018;
const CARD_CORNER_RADIUS = 0.078;
const CARD_FACE_OFFSET = 0.0009;
const CARD_FRONT_TEXTURE_INSET = 0;
const CARD_FRONT_TEXTURE_BLEED = 0.02;
const CARD_BACK_TEXTURE_INSET = 0.02;
const CARD_BACK_URL = "/assets/pokemon-card-back.jpg";
const CARD_PAPER_COLOR = "#ece7df";
const CARD_BOUNDING_RADIUS = Math.sqrt(
  (CARD_WIDTH / 2) ** 2 + (CARD_HEIGHT / 2) ** 2 + (CARD_DEPTH / 2) ** 2
);
const DEFAULT_CAMERA_DISTANCE = 8.55;
const MIN_CAMERA_DISTANCE = 4.4;
const MAX_CAMERA_DISTANCE = 10.8;

function formatCurrency(value: number | null | undefined, currency: CurrencyCode = "EUR"): string {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function rarityBadge(rarity: string | null): string {
  const map: Record<string, string> = {
    Common: "bg-white/8 text-white/58",
    Uncommon: "bg-emerald-500/14 text-emerald-300",
    Rare: "bg-blue-500/16 text-blue-300",
    "Rare Holo": "bg-fuchsia-500/16 text-fuchsia-300",
    "Rare Ultra": "bg-amber-500/16 text-amber-300",
    "Ultra Rare": "bg-orange-500/16 text-orange-300",
    "Secret Rare": "bg-rose-500/16 text-rose-300",
    "Amazing Rare": "bg-cyan-500/16 text-cyan-300",
    Promo: "bg-orange-500/16 text-orange-300",
    "Radiant Rare": "bg-yellow-500/16 text-yellow-300",
    "ACE SPEC Rare": "bg-indigo-500/16 text-indigo-300",
    "Double Rare": "bg-sky-500/16 text-sky-300",
    "Illustration Rare": "bg-teal-500/16 text-teal-300",
    "Special Illustration Rare": "bg-pink-500/16 text-pink-300",
    "Hyper Rare": "bg-yellow-500/16 text-yellow-300",
    "Shiny Rare": "bg-lime-500/16 text-lime-300",
    "Shiny Ultra Rare": "bg-green-500/16 text-green-300",
    "Rare Rainbow": "bg-fuchsia-500/16 text-fuchsia-300",
    "Rare Holo EX": "bg-red-500/16 text-red-300",
    "Rare Holo V": "bg-violet-500/16 text-violet-300",
    "Rare Holo GX": "bg-purple-500/16 text-purple-300",
    "Trainer Gallery Rare Holo": "bg-pink-500/16 text-pink-300",
    "Rare Holo LV.X": "bg-sky-500/16 text-sky-300",
    "Rare Holo VSTAR": "bg-yellow-500/16 text-yellow-300",
    "Rare Shiny": "bg-lime-500/16 text-lime-300",
    "Rare Shiny GX": "bg-emerald-500/16 text-emerald-300",
    "Rare BREAK": "bg-orange-500/16 text-orange-300",
    "Rare Prism Star": "bg-cyan-500/16 text-cyan-300",
    "Rare Prime": "bg-teal-500/16 text-teal-300",
    "Classic Collection": "bg-slate-500/16 text-slate-300",
    "Rare Holo Star": "bg-amber-500/16 text-amber-300",
    LEGEND: "bg-stone-500/16 text-stone-300",
    "Rare Shining": "bg-yellow-500/16 text-yellow-300",
    "Rare ACE": "bg-indigo-500/16 text-indigo-300",
    "Art Rare": "bg-teal-500/16 text-teal-300",
    "Special Art Rare": "bg-pink-500/16 text-pink-300",
    "Mega Hyper Rare": "bg-fuchsia-500/16 text-fuchsia-300",
    "Black White Rare": "bg-slate-500/16 text-slate-300",
  };

  return map[normalizeRarityLabel(rarity) ?? ""] ?? "bg-white/8 text-white/58";
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
        vec3 artSampleX = sampleCard(vUv + vec2(uTexelSize.x * 4.0, 0.0));
        vec3 artSampleY = sampleCard(vUv + vec2(0.0, uTexelSize.y * 4.0));
        vec3 artSampleDiag = sampleCard(vUv + uTexelSize * vec2(3.0, -3.0));
        float artLuma = dot(artColor, vec3(0.299, 0.587, 0.114));
        float artMax = max(max(artColor.r, artColor.g), artColor.b);
        float artMin = min(min(artColor.r, artColor.g), artColor.b);
        float artSaturation = artMax - artMin;
        float artDetail = clamp(
          (length(artColor - artSampleX) + length(artColor - artSampleY) + length(artColor - artSampleDiag)) * 1.9,
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
        float foilMask = clamp(
          0.08 + artSaturation * 0.4 + artDetail * 0.65 + gradientStrength * 0.45 + (1.0 - artLuma) * 0.04,
          0.0,
          1.0
        );

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
              cursorHighlight * 0.12,
            0.0,
            1.0
          )
        );
        vec3 baseFoil =
          silverColor *
          clamp(
            0.1 +
              fresnel * 0.14 +
              tiltSweep * 0.08 +
              secondarySweep * 0.06 +
              artSweep * 0.34 +
              artSpecular * 0.52 +
              microSpecular * 0.34 +
              cursorSoft * 0.1,
            0.0,
            1.0
          ) *
          foilMask *
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
            (0.03 +
              fresnel * 0.06 +
              artSweep * 0.12 +
              artSpecular * 0.18 +
              microSpecular * 0.12 +
              cursorHighlight * 0.06 +
              grazingHighlight * 0.16) *
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
              (0.12 + artSaturation * 0.42 + artDetail * 0.48 + gradientStrength * 0.28 + artSpecular * 0.3) *
              (rainbowSweep * 0.78 + prismBand * 0.34 + cursorSoft * 0.12),
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
          color = screenBlend(color, rainbowBlend * 1.16);
          color = mix(color, colorDodgeBlend(color, rainbowBlend * 1.08), 0.58);
          alpha += prismMask * 0.34;
        }

        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.72));
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
  const x = -width / 2;
  const y = -height / 2;
  const w = width;
  const h = height;
  const r = Math.min(radius, width / 2, height / 2);

  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);

  return shape;
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

function getSafeCameraDistance(camera: import("three").PerspectiveCamera) {
  const verticalHalfFov = (camera.fov * Math.PI) / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(camera.aspect, 0.01));
  const limitingHalfFov = Math.max(Math.min(verticalHalfFov, horizontalHalfFov), 0.01);
  return (CARD_BOUNDING_RADIUS / Math.sin(limitingHalfFov)) * 1.08;
}

function getBaseFramingOffset(viewportWidth: number) {
  if (viewportWidth >= 1536) return 0.78;
  if (viewportWidth >= 1280) return 0.68;
  if (viewportWidth >= 1024) return 0.5;
  if (viewportWidth >= 768) return 0.22;
  return 0;
}

function getFramingOffset(viewportWidth: number, cameraDistance: number) {
  const baseOffset = getBaseFramingOffset(viewportWidth);
  if (baseOffset === 0) return 0;

  const minOffset = 0;
  const zoomRange = Math.max(DEFAULT_CAMERA_DISTANCE - MIN_CAMERA_DISTANCE, 0.001);
  const zoomProgress = clamp(
    (DEFAULT_CAMERA_DISTANCE - cameraDistance) / zoomRange,
    0,
    1
  );

  return baseOffset + (minOffset - baseOffset) * zoomProgress;
}

export default function CardThreeViewer({ card, frontImageUrl, cardMarketUrl, onClose }: Props) {
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
  const dragStateRef = useRef<{ active: boolean; pointerId: number | null }>({
    active: false,
    pointerId: null,
  });
  const clickAwayRef = useRef({ active: false, startX: 0, startY: 0 });
  const initialRotationRef = useRef({ x: -0.21, y: -0.72, z: 0 });
  const autoRotateRef = useRef(true);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const filteredCardMarketUrl = cardMarketUrl ? withCardMarketFilters(cardMarketUrl) : null;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const rootElement = rootRef.current;
    const renderHostElement = containerRef.current;
    if (!renderHostElement) return;
    const renderHost: HTMLDivElement = renderHostElement;
    const host: HTMLDivElement = renderHostElement;

    setIsReady(false);
    setHasError(false);
    autoRotateRef.current = true;
    viewerApiRef.current = null;
    dragStateRef.current = { active: false, pointerId: null };

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
                resolve(texture);
              },
              undefined,
              reject
            );
          });

        const [loadedFrontTexture, backTexture] = await Promise.all([
          loadTexture(frontImageUrl),
          loadTexture(CARD_BACK_URL),
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
        const cardGroup = new THREE.Group();
        const cameraTarget = new THREE.Vector3();
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

        cardGroup.add(edgeMesh, frontMesh, holoMesh, backMesh);
        cardGroup.rotation.set(
          initialRotationRef.current.x,
          initialRotationRef.current.y,
          initialRotationRef.current.z
        );
        scene.add(cardGroup);

        const targetRotation = { ...initialRotationRef.current };
        const getResetCameraDistance = () =>
          Math.max(DEFAULT_CAMERA_DISTANCE, getSafeCameraDistance(camera));

        let targetCameraDistance = getResetCameraDistance();
        const activePointers = new Map<number, { x: number; y: number }>();
        let pinchStartDistance: number | null = null;
        let pinchStartCameraDistance = targetCameraDistance;
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const pickTargets: import("three").Object3D[] = [edgeMesh, frontMesh, backMesh];
        const pointerTargetUv = new THREE.Vector2(0.5, 0.5);
        let pointerTargetStrength = 0;

        const applyCameraConstraints = () => {
          targetCameraDistance = clamp(targetCameraDistance, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
          camera.position.z = clamp(camera.position.z, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
          return MIN_CAMERA_DISTANCE;
        };

        const updateFraming = () => {
          const offsetX = getFramingOffset(host.clientWidth, camera.position.z);
          cardGroup.position.x = offsetX;
          cameraTarget.set(offsetX, 0, 0);
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
          return raycaster.intersectObjects(pickTargets, false)[0] ?? null;
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
          cardGroup.position.x +=
            (getFramingOffset(host.clientWidth, camera.position.z) - cardGroup.position.x) * 0.18;
          cameraTarget.set(cardGroup.position.x, 0, 0);
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
  }, [frontImageUrl, card.rarity]);

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

  function isPersistentUiTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false;
    if (detailsRef.current?.contains(target)) return true;
    return target instanceof Element && target.closest("[data-viewer-keepopen='true']") != null;
  }

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md"
      onPointerDownCapture={(event) => {
        const viewerApi = viewerApiRef.current;
        const hitCard = viewerApi?.hitTest(event.clientX, event.clientY) ?? false;
        if (hitCard) {
          clickAwayRef.current.active = false;
          dragStateRef.current = { active: true, pointerId: event.pointerId };
          viewerApi?.pointerDown(event.pointerId, event.clientX, event.clientY);
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (isPersistentUiTarget(event.target)) {
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
        if (!dragState.active || dragState.pointerId !== event.pointerId) return;
        viewerApiRef.current?.pointerMove(event.pointerId, event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerUpCapture={(event) => {
        const dragState = dragStateRef.current;
        if (dragState.active && dragState.pointerId === event.pointerId) {
          viewerApiRef.current?.pointerUp(event.pointerId);
          dragStateRef.current = { active: false, pointerId: null };
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
      onPointerCancelCapture={() => {
        const dragState = dragStateRef.current;
        if (dragState.active && dragState.pointerId != null) {
          viewerApiRef.current?.pointerUp(dragState.pointerId);
        }
        dragStateRef.current = { active: false, pointerId: null };
        clickAwayRef.current.active = false;
      }}
    >
      <div className="absolute inset-0">
        <div
          ref={containerRef}
          className="pointer-events-none absolute inset-0 z-30"
          aria-label={`3D view of ${card.name}`}
        />

        <div className="pointer-events-none absolute inset-0 z-20 px-4 py-4 sm:px-6 sm:py-6">
          <div className="relative mx-auto h-full max-w-[84rem] lg:max-w-[88rem]">
            <div className="pointer-events-none relative flex h-full flex-col justify-end md:grid md:grid-cols-[minmax(19rem,22rem)_minmax(0,1fr)] md:items-center md:gap-5 lg:grid-cols-[minmax(20rem,23rem)_minmax(0,1fr)] lg:gap-6">
              <div className="pointer-events-none mt-4 md:mt-0 md:flex md:items-center">
                <div
                  ref={detailsRef}
                  className="pointer-events-auto mx-auto max-w-lg rounded-3xl border border-white/14 bg-transparent px-5 py-4 backdrop-blur-xl md:mx-0 md:w-full md:max-w-none md:max-h-[calc(100vh-3rem)] md:overflow-y-auto"
                  style={{
                    background: "rgba(12,12,14,0.68)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    boxShadow: "0 28px 80px rgba(0,0,0,0.34)",
                  }}
                >
                  <p className="text-2xl font-semibold text-white">{card.name}</p>

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/55">
                    {card.card_number && <span>#{card.card_number}</span>}
                    {card.supertype && <span>{card.supertype}</span>}
                    {card.subtypes && <span>{card.subtypes}</span>}
                    {card.hp && <span>HP {card.hp}</span>}
                  </div>

                  {card.rarity && (
                    <span
                      className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${rarityBadge(
                        card.rarity
                      )}`}
                    >
                      {normalizeRarityLabel(card.rarity) ?? card.rarity}
                    </span>
                  )}

                  {(cardMarketPriceRows.length > 0 || tcgPriceRows.length > 0) && (
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="flex flex-col gap-2">
                        {cardMarketPriceRows.map(({ label, value, currency }) => (
                          <div
                            key={label}
                            className="flex items-center justify-between rounded-2xl bg-white/8 px-3 py-2"
                          >
                            <span className="text-white/52">{label}</span>
                            <span className="font-semibold tabular-nums text-white">
                              {formatCurrency(value, currency)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-col gap-2">
                        {tcgPriceRows.map(({ label, value, currency }) => (
                          <div
                            key={label}
                            className="flex items-center justify-between rounded-2xl bg-white/8 px-3 py-2"
                          >
                            <span className="text-white/52">{label}</span>
                            <span className="font-semibold tabular-nums text-white">
                              {formatCurrency(value, currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <PriceRefreshCountdown
                    rarity={card.rarity}
                    priceFetchedAt={card.price_fetched_at}
                    priceSourceStatus={card.price_source_status}
                    priceSourceCheckedAt={card.price_source_checked_at}
                    className="mt-4"
                  />

                  {card.artist && (
                    <p className="mt-2 text-sm text-white/44">
                      Illus.{" "}
                      <IllustratorLink
                        artist={card.artist}
                        className="text-white/72 transition-colors hover:text-white hover:underline underline-offset-2"
                      />
                    </p>
                  )}

                  {filteredCardMarketUrl && (
                    <a
                      href={filteredCardMarketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-blue-500"
                    >
                      Open CardMarket
                    </a>
                  )}

                  <p className="mt-4 text-sm text-white/55">Drag to rotate. Pinch or scroll to zoom.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between p-4 sm:p-6">
        <button
          type="button"
          onClick={onClose}
          data-viewer-keepopen="true"
          className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/14 bg-black/45 text-white/85 backdrop-blur-xl transition-colors hover:bg-black/60"
          aria-label="Close 3D view"
        >
          <X className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => controlsRef.current?.reset()}
          data-viewer-keepopen="true"
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/14 bg-black/45 px-4 py-2 text-sm font-medium text-white/85 backdrop-blur-xl transition-colors hover:bg-black/60"
        >
          <RotateCcw className="h-4 w-4" />
          Reset view
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
