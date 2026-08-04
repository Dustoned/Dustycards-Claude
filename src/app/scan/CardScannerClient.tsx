"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Aperture,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Flashlight,
  ImagePlus,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  RefreshCcw,
  ScanLine,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CachedImage from "@/components/CachedImage";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import CollectionWantButton from "@/components/CollectionWantButton";
import { useSettings } from "@/components/SettingsProvider";
import type { ModalCardData } from "@/components/card-modal/types";
import type {
  CardScannerField,
  CardScannerFieldResponse,
  CardScannerMatch,
  CardScannerResponse,
} from "@/lib/card-scanner";
import {
  getScannerFieldCaptureBounds,
  getScannerFieldCaptureBands,
  getScannerFieldScanRegion,
  getScannerFrameDifference,
  getScannerObjectCoverSourceRect,
  measureScannerFrame,
  rgbaToScannerGrayscale,
} from "@/lib/card-scanner-frame";
import { formatCurrency } from "@/lib/format";
import {
  getGameLabel,
  normalizeTradingCardGame,
  ONE_PIECE_GAME,
  POKEMON_GAME,
  type TradingCardGame,
} from "@/lib/games";

const CardModal = dynamic(() => import("@/components/CardModal"), {
  ssr: false,
  loading: () => null,
});

type ScannerStage =
  | "ready"
  | "camera"
  | "preview"
  | "analyzing"
  | "results"
  | "empty"
  | "error";

const ANALYSIS_STEPS = [
  "Reading card details",
  "Matching set and card number",
  "Comparing artwork",
] as const;
const CARD_ASPECT = 63 / 88;

type ScannedCard = {
  key: string;
  match: CardScannerMatch;
};

type BackgroundScanJob = {
  id: string;
  status: "reading" | "review" | "failed";
  matches: CardScannerMatch[];
  detectedText: string | null;
  detectedReferences: string[];
  processingMs: number | null;
  error: string | null;
};

type ObservedScannerPoint = {
  value: string;
  confidence: number | null;
};

type ObservedScannerIdentity = {
  name: ObservedScannerPoint | null;
  number: ObservedScannerPoint | null;
  attack: ObservedScannerPoint | null;
};

type PendingScannerPoint = ObservedScannerPoint & {
  confirmations: number;
  lastSeenAt: number;
};

type PendingScannerIdentity = Partial<
  Record<CardScannerField, PendingScannerPoint>
>;

const EMPTY_OBSERVED_IDENTITY: ObservedScannerIdentity = {
  name: null,
  number: null,
  attack: null,
};
const EMPTY_PENDING_IDENTITY: PendingScannerIdentity = {};
// Naam + nummer identificeren de druk volledig. Attack-tekst kan server-side
// pas gelezen worden nadat beide al bekend zijn en hield de handsfree flow
// alleen maar op — de kaart wordt gepakt zodra deze twee punten vaststaan.
const ACTIVE_SCANNER_FIELDS: CardScannerField[] = ["name", "number"];

function nextScannerField(field: CardScannerField): CardScannerField {
  const fields = ACTIVE_SCANNER_FIELDS;
  return fields[(fields.indexOf(field) + 1) % fields.length];
}

type ScannerMediaTrackCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  focusMode?: string[];
};

type ScannerCameraConstraintSet = MediaTrackConstraintSet & {
  torch?: boolean;
  focusMode?: "continuous";
};

async function applyScannerCameraTuning(
  videoTrack: MediaStreamTrack,
  options: { torch?: boolean } = {}
) {
  const capabilities = videoTrack.getCapabilities?.() as
    | ScannerMediaTrackCapabilities
    | undefined;
  const advanced: ScannerCameraConstraintSet = {};
  if (capabilities?.focusMode?.includes("continuous")) {
    advanced.focusMode = "continuous";
  }
  if (typeof options.torch === "boolean" && capabilities?.torch) {
    advanced.torch = options.torch;
  }
  if (Object.keys(advanced).length === 0) return;

  // applyConstraints replaces omitted constraints with their defaults. Keep
  // the high-resolution camera request while applying focus/torch tuning;
  // otherwise some mobile browsers silently fall back to a low-resolution
  // stream immediately after the camera opens.
  const current = videoTrack.getConstraints();
  await videoTrack.applyConstraints({
    ...current,
    advanced: [advanced],
  });
}

function confidenceLabel(match: CardScannerMatch): string {
  if (match.confidence === "high") return "High confidence";
  if (match.confidence === "medium") return "Check this match";
  return "Possible match";
}

function confidenceClasses(match: CardScannerMatch): string {
  if (match.confidence === "high") {
    return "border-[rgb(var(--dc-success-rgb)/0.3)] bg-[rgb(var(--dc-success-rgb)/0.1)] text-[var(--dc-success-hover)]";
  }
  if (match.confidence === "medium") {
    return "border-amber-300/25 bg-amber-400/10 text-amber-200";
  }
  return "border-[rgb(var(--dc-border-rgb)/0.95)] bg-[rgb(var(--dc-surface-hover-rgb)/0.7)] text-[var(--dc-text-muted)]";
}

function cardRef(match: CardScannerMatch): {
  id: string;
  name: string;
  image_url: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
} {
  return {
    id: match.id,
    name: match.name,
    image_url: match.image_url,
    episode: match.episode,
  };
}

async function canvasToJpegFile(
  canvas: HTMLCanvasElement,
  quality = 0.92
): Promise<File> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Photo capture failed."))),
      "image/jpeg",
      quality
    );
  });
  return new File([blob], `dustycards-scan-${Date.now()}.jpg`, {
    type: "image/jpeg",
  });
}

function drawCentralCardCrop(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth = 900,
  cardSourceRect?: ReturnType<typeof getCentralCardSourceRect>
) {
  const sourceRect =
    cardSourceRect ?? getCentralCardSourceRect(sourceWidth, sourceHeight);

  canvas.width = outputWidth;
  canvas.height = Math.round(outputWidth / CARD_ASPECT);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Photo capture is unavailable.");
  context.drawImage(
    source,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
    0,
    0,
    canvas.width,
    canvas.height
  );
}

function getCentralCardSourceRect(sourceWidth: number, sourceHeight: number) {
  let sourceX = 0;
  let sourceY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  const sourceAspect = sourceWidth / sourceHeight;

  if (sourceAspect > CARD_ASPECT) {
    cropWidth = sourceHeight * CARD_ASPECT;
    sourceX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / CARD_ASPECT;
    sourceY = (sourceHeight - cropHeight) / 2;
  }

  return {
    x: sourceX,
    y: sourceY,
    width: cropWidth,
    height: cropHeight,
  };
}

function getCameraFrameSourceRect(
  video: HTMLVideoElement,
  cardFrame: HTMLElement | null
) {
  if (!cardFrame || !video.videoWidth || !video.videoHeight) {
    return getCentralCardSourceRect(video.videoWidth, video.videoHeight);
  }
  const videoRect = video.getBoundingClientRect();
  const frameRect = cardFrame.getBoundingClientRect();
  if (
    videoRect.width <= 0 ||
    videoRect.height <= 0 ||
    frameRect.width <= 0 ||
    frameRect.height <= 0
  ) {
    return getCentralCardSourceRect(video.videoWidth, video.videoHeight);
  }

  // OCR and the collector now look at precisely the same visible outline.
  return getScannerObjectCoverSourceRect({
    sourceWidth: video.videoWidth,
    sourceHeight: video.videoHeight,
    viewport: {
      x: videoRect.left,
      y: videoRect.top,
      width: videoRect.width,
      height: videoRect.height,
    },
    frame: {
      x: frameRect.left,
      y: frameRect.top,
      width: frameRect.width,
      height: frameRect.height,
    },
  });
}

function drawScannerFieldBands(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  field: CardScannerField,
  cardSourceRect?: ReturnType<typeof getCentralCardSourceRect>,
  preferFocus = false
) {
  const card =
    cardSourceRect ?? getCentralCardSourceRect(sourceWidth, sourceHeight);
  const boundsList = getScannerFieldCaptureBands(
    field,
    preferFocus ? "focus" : "expected"
  );
  const outputWidth = field === "attack" ? 1_280 : 1_440;
  const gap = boundsList.length > 1 ? 24 : 0;
  const outputHeights = boundsList.map((bounds) => {
    const cropWidth = card.width * bounds.width;
    const cropHeight = card.height * bounds.height;
    return Math.max(
      240,
      Math.min(820, Math.round((outputWidth * cropHeight) / cropWidth))
    );
  });
  canvas.width = outputWidth;
  canvas.height =
    outputHeights.reduce((total, height) => total + height, 0) +
    gap * Math.max(0, boundsList.length - 1);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Camera reading is unavailable.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  let outputY = 0;
  boundsList.forEach((bounds, index) => {
    const cropWidth = card.width * bounds.width;
    const cropHeight = card.height * bounds.height;
    context.drawImage(
      source,
      card.x + card.width * bounds.left,
      card.y + card.height * bounds.top,
      cropWidth,
      cropHeight,
      0,
      outputY,
      canvas.width,
      outputHeights[index]
    );
    outputY += outputHeights[index] + gap;
  });
}

