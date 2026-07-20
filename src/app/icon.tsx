import { ImageResponse } from "next/og";
import DustyCardsAppIcon from "@/components/DustyCardsAppIcon";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<DustyCardsAppIcon canvasSize={size.width} />, size);
}
