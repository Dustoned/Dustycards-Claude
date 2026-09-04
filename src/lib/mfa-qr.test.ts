import { expect, test } from "vitest";
import sharp from "sharp";
import jsQR from "jsqr";
import { buildMfaQrCode } from "./mfa-qr";
import { buildTotpUri } from "./mfa";

test("authenticator QR decodes to the full URI including encoded account name", async () => {
  const uri = buildTotpUri("collector+cards@example.test", "JBSWY3DPEHPK3PXP");
  const image = await buildMfaQrCode(uri);
  expect(image).toMatch(/^data:image\/png;base64,/);
  const { data, info } = await sharp(Buffer.from(image.split(",")[1], "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(uri);
});
