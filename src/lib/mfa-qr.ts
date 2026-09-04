import "server-only";
import QRCode from "qrcode";

export function buildMfaQrCode(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 256,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