function ScannerArtwork({
  match,
  sizes,
  priority = false,
}: {
  match: CardScannerMatch;
  sizes: string;
  priority?: boolean;
}) {
  return (
    <div className="relative aspect-[63/88] overflow-hidden rounded-[5%] bg-[rgb(var(--dc-surface-hover-rgb)/0.55)] shadow-[0_18px_38px_rgba(0,0,0,0.32)]">
      {match.image_url ? (
        <CachedImage
          sourceUrl={match.image_url}
          alt={match.name}
          fill
          sizes={sizes}
          priority={priority}
          className="object-fill"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-2xl font-black text-[var(--dc-text-disabled)]">
          {match.name.slice(0, 2)}
        </div>
      )}
    </div>
  );
}

export default function CardScannerClient() {
  const searchParams = useSearchParams();
  const openingSessionId = searchParams.get("openingSession");
  const { settings } = useSettings();
  const initialGame = normalizeTradingCardGame(searchParams.get("game"));
  const [game, setGame] = useState<TradingCardGame>(
    initialGame === ONE_PIECE_GAME && settings.onePieceLibraryEnabled
      ? ONE_PIECE_GAME
      : POKEMON_GAME
  );
  const [stage, setStage] = useState<ScannerStage>("ready");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [matches, setMatches] = useState<CardScannerMatch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detectedText, setDetectedText] = useState<string | null>(null);
  const [detectedReferences, setDetectedReferences] = useState<string[]>([]);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [processingMs, setProcessingMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraSupported, setCameraSupported] = useState(false);
  const [cameraSessionActive, setCameraSessionActive] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);
  const [scanJobs, setScanJobs] = useState<BackgroundScanJob[]>([]);
  const [activeReviewJobId, setActiveReviewJobId] = useState<string | null>(null);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [observedIdentity, setObservedIdentity] =
    useState<ObservedScannerIdentity>(EMPTY_OBSERVED_IDENTITY);
  const [pendingIdentity, setPendingIdentity] =
    useState<PendingScannerIdentity>(EMPTY_PENDING_IDENTITY);
  const [activeField, setActiveField] = useState<CardScannerField | null>(null);
  const [focusField, setFocusField] = useState<CardScannerField | null>(null);
  const [lastAutoMatch, setLastAutoMatch] = useState<CardScannerMatch | null>(null);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [openingCardId, setOpeningCardId] = useState<string | null>(null);
  const [selectedModalCard, setSelectedModalCard] = useState<ModalCardData | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardFrameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readinessCanvasRef = useRef<HTMLCanvasElement>(null);
  const fieldCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const fieldControllerRef = useRef<AbortController | null>(null);
  const backgroundControllersRef = useRef(new Map<string, AbortController>());
  const previousFrameRef = useRef<Uint8Array | null>(null);
  const currentFrameRef = useRef<Uint8Array | null>(null);
  const capturedFrameRef = useRef<Uint8Array | null>(null);
  const readyFrameStreakRef = useRef(0);
  const changedFrameStreakRef = useRef(0);
  const autoCaptureArmedRef = useRef(true);
  const captureInProgressRef = useRef(false);
  const autoCaptureActionRef = useRef<() => void>(() => undefined);
  const fieldReadActionRef = useRef<(field: CardScannerField) => void>(
    () => undefined
  );
  const observedIdentityRef = useRef<ObservedScannerIdentity>(
    EMPTY_OBSERVED_IDENTITY
  );
  const pendingIdentityRef = useRef<PendingScannerIdentity>(
    EMPTY_PENDING_IDENTITY
  );
  const focusFieldRef = useRef<CardScannerField | null>(null);
  const fieldInProgressRef = useRef(false);
  const fieldCooldownUntilRef = useRef(0);
  const nextFieldRef = useRef<CardScannerField>("name");
  const fieldAttemptCountsRef = useRef<Record<CardScannerField, number>>({
    name: 0,
    number: 0,
    attack: 0,
  });

  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === selectedId) ?? matches[0] ?? null,
    [matches, selectedId]
  );

  const stopCamera = useCallback(() => {
    fieldControllerRef.current?.abort();
    fieldControllerRef.current = null;
    fieldInProgressRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraSessionActive(false);
    setTorchSupported(false);
    setTorchEnabled(false);
    setActiveField(null);
    focusFieldRef.current = null;
    setFocusField(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const replacePreviewUrl = useCallback((nextUrl: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCameraSupported(Boolean(navigator.mediaDevices?.getUserMedia));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const backgroundControllers = backgroundControllersRef.current;
    return () => {
      stopCamera();
      requestAbortRef.current?.abort();
      fieldControllerRef.current?.abort();
      backgroundControllers.forEach((controller) => controller.abort());
      backgroundControllers.clear();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [stopCamera]);

  useEffect(() => {
    if (stage !== "analyzing") return;
    const timer = window.setInterval(() => {
      setAnalysisStep((current) => Math.min(ANALYSIS_STEPS.length - 1, current + 1));
    }, 1_350);
    return () => window.clearInterval(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "camera") return;
    const stream = streamRef.current;
    const video = videoRef.current;
    if (!stream || !video) return;

    video.srcObject = stream;
    void video.play().catch(() => {
      setCameraError("The camera opened, but the preview could not start.");
    });
  }, [stage]);

  async function openCamera() {
    setError(null);
    setCameraError(null);
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 2_560 },
          height: { ideal: 1_920 },
          resizeMode: { ideal: "none" },
        } as MediaTrackConstraints & {
          resizeMode: { ideal: "none" };
        },
      });
      streamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = videoTrack?.getCapabilities?.() as
        | ScannerMediaTrackCapabilities
        | undefined;
      if (videoTrack) {
        videoTrack.contentHint = "detail";
        try {
          await applyScannerCameraTuning(videoTrack);
        } catch {
          // Browsers may advertise image-capture capabilities that the active
          // iPhone camera refuses. Native autofocus remains the safe fallback.
        }
      }
      setTorchSupported(Boolean(capabilities?.torch));
      setTorchEnabled(false);
      previousFrameRef.current = null;
      currentFrameRef.current = null;
      capturedFrameRef.current = null;
      readyFrameStreakRef.current = 0;
      changedFrameStreakRef.current = 0;
      autoCaptureArmedRef.current = true;
      fieldCooldownUntilRef.current = 0;
      nextFieldRef.current = "name";
      fieldAttemptCountsRef.current = { name: 0, number: 0, attack: 0 };
      focusFieldRef.current = null;
      setFocusField(null);
      replaceObservedIdentity(EMPTY_OBSERVED_IDENTITY);
      setCameraSessionActive(true);
      setStage("camera");
    } catch (cameraAccessError) {
      const message =
        cameraAccessError instanceof DOMException &&
        cameraAccessError.name === "NotAllowedError"
          ? "Camera access was blocked. Allow camera access or choose a photo."
          : "The camera could not be opened. Choose a photo instead.";
      setCameraError(message);
      setStage("ready");
    }
  }

  async function toggleTorch() {
    const videoTrack = streamRef.current?.getVideoTracks()[0];
    if (!videoTrack || !torchSupported) return;

    const nextEnabled = !torchEnabled;
    try {
      await applyScannerCameraTuning(videoTrack, { torch: nextEnabled });
      setTorchEnabled(nextEnabled);
      setCameraError(null);
    } catch {
      setTorchSupported(false);
      setTorchEnabled(false);
      setCameraError("Flashlight control is not available on this camera.");
    }
  }

  function queueScannedCard(match: CardScannerMatch) {
    setScannedCards((current) => [
      ...current,
      {
        key: `${match.id}-${Date.now()}-${current.length}`,
        match,
      },
    ]);
    setBatchMessage(null);
  }

  function replaceObservedIdentity(next: ObservedScannerIdentity) {
    observedIdentityRef.current = next;
    setObservedIdentity(next);
    if (!next.name && !next.number && !next.attack) {
      pendingIdentityRef.current = EMPTY_PENDING_IDENTITY;
      setPendingIdentity(EMPTY_PENDING_IDENTITY);
    }
  }

  function rememberObservedField(
    field: CardScannerField,
    point: ObservedScannerPoint
  ) {
    const next = {
      ...observedIdentityRef.current,
      [field]: point,
    };
    const nextPending = { ...pendingIdentityRef.current };
    delete nextPending[field];
    pendingIdentityRef.current = nextPending;
    setPendingIdentity(nextPending);
    replaceObservedIdentity(next);
    if (focusFieldRef.current === field) {
      focusFieldRef.current = null;
      setFocusField(null);
    }
  }

  function prioritizeScannerField(field: CardScannerField) {
    if (observedIdentityRef.current[field]) return;
    const next = focusFieldRef.current === field ? null : field;
    focusFieldRef.current = next;
    setFocusField(next);
    nextFieldRef.current = field;
    fieldAttemptCountsRef.current[field] = 0;
    fieldCooldownUntilRef.current = 0;
  }

  function clearObservedField(field: CardScannerField) {
    fieldControllerRef.current?.abort();
    fieldControllerRef.current = null;
    fieldInProgressRef.current = false;
    setActiveField(null);
    replaceObservedIdentity({
      ...observedIdentityRef.current,
      [field]: null,
    });
    const nextPending = { ...pendingIdentityRef.current };
    delete nextPending[field];
    pendingIdentityRef.current = nextPending;
    setPendingIdentity(nextPending);
    nextFieldRef.current = field;
    fieldAttemptCountsRef.current[field] = 0;
    focusFieldRef.current = field;
    setFocusField(field);
    fieldCooldownUntilRef.current = Date.now() + 180;
  }

  async function requestCardScan(
    file: File,
    controller: AbortController,
    identity: ObservedScannerIdentity = EMPTY_OBSERVED_IDENTITY
  ): Promise<CardScannerResponse> {
    const body = new FormData();
    body.set("image", file);
    body.set("game", game);
    if (identity.name?.value) body.set("knownName", identity.name.value);
    if (identity.number?.value) {
      body.set("knownReference", identity.number.value);
    }
    if (identity.attack?.value) {
      body.set("knownAttackText", identity.attack.value);
    }
    const response = await fetch("/api/cards/scan", {
      method: "POST",
      body,
      signal: controller.signal,
    });
    const data = (await response.json()) as
      | CardScannerResponse
      | { ok: false; error?: string };
    if (!response.ok || !data.ok) {
      throw new Error("error" in data ? data.error : "The card could not be scanned.");
    }
    return data;
  }

  async function readFieldFromCamera(field: CardScannerField) {
    const video = videoRef.current;
    const canvas = fieldCanvasRef.current;
    if (
      fieldInProgressRef.current ||
      !video ||
      !canvas ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return;
    }

    fieldInProgressRef.current = true;
    fieldAttemptCountsRef.current[field] += 1;
    // Automatic reads must never silently switch to the small centre target:
    // that region contains HP, attack and damage values that look like card
    // numbers. Centre focus is reserved for an explicit tap on a field.
    const scanRegion = getScannerFieldScanRegion(
      field,
      focusFieldRef.current
    );
    setActiveField(field);
    const controller = new AbortController();
    fieldControllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 24_000);

    try {
      drawScannerFieldBands(
        canvas,
        video,
        video.videoWidth,
        video.videoHeight,
        field,
        getCameraFrameSourceRect(video, cardFrameRef.current),
        scanRegion === "focus"
      );
      const file = await canvasToJpegFile(canvas, 0.97);
      const body = new FormData();
      body.set("image", file);
      body.set("game", game);
      body.set("mode", "field");
      body.set("field", field);
      body.set("scanRegion", scanRegion);
      const remembered = observedIdentityRef.current;
      if (remembered.name?.value) {
        body.set("knownName", remembered.name.value);
      }
      if (remembered.number?.value) {
        body.set("knownReference", remembered.number.value);
      }
      const response = await fetch("/api/cards/scan", {
        method: "POST",
        body,
        signal: controller.signal,
      });
      const data = (await response.json()) as
        | CardScannerFieldResponse
        | { ok: false; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error("error" in data ? data.error : "This field was not readable.");
      }
      const responseObservations = data.result.observations ?? {};
      const detectedObservations =
        Object.keys(responseObservations).length > 0
          ? responseObservations
          : data.result.value
            ? {
                [field]: {
                  value: data.result.value,
                  confidence: data.result.confidence,
                  catalogMatches: data.result.catalogMatches,
                },
              }
            : {};
      let savedAnObservation = false;
      let confirmationField: CardScannerField | null = null;
      for (const detectedField of ACTIVE_SCANNER_FIELDS) {
        const observation = detectedObservations[detectedField];
        if (!observation || observedIdentityRef.current[detectedField]) {
          continue;
        }
        const now = Date.now();
        const previous = pendingIdentityRef.current[detectedField];
        const confirmsPrevious =
          previous?.value === observation.value &&
          now - previous.lastSeenAt <= 12_000;
        // Elke observatie is server-side al tegen de catalogus gevalideerd.
        // Een duidelijke read mag daarom in één keer groen; alleen twijfel-
        // gevallen (fuzzy nummer-correctie, nét-genoeg naam) vragen om een
        // tweede bevestiging — dubbel bevestigen op alles maakte de flow
        // tergend traag zonder extra zekerheid op te leveren.
        const instantAccept =
          detectedField === "name"
            ? (observation.confidence ?? 0) >= 90
            : (observation.confidence ?? 0) >= 55 ||
              (focusFieldRef.current === "number" &&
                observation.catalogMatches === 1 &&
                (observation.confidence ?? 0) >= 25);
        const pendingPoint: PendingScannerPoint = {
          value: observation.value,
          confidence: observation.confidence,
          confirmations: instantAccept
            ? 2
            : confirmsPrevious
              ? previous.confirmations + 1
              : 1,
          lastSeenAt: now,
        };
        const nextPending = {
          ...pendingIdentityRef.current,
          [detectedField]: pendingPoint,
        };
        pendingIdentityRef.current = nextPending;
        setPendingIdentity(nextPending);
        if (pendingPoint.confirmations < 2) {
          confirmationField ??= detectedField;
          continue;
        }
        rememberObservedField(detectedField, {
          value: observation.value,
          confidence: observation.confidence,
        });
        savedAnObservation = true;
      }
      let triggeredCapture = false;
      if (savedAnObservation) {
        setCameraError(null);
        const identity = observedIdentityRef.current;
        // De kaart is geïdentificeerd zodra naam én nummer vastliggen:
        // meteen pakken, zonder shutter-klik of stabiliteits-wachttijd.
        if (autoCaptureEnabled && identity.name && identity.number) {
          triggeredCapture = true;
          autoCaptureActionRef.current();
        }
      }
      if (!triggeredCapture && !focusFieldRef.current) {
        nextFieldRef.current =
          confirmationField ?? nextScannerField(field);
      }
    } catch (fieldError) {
      if (!controller.signal.aborted) {
        setCameraError(
          fieldError instanceof Error
            ? fieldError.message
            : "This part could not be read yet."
        );
      }
      if (!focusFieldRef.current) {
        nextFieldRef.current = nextScannerField(field);
      }
    } finally {
      window.clearTimeout(timeout);
      if (fieldControllerRef.current === controller) {
        fieldControllerRef.current = null;
      }
      fieldInProgressRef.current = false;
      setActiveField(null);
      fieldCooldownUntilRef.current = Date.now() + 220;
    }
  }

  async function analyzePhotoInBackground(
    file: File,
    identity: ObservedScannerIdentity
  ) {
    const jobId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60_000);
    backgroundControllersRef.current.set(jobId, controller);
    setScanJobs((current) => [
      ...current,
      {
        id: jobId,
        status: "reading",
        matches: [],
        detectedText: null,
        detectedReferences: [],
        processingMs: null,
        error: null,
      },
    ]);

    try {
      if (controller.signal.aborted) return;
      const data = await requestCardScan(file, controller, identity);
      const topMatch = data.result.matches[0] ?? null;

      if (topMatch?.autoAccept) {
        queueScannedCard(topMatch);
        setLastAutoMatch(topMatch);
        setScanJobs((current) => current.filter((job) => job.id !== jobId));
        return;
      }

      setScanJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: data.result.matches.length > 0 ? "review" : "failed",
                matches: data.result.matches,
                detectedText: data.result.detected.strongestText,
                detectedReferences: data.result.detected.cardReferences,
                processingMs: data.result.processingMs,
                error:
                  data.result.matches.length > 0
                    ? null
                    : "No reliable printing was found.",
              }
            : job
        )
      );
    } catch (scanError) {
      if (controller.signal.aborted && !backgroundControllersRef.current.has(jobId)) {
        return;
      }
      setScanJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: "failed",
                error:
                  timedOut
                    ? "This scan took too long. Try again with less glare."
                    : scanError instanceof Error
                    ? scanError.message
                    : "This card could not be identified.",
              }
            : job
        )
      );
    } finally {
      window.clearTimeout(timeout);
      backgroundControllersRef.current.delete(jobId);
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (captureInProgressRef.current) return;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setCameraError("Hold the card still until the camera preview is ready.");
      return;
    }
    if (backgroundControllersRef.current.size >= 6) {
      setCameraError("Six cards are already being read. Hold on for a result.");
      return;
    }
    captureInProgressRef.current = true;
    try {
      fieldControllerRef.current?.abort();
      fieldControllerRef.current = null;
      fieldInProgressRef.current = false;
      setActiveField(null);
      drawCentralCardCrop(
        canvas,
        video,
        video.videoWidth,
        video.videoHeight,
        900,
        getCameraFrameSourceRect(video, cardFrameRef.current)
      );
      const file = await canvasToJpegFile(canvas);
      const identity = observedIdentityRef.current;
      capturedFrameRef.current = currentFrameRef.current?.slice() ?? null;
      autoCaptureArmedRef.current = false;
      readyFrameStreakRef.current = 0;
      changedFrameStreakRef.current = 0;
      replaceObservedIdentity(EMPTY_OBSERVED_IDENTITY);
      focusFieldRef.current = null;
      setFocusField(null);
      nextFieldRef.current = "name";
      fieldAttemptCountsRef.current = { name: 0, number: 0, attack: 0 };
      setCameraError(null);
      void analyzePhotoInBackground(file, identity);
    } catch {
      setCameraError("The photo could not be captured. Please try again.");
      autoCaptureArmedRef.current = true;
    } finally {
      captureInProgressRef.current = false;
    }
  }

  useEffect(() => {
    autoCaptureActionRef.current = () => {
      void capturePhoto();
    };
    fieldReadActionRef.current = (field) => {
      void readFieldFromCamera(field);
    };
  });

  useEffect(() => {
    if (stage !== "camera") return;

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = readinessCanvasRef.current;
      if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;

      try {
        drawCentralCardCrop(
          canvas,
          video,
          video.videoWidth,
          video.videoHeight,
          126,
          getCameraFrameSourceRect(video, cardFrameRef.current)
        );
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const grayscale = rgbaToScannerGrayscale(rgba);
        const readiness = measureScannerFrame(
          grayscale,
          canvas.width,
          canvas.height,
          previousFrameRef.current
        );
        previousFrameRef.current = grayscale;
        currentFrameRef.current = grayscale;

        if (!autoCaptureArmedRef.current) {
          const difference = getScannerFrameDifference(
            capturedFrameRef.current,
            grayscale
          );
          changedFrameStreakRef.current =
            difference != null && difference >= 13
              ? changedFrameStreakRef.current + 1
              : 0;
          if (changedFrameStreakRef.current >= 2) {
            autoCaptureArmedRef.current = true;
            readyFrameStreakRef.current = 0;
            changedFrameStreakRef.current = 0;
          }
          return;
        }

        const observed = observedIdentityRef.current;
        const canCapture =
          !captureInProgressRef.current &&
          backgroundControllersRef.current.size < 6;

        // Naam + nummer bekend → de kaart is geïdentificeerd. Direct pakken;
        // niet wachten op een perfect stil frame of een shutter-klik.
        if (autoCaptureEnabled && observed.name && observed.number) {
          readyFrameStreakRef.current = 0;
          if (canCapture) autoCaptureActionRef.current();
          return;
        }

        // Lees handsfree het volgende ongelezen veld; een focus-tik van de
        // speler wint van de round-robin.
        const focused = focusFieldRef.current;
        let targetField =
          focused && !observed[focused] ? focused : null;
        if (!targetField) {
          const start = ACTIVE_SCANNER_FIELDS.indexOf(nextFieldRef.current);
          const rotation =
            start > 0
              ? [
                  ...ACTIVE_SCANNER_FIELDS.slice(start),
                  ...ACTIVE_SCANNER_FIELDS.slice(0, start),
                ]
              : ACTIVE_SCANNER_FIELDS;
          targetField = rotation.find((field) => !observed[field]) ?? null;
        }
        if (
          targetField &&
          !fieldInProgressRef.current &&
          Date.now() >= fieldCooldownUntilRef.current &&
          readiness.brightness >= 7 &&
          readiness.contrast >= 5
        ) {
          fieldReadActionRef.current(targetField);
        }

        // Vangnet: pas wanneer de losse velden meermaals niets opleverden
        // (glans, sleeve, beschadigde voetregel) een volledige foto nemen en
        // de kaart server-side laten identificeren. De eis is bewust milder
        // dan de oude "perfect stil + scherp"-heuristiek die op een telefoon
        // vrijwel nooit afging.
        const attemptsExhausted = ACTIVE_SCANNER_FIELDS.every(
          (field) =>
            Boolean(observed[field]) ||
            fieldAttemptCountsRef.current[field] >= 3
        );
        if (!autoCaptureEnabled || !attemptsExhausted || !canCapture) {
          readyFrameStreakRef.current = 0;
          return;
        }
        const fallbackReady =
          readiness.cardInFrame &&
          readiness.lightingGood &&
          (readiness.motion == null || readiness.motion <= 10);
        readyFrameStreakRef.current = fallbackReady
          ? readyFrameStreakRef.current + 1
          : 0;
        if (readyFrameStreakRef.current >= 4) {
          readyFrameStreakRef.current = 0;
          autoCaptureActionRef.current();
        }
      } catch {
        // Ignore one transient camera frame and retry on the next interval.
      }
    }, 280);

    return () => window.clearInterval(timer);
  }, [autoCaptureEnabled, stage]);

  useEffect(() => {
    if (!lastAutoMatch) return;
    const timeout = window.setTimeout(() => setLastAutoMatch(null), 3_800);
    return () => window.clearTimeout(timeout);
  }, [lastAutoMatch]);

  function chooseFile(file: File | null) {
    if (!file) return;
    setError(null);
    setCameraError(null);
    if (!file.type.startsWith("image/")) {
      setError("Choose a photo of a card.");
      setStage("error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("The image must be smaller than 10 MB.");
      setStage("error");
      return;
    }
    stopCamera();
    setImageFile(file);
    replacePreviewUrl(URL.createObjectURL(file));
    setStage("preview");
  }

  async function analyzePhoto(fileToAnalyze: File | null = imageFile) {
    if (!fileToAnalyze) return;
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 22_000);
    requestAbortRef.current = controller;
    setAnalysisStep(0);
    setStage("analyzing");
    setError(null);
    setMatches([]);
    setSelectedId(null);
    setDetectedText(null);
    setDetectedReferences([]);
    setProcessingMs(null);

    try {
      const data = await requestCardScan(fileToAnalyze, controller);

      setDetectedText(data.result.detected.strongestText);
      setDetectedReferences(data.result.detected.cardReferences);
      setProcessingMs(data.result.processingMs);
      setMatches(data.result.matches);
      if (data.result.matches.length > 0) {
        setSelectedId(data.result.matches[0].id);
        setStage("results");
      } else {
        setStage("empty");
      }
    } catch (scanError) {
      if (controller.signal.aborted && !timedOut) return;
      setError(
        timedOut
          ? "Recognition took too long. Try a sharper photo with the card filling the outline."
          : scanError instanceof Error
          ? scanError.message
          : "The card could not be scanned. Try a sharper photo."
      );
      setStage("error");
    } finally {
      window.clearTimeout(timeout);
      if (requestAbortRef.current === controller) requestAbortRef.current = null;
    }
  }

  function resetScanner() {
    requestAbortRef.current?.abort();
    backgroundControllersRef.current.forEach((controller) => controller.abort());
    backgroundControllersRef.current.clear();
    stopCamera();
    replacePreviewUrl(null);
    setImageFile(null);
    setMatches([]);
    setSelectedId(null);
    setDetectedText(null);
    setDetectedReferences([]);
    setProcessingMs(null);
    setError(null);
    setCameraError(null);
    setScannedCards([]);
    setScanJobs([]);
    setActiveReviewJobId(null);
    setLastAutoMatch(null);
    setBatchMessage(null);
    replaceObservedIdentity(EMPTY_OBSERVED_IDENTITY);
    setActiveField(null);
    focusFieldRef.current = null;
    setFocusField(null);
    previousFrameRef.current = null;
    currentFrameRef.current = null;
    capturedFrameRef.current = null;
    autoCaptureArmedRef.current = true;
    fieldCooldownUntilRef.current = 0;
    nextFieldRef.current = "name";
    fieldAttemptCountsRef.current = { name: 0, number: 0, attack: 0 };
    setStage("ready");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function continueScanning(matchToRemember: CardScannerMatch | null = null) {
    requestAbortRef.current?.abort();
    if (matchToRemember) {
      queueScannedCard(matchToRemember);
    }
    if (activeReviewJobId) {
      setScanJobs((current) =>
        current.filter((job) => job.id !== activeReviewJobId)
      );
      setActiveReviewJobId(null);
    }
    replacePreviewUrl(null);
    setImageFile(null);
    setMatches([]);
    setSelectedId(null);
    setDetectedText(null);
    setDetectedReferences([]);
    setProcessingMs(null);
    setError(null);
    setCameraError(null);
    setAnalysisStep(0);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const cameraIsReady = Boolean(
      streamRef.current?.getVideoTracks().some((track) => track.readyState === "live")
    );
    if (cameraIsReady) {
      setCameraSessionActive(true);
      previousFrameRef.current = null;
      setStage("camera");
    } else {
      setCameraSessionActive(false);
      setStage("ready");
    }
  }

  function openReviewJob(job: BackgroundScanJob) {
    if (job.status !== "review" || job.matches.length === 0) return;
    setActiveReviewJobId(job.id);
    setMatches(job.matches);
    setSelectedId(job.matches[0].id);
    setDetectedText(job.detectedText);
    setDetectedReferences(job.detectedReferences);
    setProcessingMs(job.processingMs);
    setError(null);
    setStage("results");
  }

  async function addBatchToCollection() {
    if (bulkAdding || scannedCards.length === 0) return;
    setBulkAdding(true);
    setBatchMessage(null);
    try {
      const response = await fetch("/api/collection/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cardIds: scannedCards.map((item) => item.match.id),
          condition: "Near Mint",
          language: "English",
          openingSessionId,
        }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "The batch could not be added.");
      }
      const count = scannedCards.length;
      setScannedCards([]);
      setBatchMessage(
        `${count} ${count === 1 ? "copy" : "copies"} added as English Near Mint.`
      );
    } catch (batchError) {
      setBatchMessage(
        batchError instanceof Error
          ? batchError.message
          : "The batch could not be added."
      );
    } finally {
      setBulkAdding(false);
    }
  }

  async function openCardDetails(match: CardScannerMatch) {
    if (openingCardId) return;
    setOpeningCardId(match.id);
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(match.id)}`);
      if (!response.ok) throw new Error("Card details could not be opened.");
      setSelectedModalCard((await response.json()) as ModalCardData);
    } catch {
      setError("Card details could not be opened. Please try again.");
    } finally {
      setOpeningCardId(null);
    }
  }

  const manualSearchQuery =
    detectedReferences[0] ?? detectedText ?? selectedMatch?.name ?? "";
  const readingJobs = scanJobs.filter((job) => job.status === "reading");
  const reviewJobs = scanJobs.filter((job) => job.status === "review");
  const failedJobs = scanJobs.filter((job) => job.status === "failed");
  const activeScannerFields = ACTIVE_SCANNER_FIELDS;
  const identityReady = Boolean(
    observedIdentity.name && observedIdentity.number
  );
  const focusFieldLabel =
    focusField === "name"
      ? "name"
      : focusField === "number"
        ? "card number"
        : "attack text";
  const detailTargetBounds = focusField
    ? getScannerFieldCaptureBounds(focusField, "focus")
    : null;
  const scannerPrompt = activeField
    ? `Reading ${
        activeField === "name"
          ? "card name"
          : activeField === "number"
            ? "card number"
            : "attack text"
      }…`
    : focusField
      ? `${focusFieldLabel} focus · place only this detail in the centre`
    : identityReady
      ? autoCaptureEnabled
        ? "Card identified · grabbing it now"
        : "Card identified · tap the shutter"
      : observedIdentity.name
        ? `${observedIdentity.name.value} saved · reading the card number`
        : observedIdentity.number
          ? `${observedIdentity.number.value} saved · reading the name`
          : "Hold the card in the frame · reading name and number";
  const allIdentityPoints: Array<{
    field: CardScannerField;
    label: string;
    point: ObservedScannerPoint | null;
  }> = [
    { field: "name", label: "Name", point: observedIdentity.name },
    { field: "number", label: "Number", point: observedIdentity.number },
    { field: "attack", label: "Attack", point: observedIdentity.attack },
  ];
  const identityPoints = allIdentityPoints.filter(({ field }) =>
    activeScannerFields.includes(field)
  );

  return (
    <>
      <div
        data-card-scanner-page
        className="page-container binder-bottom-safe mx-auto max-w-6xl px-3 py-3 text-[var(--dc-text-primary)] sm:px-6 sm:py-6 lg:px-8"
      >
        <header className="binder-panel relative overflow-hidden rounded-[var(--ui-page-header-radius)] p-4 sm:p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgb(var(--dc-primary-rgb)/0.2),transparent_68%)]"
          />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--dc-primary-soft)]">
                <ScanLine className="h-4 w-4" />
                Collector tools
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
                Card Scanner
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--dc-text-muted)] sm:text-[15px]">
                Keep the camera open and scan cards one after another. DustyCards reads
                the name and printed number live, and the moment both are confirmed it
                grabs the card automatically and verifies the exact printing.
              </p>
            </div>
            {settings.onePieceLibraryEnabled ? (
              <div
                className="inline-grid min-h-11 grid-cols-2 rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.95)] bg-[rgb(var(--dc-bg-main-rgb)/0.54)] p-1"
                aria-label="Card game"
              >
                {([POKEMON_GAME, ONE_PIECE_GAME] as const).map((option) => {
                  const active = game === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setGame(option);
                        if (stage === "results" || stage === "empty") {
                          resetScanner();
                        } else if (stage === "camera") {
                          fieldControllerRef.current?.abort();
                          fieldControllerRef.current = null;
                          fieldInProgressRef.current = false;
                          setActiveField(null);
                          focusFieldRef.current = null;
                          setFocusField(null);
                          replaceObservedIdentity(EMPTY_OBSERVED_IDENTITY);
                          nextFieldRef.current = "name";
                          fieldAttemptCountsRef.current = {
                            name: 0,
                            number: 0,
                            attack: 0,
                          };
                        }
                      }}
                      className={`min-h-10 rounded-xl px-3 text-xs font-bold transition ${
                        active
                          ? "bg-[var(--dc-primary)] text-white shadow-[0_7px_18px_rgb(var(--dc-primary-rgb)/0.24)]"
                          : "text-[var(--dc-text-muted)] hover:text-[var(--dc-text-primary)]"
                      }`}
                    >
                      {getGameLabel(option)}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </header>

        {scannedCards.length > 0 ? (
          <section
            aria-label="Cards scanned in this session"
            className="mt-3 rounded-[var(--ui-page-header-radius)] border border-[rgb(var(--dc-border-rgb)/0.84)] bg-[rgb(var(--dc-surface-primary-rgb)/0.66)] p-2.5 sm:mt-4"
          >
            <div className="flex items-center justify-between gap-3 px-1 pb-2.5">
              <div className="flex min-h-11 items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[var(--dc-success-hover)]" />
                <span>
                  <span className="block text-sm font-black tabular-nums">
                    {scannedCards.length} ready
                  </span>
                  <span className="block text-[10px] font-bold text-[var(--dc-text-muted)]">
                    English · Near Mint
                  </span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => void addBatchToCollection()}
                disabled={bulkAdding}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--dc-primary-gradient)] px-4 text-xs font-black text-white shadow-[0_8px_22px_rgb(var(--dc-primary-rgb)/0.2)] disabled:opacity-60"
              >
                {bulkAdding ? (
                  <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" />
                ) : (
                  <Layers3 className="h-4 w-4" />
                )}
                Add batch
              </button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              {scannedCards.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => openCardDetails(item.match)}
                  className="grid min-h-14 shrink-0 grid-cols-[2.15rem_auto] items-center gap-2 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.72)] bg-[rgb(var(--dc-bg-main-rgb)/0.34)] p-1.5 pr-3 text-left"
                >
                  <ScannerArtwork match={item.match} sizes="35px" />
                  <span className="max-w-32">
                    <span className="block truncate text-xs font-black">
                      {item.match.name}
                    </span>
                    <span className="block truncate text-[9px] font-bold text-[var(--dc-text-muted)]">
                      {item.match.episode.name}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
        {batchMessage ? (
          <p
            role="status"
            className="mt-3 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-primary-rgb)/0.6)] px-3 py-2 text-xs font-bold text-[var(--dc-text-secondary)]"
          >
            {batchMessage}
          </p>
        ) : null}

        <div className="mt-3 sm:mt-4">
          {(stage === "ready" || stage === "camera" || stage === "preview" || stage === "analyzing") && (
            <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
              <div className="binder-panel overflow-hidden rounded-[var(--ui-page-header-radius)]">
                {stage === "ready" ? (
                  <div className="grid min-h-[30rem] place-items-center px-5 py-10 text-center sm:min-h-[36rem]">
                    <div className="max-w-lg">
                      <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] border border-[rgb(var(--dc-primary-soft-rgb)/0.28)] bg-[rgb(var(--dc-primary-rgb)/0.12)] text-[var(--dc-primary-soft)] shadow-[0_18px_50px_rgb(var(--dc-primary-rgb)/0.16)]">
                        <ScanLine className="h-9 w-9" />
                      </span>
                      <h2 className="mt-6 text-2xl font-black tracking-tight">
                        Put one card in frame
                      </h2>
                      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--dc-text-muted)]">
                        For the best result, keep all four corners visible and avoid a
                        bright reflection over the name or card number.
                      </p>
                      <div className="mt-6 grid gap-2 sm:grid-cols-2">
                        {cameraSupported ? (
                          <button
                            type="button"
                            onClick={openCamera}
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[rgb(var(--dc-primary-soft-rgb)/0.35)] bg-[var(--dc-primary-gradient)] px-5 text-sm font-black text-white shadow-[0_12px_30px_rgb(var(--dc-primary-rgb)/0.24)] transition hover:brightness-110"
                          >
                            <Camera className="h-5 w-5" />
                            Open camera
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.95)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] px-5 text-sm font-black text-[var(--dc-text-secondary)] transition hover:border-[rgb(var(--dc-border-hover-rgb)/0.95)] hover:text-[var(--dc-text-primary)]"
                        >
                          <ImagePlus className="h-5 w-5" />
                          Choose photo
                        </button>
                      </div>
                      {cameraError ? (
                        <p
                          role="alert"
                          className="mt-4 rounded-xl border border-amber-300/20 bg-amber-400/8 px-3 py-2 text-xs font-semibold text-amber-100/80"
                        >
                          {cameraError}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {stage === "camera" ? (
                  <div className="relative min-h-[calc(100dvh-var(--ui-header-height)-8rem)] overflow-hidden bg-black sm:min-h-[38rem]">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      aria-label="Live camera preview"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0,transparent_35%,rgba(0,0,0,0.58)_78%)]"
                    />
                    <div className="absolute inset-x-0 bottom-[10.75rem] top-[4.25rem] flex items-center justify-center p-3 sm:inset-0 sm:p-10">
                      <div
                        ref={cardFrameRef}
                        className="relative aspect-[63/88] h-full max-h-full w-auto max-w-[82vw] rounded-[5%] border border-white/60 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16),0_0_0_9999px_rgba(0,0,0,0.18),0_0_42px_rgb(var(--dc-primary-rgb)/0.18)] sm:h-auto sm:max-h-[74vh] sm:w-[min(72vw,22rem)] sm:max-w-full"
                      >
                        {[
                          "left-[-1px] top-[-1px] border-l-4 border-t-4",
                          "right-[-1px] top-[-1px] border-r-4 border-t-4",
                          "bottom-[-1px] left-[-1px] border-b-4 border-l-4",
                          "bottom-[-1px] right-[-1px] border-b-4 border-r-4",
                        ].map((classes) => (
                          <span
                            key={classes}
                            className={`absolute h-10 w-10 rounded-[5px] border-[var(--dc-primary-soft)] ${classes}`}
                          />
                        ))}
                        {detailTargetBounds ? (
                          <span
                            className="absolute rounded-xl border-2 border-[var(--dc-primary-soft)] bg-[rgb(var(--dc-primary-rgb)/0.06)] shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_24px_rgb(var(--dc-primary-rgb)/0.38)]"
                            style={{
                              left: `${detailTargetBounds.left * 100}%`,
                              top: `${detailTargetBounds.top * 100}%`,
                              width: `${detailTargetBounds.width * 100}%`,
                              height: `${detailTargetBounds.height * 100}%`,
                            }}
                          >
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-white/82 backdrop-blur-sm">
                              {focusFieldLabel}
                            </span>
                          </span>
                        ) : (
                          <span className="absolute inset-x-[23%] top-1/2 h-px bg-gradient-to-r from-transparent via-[var(--dc-primary-soft)] to-transparent opacity-70 motion-safe:animate-pulse" />
                        )}
                      </div>
                    </div>
                    <div className="absolute inset-x-0 top-4 flex justify-center px-4">
                      <div className="grid max-w-[calc(100vw-2rem)] gap-2">
                        <div className="flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/18 bg-black/52 px-4 text-xs font-bold text-white/88 shadow-xl backdrop-blur-md">
                          {lastAutoMatch ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                              <span className="truncate">{lastAutoMatch.name} ready</span>
                            </>
                          ) : !autoCaptureArmedRef.current ? (
                            <>
                              <RefreshCcw className="h-4 w-4 text-[var(--dc-primary-soft)]" />
                              Move this card away
                            </>
                          ) : (
                            <>
                              {activeField ? (
                                <LoaderCircle className="h-4 w-4 motion-safe:animate-spin text-[var(--dc-primary-soft)]" />
                              ) : identityReady ? (
                                <ScanLine className="h-4 w-4 text-[var(--dc-primary-soft)]" />
                              ) : (
                                <Search className="h-4 w-4 text-[var(--dc-primary-soft)]" />
                              )}
                              <span className="truncate">{scannerPrompt}</span>
                            </>
                          )}
                          {readingJobs.length > 0 ? (
                            <span className="rounded-full bg-white/12 px-2 py-0.5 tabular-nums">
                              {readingJobs.length} reading
                            </span>
                          ) : scannedCards.length > 0 ? (
                            <span className="rounded-full bg-white/12 px-2 py-0.5 tabular-nums">
                              {scannedCards.length}
                            </span>
                          ) : null}
                        </div>
                        {reviewJobs.length > 0 || failedJobs.length > 0 ? (
                          <div className="flex justify-center gap-2">
                            {reviewJobs.slice(0, 1).map((job) => (
                              <button
                                key={job.id}
                                type="button"
                                onClick={() => openReviewJob(job)}
                                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-amber-200/30 bg-amber-400/15 px-3 text-[11px] font-black text-amber-100 backdrop-blur-md"
                              >
                                Review {reviewJobs.length}
                                <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            ))}
                            {failedJobs.length > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setScanJobs((current) =>
                                    current.filter((job) => job.status !== "failed")
                                  )
                                }
                                className="inline-flex min-h-9 items-center rounded-full border border-rose-200/25 bg-rose-400/15 px-3 text-[11px] font-black text-rose-100 backdrop-blur-md"
                              >
                                {failedJobs.length} unread
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="absolute inset-x-3 bottom-[7.1rem] flex justify-center">
                      <div className="w-full max-w-md rounded-2xl border border-white/16 bg-black/58 p-1 shadow-xl backdrop-blur-md">
                        <div
                          className={`grid gap-1.5 ${
                            identityPoints.length === 3
                              ? "grid-cols-3"
                              : "grid-cols-2"
                          }`}
                        >
                          {identityPoints.map(({ field, label, point }) => {
                            const pending = pendingIdentity[field];
                            return (
                              <div
                                key={field}
                                className={`grid min-h-12 grid-cols-[1.5rem_minmax(0,1fr)_2.75rem] items-center gap-1 rounded-xl px-1.5 transition ${
                                  point
                                    ? "bg-emerald-400/16 text-emerald-100"
                                    : pending
                                      ? "bg-amber-300/14 text-amber-50"
                                      : activeField === field
                                        ? "bg-[rgb(var(--dc-primary-rgb)/0.24)] text-white"
                                        : focusField === field
                                          ? "bg-[rgb(var(--dc-primary-rgb)/0.16)] text-white"
                                          : "bg-white/5 text-white/55"
                                }`}
                              >
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/20">
                                  {point ? (
                                    <Check className="h-3.5 w-3.5" />
                                  ) : pending || activeField === field ? (
                                    <LoaderCircle className="h-3.5 w-3.5 motion-safe:animate-spin" />
                                  ) : (
                                    <Search className="h-3.5 w-3.5" />
                                  )}
                                </span>
                                <span className="min-w-0">
                                  <span className="block text-[8px] font-black uppercase tracking-[0.12em] opacity-70">
                                    {label}
                                  </span>
                                  <span
                                    className="block truncate text-[11px] font-black"
                                    title={pending?.value}
                                  >
                                    {point?.value ??
                                      (pending
                                        ? `${pending.value} · checking`
                                        : activeField === field
                                          ? "Reading…"
                                          : "Not read")}
                                  </span>
                                </span>
                                {point ? (
                                  <button
                                    type="button"
                                    onClick={() => clearObservedField(field)}
                                    aria-label={`Clear saved ${label.toLowerCase()}`}
                                    className="flex h-11 w-11 items-center justify-center rounded-full text-current opacity-65 hover:bg-black/20 hover:opacity-100"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => prioritizeScannerField(field)}
                                    aria-pressed={focusField === field}
                                    aria-label={`Focus camera on ${label.toLowerCase()}`}
                                    className={`flex h-11 w-11 items-center justify-center rounded-full transition ${
                                      focusField === field
                                        ? "bg-[var(--dc-primary)] text-white"
                                        : "text-current opacity-60 hover:bg-white/10 hover:opacity-100"
                                    }`}
                                  >
                                    <ScanLine className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 grid grid-cols-[7rem_4.5rem_7rem] items-center justify-center gap-3 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-16">
                      <div className="flex justify-end">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setAutoCaptureEnabled((current) => !current)}
                            aria-pressed={autoCaptureEnabled}
                            aria-label="Toggle automatic capture"
                            className={`flex h-12 min-w-12 items-center justify-center rounded-full border px-2 text-[9px] font-black backdrop-blur-md ${
                              autoCaptureEnabled
                                ? "border-[rgb(var(--dc-primary-soft-rgb)/0.8)] bg-[var(--dc-primary)] text-white"
                                : "border-white/18 bg-black/45 text-white/60"
                            }`}
                          >
                            AUTO
                          </button>
                          <button
                            type="button"
                            onClick={resetScanner}
                            aria-label="Close camera"
                            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/18 bg-black/45 text-white/78 backdrop-blur-md"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void capturePhoto()}
                        aria-label="Photograph card"
                        className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-[5px] border-white bg-[var(--dc-primary)] text-white shadow-[0_0_0_5px_rgba(0,0,0,0.28),0_12px_30px_rgba(0,0,0,0.42)]"
                      >
                        <Aperture className="h-7 w-7" />
                      </button>
                      <div className="flex gap-2">
                        {torchSupported ? (
                          <button
                            type="button"
                            onClick={toggleTorch}
                            aria-label={torchEnabled ? "Turn flashlight off" : "Turn flashlight on"}
                            aria-pressed={torchEnabled}
                            className={`flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-md transition ${
                              torchEnabled
                                ? "border-[rgb(var(--dc-primary-soft-rgb)/0.8)] bg-[var(--dc-primary)] text-white shadow-[0_0_24px_rgb(var(--dc-primary-rgb)/0.36)]"
                                : "border-white/18 bg-black/45 text-white/78"
                            }`}
                          >
                            <Flashlight className="h-5 w-5" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          aria-label="Choose photo"
                          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/18 bg-black/45 text-white/78 backdrop-blur-md"
                        >
                          <ImagePlus className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    {cameraError ? (
                      <p
                        role="alert"
                        className="absolute inset-x-4 top-4 rounded-2xl border border-amber-200/20 bg-black/70 px-4 py-3 text-center text-xs font-bold text-amber-100 backdrop-blur-md"
                      >
                        {cameraError}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {(stage === "preview" || stage === "analyzing") && previewUrl ? (
                  <div className="relative grid min-h-[32rem] place-items-center overflow-hidden bg-[rgb(var(--dc-bg-main-rgb)/0.62)] p-5 sm:min-h-[38rem] sm:p-8">
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgb(var(--dc-primary-rgb)/0.15),transparent_50%)]"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Card ready to scan"
                      className="relative max-h-[34rem] max-w-full rounded-[5%] object-contain shadow-[0_28px_70px_rgba(0,0,0,0.48)]"
                    />
                    {stage === "analyzing" ? (
                      <div className="absolute inset-0 grid place-items-center bg-[rgb(var(--dc-bg-main-rgb)/0.78)] p-5 backdrop-blur-md">
                        <div className="w-full max-w-sm rounded-[24px] border border-[rgb(var(--dc-primary-soft-rgb)/0.24)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.94)] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.52)]">
                          <div className="flex items-center gap-3">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--dc-primary-rgb)/0.14)] text-[var(--dc-primary-soft)]">
                              <LoaderCircle className="h-6 w-6 motion-safe:animate-spin" />
                            </span>
                            <div>
                              <p className="text-base font-black">Identifying your card</p>
                              <p className="text-xs text-[var(--dc-text-muted)]">
                                Usually 3–5 seconds · photo is not stored.
                              </p>
                            </div>
                          </div>
                          <div className="mt-5 grid gap-2">
                            {ANALYSIS_STEPS.map((label, index) => {
                              const complete = index < analysisStep;
                              const active = index === analysisStep;
                              return (
                                <div
                                  key={label}
                                  className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 text-xs font-bold transition ${
                                    active
                                      ? "border-[rgb(var(--dc-primary-soft-rgb)/0.32)] bg-[rgb(var(--dc-primary-rgb)/0.11)] text-[var(--dc-text-primary)]"
                                      : "border-[rgb(var(--dc-border-rgb)/0.72)] bg-[rgb(var(--dc-bg-main-rgb)/0.28)] text-[var(--dc-text-muted)]"
                                  }`}
                                >
                                  <span
                                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                                      complete
                                        ? "bg-[rgb(var(--dc-success-rgb)/0.15)] text-[var(--dc-success-hover)]"
                                        : active
                                          ? "bg-[rgb(var(--dc-primary-rgb)/0.2)] text-[var(--dc-primary-soft)]"
                                          : "bg-[rgb(var(--dc-surface-hover-rgb)/0.72)]"
                                    }`}
                                  >
                                    {complete ? (
                                      <Check className="h-3.5 w-3.5" />
                                    ) : (
                                      index + 1
                                    )}
                                  </span>
                                  {label}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {stage === "preview" ? (
                  <div className="grid gap-2 border-t border-[rgb(var(--dc-border-rgb)/0.86)] bg-[rgb(var(--dc-surface-primary-rgb)/0.82)] p-3 sm:grid-cols-[1fr_auto]">
                    <button
                      type="button"
                      onClick={() => void analyzePhoto()}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--dc-primary-gradient)] px-5 text-sm font-black text-white shadow-[0_10px_26px_rgb(var(--dc-primary-rgb)/0.22)]"
                    >
                      <Sparkles className="h-5 w-5" />
                      Identify this card
                    </button>
                    <button
                      type="button"
                      onClick={resetScanner}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.95)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] px-5 text-sm font-bold text-[var(--dc-text-secondary)]"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      Retake
                    </button>
                  </div>
                ) : null}
              </div>

              <aside className="grid content-start gap-3">
                <section className="binder-panel rounded-[var(--ui-page-header-radius)] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--dc-primary-soft)]">
                    Better matches
                  </p>
                  <div className="mt-4 grid gap-3">
                    {[
                      "Keep the card flat and fill the frame.",
                      "Make the name and bottom card number readable.",
                      "Move slightly if a sleeve or holo catches glare.",
                    ].map((tip, index) => (
                      <div key={tip} className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--dc-primary-rgb)/0.12)] text-[10px] font-black text-[var(--dc-primary-soft)]">
                          {index + 1}
                        </span>
                        <p className="text-xs leading-relaxed text-[var(--dc-text-muted)]">
                          {tip}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="rounded-[var(--ui-page-header-radius)] border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[rgb(var(--dc-surface-primary-rgb)/0.55)] p-4">
                  <div className="flex gap-3">
                    <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dc-success-hover)]" />
                    <div>
                      <p className="text-xs font-black">Private by design</p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--dc-text-muted)]">
                        Your photo is processed only for this scan. DustyCards does not
                        save it to your account.
                      </p>
                    </div>
                  </div>
                </section>
              </aside>
            </section>
          )}

          {(stage === "results" || stage === "empty" || stage === "error") && (
            <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
              {stage === "results" && selectedMatch ? (
                <article className="binder-panel overflow-hidden rounded-[var(--ui-page-header-radius)]">
                  <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-4 p-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-5 sm:p-6">
                    <ScannerArtwork
                      match={selectedMatch}
                      sizes="(max-width: 640px) 44vw, 192px"
                      priority
                    />
                    <div className="min-w-0 self-center">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-[10px] font-black uppercase tracking-[0.1em] ${confidenceClasses(selectedMatch)}`}
                        >
                          {confidenceLabel(selectedMatch)}
                        </span>
                        <span className="text-xs font-bold tabular-nums text-[var(--dc-text-disabled)]">
                          Match score {Math.round(selectedMatch.score)}
                          {processingMs != null
                            ? ` · ${(processingMs / 1_000).toFixed(1)}s`
                            : ""}
                        </span>
                      </div>
                      <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">
                        {selectedMatch.name}
                      </h2>
                      <p className="mt-1 text-sm font-semibold text-[var(--dc-text-muted)]">
                        {selectedMatch.episode.name}
                        {selectedMatch.card_number
                          ? ` · #${selectedMatch.card_number}`
                          : ""}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedMatch.reasons.map((reason) => (
                          <span
                            key={reason}
                            className="rounded-full border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[rgb(var(--dc-surface-hover-rgb)/0.52)] px-2.5 py-1 text-[10px] font-bold text-[var(--dc-text-secondary)]"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                      <div className="mt-5 flex items-end justify-between gap-3 border-t border-[rgb(var(--dc-border-rgb)/0.75)] pt-4">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--dc-text-disabled)]">
                            English NM
                          </p>
                          <p className="mt-1 text-2xl font-black tabular-nums">
                            {selectedMatch.price != null
                              ? formatCurrency(selectedMatch.price, "EUR")
                              : "No price"}
                          </p>
                        </div>
                        {selectedMatch.rarity ? (
                          <span className="max-w-40 text-right text-xs font-bold text-[var(--dc-primary-soft)]">
                            {selectedMatch.rarity}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-2 border-t border-[rgb(var(--dc-border-rgb)/0.86)] bg-[rgb(var(--dc-surface-primary-rgb)/0.8)] p-3">
                    <button
                      type="button"
                      onClick={() => continueScanning(selectedMatch)}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--dc-primary-gradient)] px-5 text-sm font-black text-white shadow-[0_10px_28px_rgb(var(--dc-primary-rgb)/0.22)]"
                    >
                      <CheckCircle2 className="h-5 w-5" />
                      {cameraSessionActive ? "Confirm & scan next" : "Confirm match"}
                    </button>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <CollectionAddCardButton
                        card={cardRef(selectedMatch)}
                        mode="button"
                        label="Add copy"
                        onAdded={() => continueScanning()}
                        className="min-h-12 w-full rounded-2xl"
                      />
                      <CollectionWantButton
                        card={cardRef(selectedMatch)}
                        mode="button"
                        initialWanted={Boolean(selectedMatch.want_item)}
                        wantItemId={selectedMatch.want_item?.id ?? null}
                        onChanged={(wantItem) => {
                          if (wantItem) continueScanning();
                        }}
                        className="min-h-12 w-full rounded-2xl"
                      />
                      <button
                        type="button"
                        onClick={() => openCardDetails(selectedMatch)}
                        disabled={openingCardId === selectedMatch.id}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.95)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.72)] px-4 text-sm font-black text-[var(--dc-text-secondary)] transition hover:border-[rgb(var(--dc-border-hover-rgb)/0.95)] hover:text-[var(--dc-text-primary)] disabled:opacity-60"
                      >
                        {openingCardId === selectedMatch.id ? (
                          <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" />
                        ) : (
                          <ArrowRight className="h-4 w-4" />
                        )}
                        Open details
                      </button>
                    </div>
                  </div>
                </article>
              ) : (
                <div className="binder-panel grid min-h-[28rem] place-items-center rounded-[var(--ui-page-header-radius)] p-6 text-center">
                  <div className="max-w-md">
                    <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-[rgb(var(--dc-border-rgb)/0.95)] bg-[rgb(var(--dc-surface-hover-rgb)/0.56)] text-[var(--dc-text-muted)]">
                      {stage === "error" ? (
                        <X className="h-7 w-7" />
                      ) : (
                        <Search className="h-7 w-7" />
                      )}
                    </span>
                    <h2 className="mt-5 text-2xl font-black">
                      {stage === "error"
                        ? "This scan needs another try"
                        : "No confident match yet"}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--dc-text-muted)]">
                      {error ??
                        "The name or card number was not clear enough. Retake the photo closer and reduce glare."}
                    </p>
                    <div className="mt-6 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => continueScanning()}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--dc-primary-gradient)] px-5 text-sm font-black text-white"
                      >
                        <RefreshCcw className="h-4 w-4" />
                        Scan again
                      </button>
                      <Link
                        href={
                          manualSearchQuery
                            ? `/search?q=${encodeURIComponent(manualSearchQuery)}`
                            : "/search"
                        }
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.95)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] px-5 text-sm font-black text-[var(--dc-text-secondary)]"
                      >
                        <Search className="h-4 w-4" />
                        Search manually
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              <aside className="grid content-start gap-3">
                {stage === "results" ? (
                  <section className="binder-panel rounded-[var(--ui-page-header-radius)] p-3">
                    <div className="flex items-center justify-between gap-3 px-1 pb-2">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--dc-primary-soft)]">
                          Confirm printing
                        </p>
                        <h3 className="mt-0.5 text-base font-black">Best matches</h3>
                      </div>
                      <span className="text-xs font-black tabular-nums text-[var(--dc-text-disabled)]">
                        {matches.length}
                      </span>
                    </div>
                    <div className="grid gap-2">
                      {matches.map((match, index) => {
                        const active = match.id === selectedMatch?.id;
                        return (
                          <button
                            key={match.id}
                            type="button"
                            onClick={() => setSelectedId(match.id)}
                            aria-pressed={active}
                            className={`grid min-h-[6.5rem] grid-cols-[4.35rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-2 text-left transition ${
                              active
                                ? "border-[rgb(var(--dc-primary-soft-rgb)/0.45)] bg-[rgb(var(--dc-primary-rgb)/0.12)] shadow-[0_9px_24px_rgb(var(--dc-primary-rgb)/0.12)]"
                                : "border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-bg-main-rgb)/0.3)] hover:border-[rgb(var(--dc-border-hover-rgb)/0.95)]"
                            }`}
                          >
                            <ScannerArtwork
                              match={match}
                              sizes="70px"
                              priority={index < 2}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-black">
                                {match.name}
                              </span>
                              <span className="mt-1 block truncate text-[11px] font-semibold text-[var(--dc-text-muted)]">
                                {match.episode.name}
                              </span>
                              <span className="mt-1 block text-[10px] font-bold tabular-nums text-[var(--dc-text-disabled)]">
                                {match.card_number ? `#${match.card_number}` : "No number"}
                                {" · "}
                                Score {Math.round(match.score)}
                              </span>
                            </span>
                            <ChevronRight
                              className={`h-4 w-4 ${
                                active
                                  ? "text-[var(--dc-primary-soft)]"
                                  : "text-[var(--dc-text-disabled)]"
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                <button
                  type="button"
                  onClick={() => continueScanning()}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.95)] bg-[rgb(var(--dc-surface-primary-rgb)/0.64)] px-4 text-sm font-black text-[var(--dc-text-secondary)] transition hover:text-[var(--dc-text-primary)]"
                >
                  <ScanLine className="h-4 w-4" />
                  {cameraSessionActive ? "Back to camera" : "Scan another card"}
                </button>
              </aside>
            </section>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
          capture="environment"
          className="sr-only"
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
        <canvas ref={readinessCanvasRef} className="hidden" aria-hidden="true" />
        <canvas ref={fieldCanvasRef} className="hidden" aria-hidden="true" />
      </div>

      {selectedModalCard ? (
        <CardModal
          key={selectedModalCard.id}
          card={selectedModalCard}
          backLabel="Back to Scanner"
          onClose={() => setSelectedModalCard(null)}
        />
      ) : null}
    </>
  );
}
