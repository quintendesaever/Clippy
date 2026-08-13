import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const logoPath = path.resolve(root, "dashboard/src/assets/logoicon_clippy_01@2x.png");
const outPath = path.resolve(root, "assets/timetable/empty-day.png");

const WIDTH = 1100;
const OUTER_PAD_X = 14;
const OUTER_PAD_TOP = 14;
const OUTER_PAD_BOTTOM = 12;
const ROW_HEIGHT = 112;
const dark = "#1C1D22";
const muted = "#949ba4";
const font = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const message = "Geen lessen of activiteiten op deze dag.";
const LOGO_SIZE = 64;
const MESSAGE_FONT_SIZE = 28;

const svgWidth = WIDTH + 2 * OUTER_PAD_X;
const svgHeight = ROW_HEIGHT + OUTER_PAD_TOP + OUTER_PAD_BOTTOM;

const logoPng = await sharp(readFileSync(logoPath))
  .resize(LOGO_SIZE, LOGO_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const logoDataUrl = `data:image/png;base64,${logoPng.toString("base64")}`;

const gap = 16;
const textApproxWidth = message.length * (MESSAGE_FONT_SIZE * 0.55);
const blockWidth = LOGO_SIZE + gap + textApproxWidth;
const blockLeft = (WIDTH - blockWidth) / 2;
const logoX = blockLeft;
const logoY = (ROW_HEIGHT - LOGO_SIZE) / 2;
const textX = blockLeft + LOGO_SIZE + gap;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="100%" height="100%" fill="${dark}"/>
  <g transform="translate(${OUTER_PAD_X}, ${OUTER_PAD_TOP})">
    <image href="${logoDataUrl}" x="${logoX}" y="${logoY}" width="${LOGO_SIZE}" height="${LOGO_SIZE}"/>
    <text x="${textX}" y="${ROW_HEIGHT / 2 + MESSAGE_FONT_SIZE * 0.35}" fill="${muted}" font-size="${MESSAGE_FONT_SIZE}" font-weight="400" text-anchor="start" font-family="${font}">${message}</text>
  </g>
</svg>`;

mkdirSync(path.dirname(outPath), { recursive: true });
const png = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(outPath, png);
console.log(`Wrote ${outPath} (${png.length} bytes)`);
