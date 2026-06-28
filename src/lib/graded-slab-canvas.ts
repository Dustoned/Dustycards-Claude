// Pure 2D-canvas drawing helpers for graded-slab label textures. Kept free of
// any three.js dependency so the same routines can be unit-rendered onto a
// plain <canvas> for visual QA, then wrapped in a THREE.CanvasTexture by the
// 3D viewer. Coordinates are passed through a scale helper `s` so the caller
// controls the texture resolution.

type Scale = (value: number) => number;

export function drawPsaLogoMark(
  context: CanvasRenderingContext2D,
  centerX: number,
  baselineY: number,
  fontSize: number
) {
  const drawLetter = (letter: string, x: number, color: string, scale = 1) => {
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

export function drawLabelBarcode(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  height: number,
  maxWidth: number
) {
  let cursorX = x;
  const limitX = x + maxWidth;
  const unit = Math.max(2, Math.round(height * 0.045));

  for (let index = 0; index < 74 && cursorX < limitX; index += 1) {
    const digit = Number(value[index % value.length] ?? 1);
    const width = unit + (digit % 4) * unit;
    context.fillStyle = digit % 2 === 0 ? "#101828" : "#344054";
    context.fillRect(cursorX, y, width, height);
    cursorX += width + unit + (digit % 3) * unit;
  }
}

function drawFugitiveInk(context: CanvasRenderingContext2D, s: Scale, w: number, h: number) {
  context.save();
  context.beginPath();
  context.rect(s(18), s(18), w - s(36), h - s(36));
  context.clip();
  context.strokeStyle = "rgba(34,64,118,0.06)";
  context.lineWidth = s(1.2);
  for (let x = -h; x < w; x += s(14)) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + h, h);
    context.stroke();
  }
  context.restore();
}

function drawPsaShield(
  context: CanvasRenderingContext2D,
  s: Scale,
  centerX: number,
  topY: number,
  width: number,
  height: number
) {
  const halfW = width / 2;
  const left = centerX - halfW;
  const right = centerX + halfW;

  context.save();
  context.beginPath();
  context.moveTo(left, topY);
  context.lineTo(right, topY);
  context.lineTo(right, topY + height * 0.52);
  context.quadraticCurveTo(right, topY + height * 0.82, centerX, topY + height);
  context.quadraticCurveTo(left, topY + height * 0.82, left, topY + height * 0.52);
  context.closePath();

  const gradient = context.createLinearGradient(left, topY, right, topY + height);
  gradient.addColorStop(0, "#2a64bd");
  gradient.addColorStop(0.5, "#1f57ab");
  gradient.addColorStop(1, "#143c79");
  context.fillStyle = gradient;
  context.fill();
  context.lineJoin = "round";
  context.lineWidth = s(4);
  context.strokeStyle = "rgba(255,255,255,0.85)";
  context.stroke();

  context.fillStyle = "#ffffff";
  context.font = `900 ${height * 0.34}px Arial Black, Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("PSA", centerX, topY + height * 0.44);
  context.restore();
}

function drawQrBlock(
  context: CanvasRenderingContext2D,
  s: Scale,
  value: string,
  x: number,
  y: number,
  size: number
) {
  context.save();
  context.fillStyle = "#ffffff";
  context.fillRect(x - s(12), y - s(12), size + s(24), size + s(24));
  context.strokeStyle = "rgba(17,24,39,0.2)";
  context.lineWidth = s(2);
  context.strokeRect(x - s(12), y - s(12), size + s(24), size + s(24));

  const n = 11;
  const cell = size / n;
  context.fillStyle = "#0b1220";
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const finder =
        (row < 3 && col < 3) || (row < 3 && col >= n - 3) || (row >= n - 3 && col < 3);
      const seed = value.charCodeAt((row * 3 + col) % value.length);
      if (finder || (seed + row + col) % 3 === 0) {
        context.fillRect(x + col * cell, y + row * cell, cell * 0.9, cell * 0.9);
      }
    }
  }
  context.restore();
}

// Back of a PSA label, matching the real design: light body with a fugitive-ink
// hatch, a red PSA trim, faded "lighthouse" PSA logos on the left, a blue PSA
// shield in the centre, a QR code on the right, and barcode + cert at the
// bottom. Canvas is expected to be 1400x420 (before scale).
export function drawPsaSlabBack(
  context: CanvasRenderingContext2D,
  s: Scale,
  opts: { certNumber: string }
) {
  const W = s(1400);
  const H = s(420);

  context.clearRect(0, 0, W, H);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.fillStyle = "#f6f6f1";
  context.fillRect(s(8), s(8), W - s(16), H - s(16));

  drawFugitiveInk(context, s, W, H);

  context.strokeStyle = "#e01124";
  context.lineWidth = s(14);
  context.strokeRect(s(15), s(15), W - s(30), H - s(30));

  // LEFT — faded repeated lighthouse logos ("on/off illumination" watermark).
  context.save();
  context.globalAlpha = 0.15;
  drawPsaLogoMark(context, s(150), s(130), s(56));
  drawPsaLogoMark(context, s(310), s(120), s(48));
  drawPsaLogoMark(context, s(150), s(250), s(48));
  drawPsaLogoMark(context, s(310), s(255), s(56));
  context.restore();

  // CENTER — blue PSA shield.
  drawPsaShield(context, s, s(700), s(96), s(150), s(186));

  // RIGHT — QR code for cert verification.
  drawQrBlock(context, s, opts.certNumber, s(1086), s(70), s(196));
  context.fillStyle = "rgba(17,24,39,0.62)";
  context.font = `700 ${s(18)}px Arial, sans-serif`;
  context.textAlign = "center";
  context.fillText("SCAN TO VERIFY", s(1184), s(326));

  // BOTTOM — barcode (left) + cert number (right).
  drawLabelBarcode(context, opts.certNumber, s(60), s(312), s(50), s(470));
  context.fillStyle = "#101828";
  context.font = `900 ${s(30)}px Arial Black, Arial, sans-serif`;
  context.textAlign = "left";
  context.fillText(opts.certNumber, s(60), s(300));
  context.textAlign = "right";
  context.font = `900 ${s(34)}px Arial Black, Arial, sans-serif`;
  context.fillText(opts.certNumber, W - s(60), s(372));
}
