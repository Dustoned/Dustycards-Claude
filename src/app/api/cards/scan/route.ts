import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  CARD_SCANNER_MAX_UPLOAD_BYTES,
  type CardScannerResponse,
} from "@/lib/card-scanner";
import { scanCardImage } from "@/lib/card-scanner-server";
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

    const result = await scanCardImage({
      image: Buffer.from(await file.arrayBuffer()),
      game: normalizeTradingCardGame(String(body.get("game") ?? "")),
      userId: user.id,
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
