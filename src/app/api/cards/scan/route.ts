import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  CARD_SCANNER_MAX_UPLOAD_BYTES,
  type CardScannerField,
  type CardScannerFieldResponse,
  type CardScannerResponse,
} from "@/lib/card-scanner";
import {
  readScannerFieldImage,
  scanCardImage,
} from "@/lib/card-scanner-server";
import { CARD_SCANNER_ENABLED } from "@/lib/feature-flags";
import { normalizeTradingCardGame } from "@/lib/games";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(request: Request) {
  const startedAt = Date.now();
  if (!CARD_SCANNER_ENABLED) {
    return NextResponse.json(
      { ok: false, error: "The Card Scanner is temporarily disabled." },
      { status: 503 }
    );
  }
  try {
    const user = await requireUser();
    const body = await request.formData();
    const file = body.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Choose or photograph a card first." },
        { status: 400 }
      );
    }
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { ok: false, error: "Use a JPG, PNG, WebP, AVIF or HEIC photo." },
        { status: 415 }
      );
    }
    if (file.size <= 0 || file.size > CARD_SCANNER_MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, error: "The image must be smaller than 10 MB." },
        { status: 413 }
      );
    }

    const image = Buffer.from(await file.arrayBuffer());
    const game = normalizeTradingCardGame(String(body.get("game") ?? ""));
    const mode = String(body.get("mode") ?? "match");
    if (mode === "field") {
      const field = String(body.get("field") ?? "") as CardScannerField;
      if (field !== "name" && field !== "number" && field !== "attack") {
        return NextResponse.json(
          { ok: false, error: "Choose a scanner field." },
          { status: 400 }
        );
      }
      const fieldResult = await readScannerFieldImage({
        image,
        game,
        field,
        scanRegion:
          String(body.get("scanRegion") ?? "") === "focus"
            ? "focus"
            : "expected",
        knownName: String(body.get("knownName") ?? "") || null,
        knownReference: String(body.get("knownReference") ?? "") || null,
      });
      const response: CardScannerFieldResponse = {
        ok: true,
        result: {
          ...fieldResult,
          processingMs: Date.now() - startedAt,
        },
      };
      return NextResponse.json(response);
    }

    const result = await scanCardImage({
      image,
      game,
      userId: user.id,
      knownName: String(body.get("knownName") ?? "") || null,
      knownReference: String(body.get("knownReference") ?? "") || null,
      knownAttackText: String(body.get("knownAttackText") ?? "") || null,
    });
    const response: CardScannerResponse = {
      ok: true,
      result: {
        ...result,
        processingMs: Date.now() - startedAt,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[card-scanner] scan failed:", message);
    return NextResponse.json(
      {
        ok: false,
        error:
          message.includes("unsupported image format") || message.includes("Input buffer")
            ? "This photo could not be read. Try JPG or PNG instead."
            : "The card could not be scanned. Try a sharper photo with less glare.",
      },
      { status: 500 }
    );
  }
}
