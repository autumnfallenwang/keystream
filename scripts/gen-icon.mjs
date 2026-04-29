// One-off icon generator. Reads an inline SVG design, renders it to a 1024x1024
// PNG at `src-tauri/icons/_source.png`, then `pnpm tauri icon` regenerates the
// full multi-platform icon set from that source.
//
// Design: white rounded-square background with a coloured pencil glyph drawn
// in flat, geometric style, **tip pointing down** (a pencil mid-write). The
// pencil nods to the app's job — typing text into a target — without being
// literal about keyboards or VMs. Single foreground colour family on white;
// reads cleanly at 32px.
//
// Geometry: the pencil is sized to fill ~75% of the canvas height, mirroring
// teacherease's pennant proportions. Built in pencil-space along the +y axis
// (eraser at the top, tip at the bottom), then rotated slightly off-vertical
// for visual interest. The pencil center is the canvas center.
//
// Usage:
//   node scripts/gen-icon.mjs
//   pnpm tauri icon src-tauri/icons/_source.png

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const Dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(Dirname, "..");

const SIZE = 1024;
const RADIUS = 229; // matches teacherease and macOS Big Sur radius (full canvas).

// Subtle off-white background — pure white reads "smaller" against the
// dock because there's no edge between the rounded square and the
// dock's translucent backdrop. A faint cool tint (atelier-light's
// canvas) gives the icon perceptual presence at the same geometric
// size as teacherease's ivory background.
const BG = "#F5F5FA";
const FG = "#6A86FF"; // accent — pencil body
const FG_DARK = "#5570E8"; // accent-press — graphite tip + ferrule
const FG_LIGHT = "#7E98FF"; // accent-hover — eraser cap + wood point

// Pencil geometry — original sizing that read at the right visual weight
// in the dock (matched neighbour icons). The values predate the "match
// teacherease" detour and are the empirical good answer.
//
// Built in pencil-space along the +y axis: eraser at top (y < 0), tip
// at bottom (y > 0). Center sits at the canvas center. Rotated -10°
// (slight lean to the right) for motion without disorienting the reader.
const PENCIL_LEN = 720;
const PENCIL_WIDTH = 140;
const TIP_LEN = 130; // length of the pointed wood tip
const TIP_GRAPHITE_LEN = 35; // length of the dark graphite at the very point
const ERASER_LEN = 130; // length of the eraser end (rounded-rect cap)

// In pencil-space (axis-aligned, +y points down toward the tip):
//   y = -L/2  : top of eraser
//   y = -L/2 + ERASER_LEN  : ferrule (transition eraser → wood)
//   y =  L/2 - TIP_LEN  : start of the wood tip
//   y =  L/2  : graphite point (sharpest end)
const HALF = PENCIL_LEN / 2;
const HALF_W = PENCIL_WIDTH / 2;

const eraserTopY = -HALF;
const eraserBottomY = -HALF + ERASER_LEN;
const tipBaseY = HALF - TIP_LEN;
const tipPointY = HALF;
const graphiteBaseY = HALF - TIP_GRAPHITE_LEN;

// Pencil body — between ferrule and tip base.
const bodyPath = `M ${-HALF_W} ${eraserBottomY}
                  L ${HALF_W} ${eraserBottomY}
                  L ${HALF_W} ${tipBaseY}
                  L ${-HALF_W} ${tipBaseY} Z`;

// Tip (the wood point). Triangle from tipBaseY out to tipPointY.
const tipPath = `M ${-HALF_W} ${tipBaseY}
                 L 0 ${tipPointY}
                 L ${HALF_W} ${tipBaseY} Z`;

// Graphite (dark sliver at the very point). Smaller triangle nested in tip.
// Width scales with the proportion of remaining tip length.
const graphiteW = HALF_W * (TIP_GRAPHITE_LEN / TIP_LEN);
const graphitePath = `M ${-graphiteW} ${graphiteBaseY}
                      L 0 ${tipPointY}
                      L ${graphiteW} ${graphiteBaseY} Z`;

// Eraser (rounded-rect cap on the back end).
const ERASER_RADIUS = HALF_W;
const eraserSvg = `<rect x="${-HALF_W}" y="${eraserTopY}"
                         width="${PENCIL_WIDTH}" height="${ERASER_LEN}"
                         rx="${ERASER_RADIUS}" ry="${ERASER_RADIUS}"
                         fill="${FG_LIGHT}"/>`;

// Ferrule (the metal band between eraser and body). Slightly darker stripe.
const ferruleH = 38;
const ferruleSvg = `<rect x="${-HALF_W}" y="${eraserBottomY - ferruleH / 2}"
                          width="${PENCIL_WIDTH}" height="${ferruleH}"
                          fill="${FG_DARK}"/>`;

const cx = SIZE / 2;
const cy = SIZE / 2;
const ROT = -10; // degrees — slight right-leaning lean from vertical

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <!-- Off-white rounded-square fills the full canvas (matches
       teacherease's geometry). The pencil is sized smaller than
       the glyph would normally fill so it reads at the same visual
       weight as other dock icons. -->
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}"
        rx="${RADIUS}" ry="${RADIUS}" fill="${BG}"/>

  <!-- Pencil group: rotated -10° around centre, tip pointing down -->
  <g transform="translate(${cx} ${cy}) rotate(${ROT})">
    ${eraserSvg}
    ${ferruleSvg}
    <path d="${bodyPath}" fill="${FG}"/>
    <path d="${tipPath}" fill="${FG_LIGHT}"/>
    <path d="${graphitePath}" fill="${FG_DARK}"/>
  </g>
</svg>`;

const outPath = resolve(REPO_ROOT, "src-tauri/icons/_source.png");
writeFileSync(outPath.replace(/\.png$/, ".svg"), svg);
await sharp(Buffer.from(svg)).png().resize(SIZE, SIZE).toFile(outPath);
console.log(`wrote ${outPath}`);
console.log(`next: pnpm tauri icon ${outPath}`);
