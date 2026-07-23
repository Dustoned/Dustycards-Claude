import type { Metadata } from "next";
import CardScannerClient from "@/app/scan/CardScannerClient";

export const metadata: Metadata = {
  title: "Card Scanner | DustyCards",
  description: "Scan a trading card and match it to the DustyCards catalog.",
};

export default function CardScannerPage() {
  return <CardScannerClient />;
}
