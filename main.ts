// main.ts — "THE WORLD IN ONE DAY — Thursday 19 November 2026"
// A program that draws a one-page newspaper front page summing up the
// world's news of Thursday 19 November 2026, and writes it as a PNG.
//
// Node 22, standard library only (node:fs, node:zlib). No network.
// Plain JavaScript syntax inside this .ts file (no TS-only features),
// so Node's type stripping runs it as-is.
// Deterministic: no Date, no Math.random, all content hard-coded.
// Two runs write byte-identical files.
//
// Technique: a 1024x1024 RGB framebuffer, a hand-defined 5x7 bitmap font
// rendered at several scales, simple geometric illustrations (flags,
// skyline, courthouse, stock chart, coarse world map, small scene icons),
// and a hand-written PNG encoder (IHDR/IDAT/IEND, zlib deflate).
// All text is English. All facts are from reporting of 19 Nov 2026.

import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------- canvas
const W = 1024;
const H = 1024;
const px = new Uint8Array(W * H * 3); // RGB, row-major

// Palette
const PAPER = [247, 243, 232]; // warm newsprint
const PAPER2 = [240, 234, 218]; // slightly darker panel
const INK = [22, 22, 22]; // near-black text
const RED = [178, 34, 34]; // headline red
const RED_DK = [140, 20, 20];
const BLUE = [30, 80, 160];
const BLUE_DK = [24, 58, 110];
const GREEN = [46, 125, 50];
const GOLD = [201, 162, 39];
const NAVY = [27, 42, 74]; // map sea
const TAN = [216, 196, 154]; // map land
const SKY = [168, 200, 224];
const SKY_DK = [58, 74, 90]; // skyline
const GREY = [120, 120, 116];
const GREY_LT = [200, 198, 188];
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const ORANGE = [214, 106, 0];
const TEAL = [14, 124, 123];

function setPx(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x, y, w, h, c) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      i += 3;
    }
  }
}

function hline(x, y, w, c, t) {
  fillRect(x, y, w, t === undefined ? 1 : t, c);
}

function vline(x, y, h, c, t) {
  fillRect(x, y, t === undefined ? 1 : t, h, c);
}

// Bresenham line
function line(x0, y0, x1, y1, c) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    setPx(x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// Thick line (draws a 2px-wide line by stroking twice)
function line2(x0, y0, x1, y1, c) {
  line(x0, y0, x1, y1, c);
  line(x0 + 1, y0, x1 + 1, y1, c);
}

// Filled circle
function circle(cx, cy, r, c) {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(r * r - dy * dy));
    for (let x = -dx; x <= dx; x++) setPx(cx + x, cy + dy, c);
  }
}

// Circle outline
function circleOutline(cx, cy, r, c) {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    setPx(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
  }
}

// Filled triangle
function triangle(x0, y0, x1, y1, x2, y2, c) {
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs = [];
    const edges = [
      [x0, y0, x1, y1],
      [x1, y1, x2, y2],
      [x2, y2, x0, y0],
    ];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    }
    if (xs.length >= 2) {
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      for (let x = Math.ceil(lo); x <= Math.floor(hi); x++) setPx(x, y, c);
    }
  }
}

// Filled 5-point star (asterisk-style polygon via 5 triangles)
function star(cx, cy, r, c) {
  for (let i = 0; i < 5; i++) {
    const a1 = (-90 + i * 72) * (Math.PI / 180);
    const a2 = (-90 + (i + 2) * 72) * (Math.PI / 180);
    triangle(
      cx, cy,
      Math.round(cx + r * Math.cos(a1)), Math.round(cy + r * Math.sin(a1)),
      Math.round(cx + r * Math.cos(a2)), Math.round(cy + r * Math.sin(a2)),
      c
    );
  }
  circle(cx, cy, Math.max(1, Math.round(r * 0.28)), c);
}

// Rect outline (1px)
function rectOutline(x, y, w, h, c) {
  hline(x, y, w, c, 1);
  hline(x, y + h - 1, w, c, 1);
  vline(x, y, h, c, 1);
  vline(x + w - 1, y, h, c, 1);
}

// ---------------------------------------------------------------- PNG
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  const crcBuf = Buffer.alloc(4 + data.length);
  crcBuf.write(type, 0, 4, "ascii");
  data.copy(crcBuf, 4);
  out.writeUInt32BE(crc32(crcBuf), 8 + data.length);
  return out;
}

function encodePNG() {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  // Raw scanlines: filter byte 0 + RGB per row
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- font
// Hand-defined 5x7 pixel font. Each glyph is 7 rows of 5 characters.
// '#' = ink, '.' = empty. Readable when scaled 2x and up.
const FONT = {
  "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  "C": [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  "G": [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "I": [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  "N": ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "...#.", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  "a": [".....", ".....", ".###.", "....#", ".####", "#...#", ".####"],
  "b": ["#....", "#....", "####.", "#...#", "#...#", "#...#", "####."],
  "c": [".....", ".....", ".####", "#....", "#....", "#....", ".####"],
  "d": ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
  "e": [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  "f": ["..##.", ".#..#", ".#...", "###..", ".#...", ".#...", ".#..."],
  "g": [".....", ".####", "#...#", "#...#", ".####", "....#", ".###."],
  "h": ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#"],
  "i": ["..#..", ".....", ".##..", "..#..", "..#..", "..#..", ".###."],
  "j": ["...#.", ".....", "..##.", "...#.", "...#.", "...#.", ".##.."],
  "k": ["#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#."],
  "l": [".##..", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "m": [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#"],
  "n": [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
  "o": [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
  "p": [".....", ".....", "####.", "#...#", "#...#", "####.", "#...."],
  "q": [".....", ".....", ".####", "#...#", "#...#", ".####", "....#"],
  "r": [".....", ".....", "#.##.", "##..#", "#....", "#....", "#...."],
  "s": [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
  "t": [".#...", ".#...", "###..", ".#...", ".#...", ".#...", "..##."],
  "u": [".....", ".....", "#...#", "#...#", "#...#", "#..##", ".##.#"],
  "v": [".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  "w": [".....", ".....", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  "x": [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  "y": [".....", ".....", "#...#", "#...#", ".####", "....#", ".###."],
  "z": [".....", ".....", "#####", "....#", "...#.", "..#..", "#####"],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#..."],
  "'": ["..#..", "..#..", "..#..", ".....", ".....", ".....", "....."],
  '"': [".#.#.", ".#.#.", ".#.#.", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  "—": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "(": ["...##", "..#..", ".#...", ".#...", ".#...", "..#..", "...##"],
  ")": ["##...", "..#..", "...#.", "...#.", "...#.", "..#..", "##..."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "%": ["##...", "##...", "..#..", ".#...", "#....", "...##", "...##"],
  "$": ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "&": [".##..", "#..#.", "#..#.", ".#...", "#.#.#", "#..#.", ".##.#"],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "+": [".....", "..#..", "..#..", ".###.", "..#..", "..#..", "....."],
  "=": [".....", ".....", ".###.", ".....", ".###.", ".....", "....."],
  "@": [".###.", "#...#", "#.###", "#.#.#", "#.##.", "#....", ".###."],
  "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
  "*": [".....", ".#.#.", ".###.", "#####", ".###.", ".#.#.", "....."],
  "·": [".....", ".....", ".....", ".##..", ".##..", ".....", "....."],
  "€": [".####", "#....", "#....", "###..", "#....", "#....", ".####"],
  "£": ["..##.", ".#...", "#....", "###..", "#....", "#....", "####."],
};

// Normalize curly quotes/dashes to the glyphs we have.
function normChar(ch) {
  if (ch === "’" || ch === "‘" || ch === "`") return "'";
  if (ch === "“" || ch === "”") return '"';
  if (ch === "–") return "-";
  return ch;
}

const CHAR_ADV = 6; // 5px glyph + 1px gap, times scale

function drawChar(x, y, ch, scale, color) {
  const g = FONT[normChar(ch)] || FONT["?"];
  for (let r = 0; r < 7; r++) {
    const row = g[r];
    for (let c = 0; c < 5; c++) {
      if (row[c] === "#") fillRect(x + c * scale, y + r * scale, scale, scale, color);
    }
  }
}

function textWidth(s, scale) {
  return s.length * CHAR_ADV * scale;
}

// Draw one line of text (no wrap). Returns width used.
function drawText(x, y, s, scale, color) {
  let cx = x;
  for (const ch of s) {
    drawChar(cx, y, ch, scale, color);
    cx += CHAR_ADV * scale;
  }
  return cx - x;
}

function drawTextCentered(cx, y, s, scale, color) {
  const w = textWidth(s, scale);
  return drawText(cx - Math.floor(w / 2), y, s, scale, color);
}

// Word-wrap text into lines that fit maxW. Returns array of lines.
function wrapText(s, maxW, scale) {
  const maxChars = Math.max(1, Math.floor(maxW / (CHAR_ADV * scale)));
  const words = s.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (cur === "") {
      cur = w;
    } else if (cur.length + 1 + w.length <= maxChars) {
      cur += " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// Draw wrapped text. Returns total height used.
function drawWrapped(x, y, maxW, s, scale, color, leading) {
  const lh = 7 * scale + (leading === undefined ? 2 : leading);
  const lines = wrapText(s, maxW, scale);
  for (let i = 0; i < lines.length; i++) drawText(x, y + i * lh, lines[i], scale, color);
  return lines.length * lh;
}

// ---------------------------------------------------------------- illustrations
// All drawn from simple shapes. No external images, no network.

// --- flags (x, y, w, h) ---
function flagUS(x, y, w, h) {
  const stripeH = h / 13;
  for (let i = 0; i < 13; i++) {
    fillRect(x, Math.round(y + i * stripeH), w, Math.ceil(stripeH), i % 2 === 0 ? [178, 34, 34] : WHITE);
  }
  const cw = Math.round(w * 0.4);
  const ch = Math.round(h * 7 / 13);
  fillRect(x, y, cw, ch, BLUE_DK);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      fillRect(x + 3 + c * 5, y + 3 + r * 5, 2, 2, WHITE);
    }
  }
  rectOutline(x, y, w, h, INK);
}

function flagCN(x, y, w, h) {
  fillRect(x, y, w, h, [222, 0, 0]);
  star(x + Math.round(w * 0.22), y + Math.round(h * 0.28), Math.round(h * 0.22), [255, 222, 0]);
  for (const [fx, fy] of [[0.52, 0.14], [0.64, 0.26], [0.64, 0.44], [0.52, 0.56]]) {
    star(x + Math.round(w * fx), y + Math.round(h * fy), Math.max(2, Math.round(h * 0.08)), [255, 222, 0]);
  }
  rectOutline(x, y, w, h, INK);
}

function flagRU(x, y, w, h) {
  fillRect(x, y, w, Math.ceil(h / 3), WHITE);
  fillRect(x, y + Math.floor(h / 3), w, Math.ceil(h / 3), [0, 57, 166]);
  fillRect(x, y + Math.floor((2 * h) / 3), w, Math.ceil(h / 3), [213, 0, 0]);
  rectOutline(x, y, w, h, INK);
}

// --- NASDAQ chart panel ---
function drawChartPanel(x, y, w, h) {
  fillRect(x, y, w, h, [11, 61, 46]); // dark green
  // candlesticks
  const bars = [
    [0, 0.72, 0.62, 1], [1, 0.66, 0.58, 1], [2, 0.6, 0.66, 0], [3, 0.55, 0.46, 1],
    [4, 0.5, 0.56, 0], [5, 0.44, 0.36, 1], [6, 0.38, 0.42, 0], [7, 0.3, 0.24, 1],
  ];
  const bw = Math.floor(w / 10);
  for (const [i, top, bot, up] of bars) {
    const bx = x + 8 + i * bw;
    const by1 = y + Math.round(h * top);
    const by2 = y + Math.round(h * bot);
    const col = up ? [46, 204, 113] : [231, 76, 60];
    fillRect(bx, by1, Math.max(4, bw - 6), Math.max(4, by2 - by1), col);
    vline(bx + Math.floor((bw - 6) / 2), y + Math.round(h * (top - 0.06)), Math.round(h * (bot - top + 0.12)), col, 2);
  }
  // rising trend line
  const pts = [
    [x + 6, y + h - 18], [x + 40, y + h - 34], [x + 80, y + h - 26],
    [x + 120, y + h - 48], [x + 170, y + h - 40], [x + 220, y + h - 62],
    [x + 270, y + h - 56], [x + w - 8, y + 14],
  ];
  for (let i = 0; i < pts.length - 1; i++) line2(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], [255, 209, 102]);
  drawText(x + 10, y + 8, "ANT", 2, WHITE);
  drawText(x + w - 62, y + 8, "$83", 2, [255, 209, 102]);
  drawText(x + 10, y + h - 18, "NASDAQ · FIRST TRADES TODAY", 1, [180, 220, 190]);
}

// --- courthouse panel ---
function drawCourtPanel(x, y, w, h) {
  fillRect(x, y, w, h, [232, 228, 214]);
  const cx = x + Math.floor(w / 2);
  const baseY = y + h - 14;
  // steps
  fillRect(x + 30, baseY, w - 60, 6, GREY);
  fillRect(x + 40, baseY - 6, w - 80, 6, [150, 148, 138]);
  // columns
  for (let i = 0; i < 4; i++) {
    const colX = x + 44 + i * Math.floor((w - 88) / 3);
    fillRect(colX, y + 34, 14, baseY - 6 - (y + 34), WHITE);
    rectOutline(colX, y + 34, 14, baseY - 6 - (y + 34), INK);
  }
  // entablature + pediment
  fillRect(x + 30, y + 26, w - 60, 8, WHITE);
  rectOutline(x + 30, y + 26, w - 60, 8, INK);
  triangle(cx - 70, y + 26, cx + 70, y + 26, cx, y + 6, WHITE);
  line(cx - 70, y + 26, cx, y + 6, INK);
  line(cx + 70, y + 26, cx, y + 6, INK);
  // scales of justice on top
  circle(cx, y + 4, 2, GOLD);
}

// --- Shenzhen summit panel: skyline + three flags ---
function drawSummitPanel(x, y, w, h) {
  fillRect(x, y, w, h, SKY);
  // skyline
  const heights = [0.42, 0.58, 0.36, 0.66, 0.48, 0.72, 0.4, 0.6, 0.34, 0.55];
  const bw = Math.floor(w / heights.length);
  for (let i = 0; i < heights.length; i++) {
    const bh = Math.round(h * heights[i]);
    fillRect(x + i * bw + 1, y + h - bh, bw - 2, bh, SKY_DK);
  }
  // ground
  fillRect(x, y + h - 10, w, 10, [40, 48, 58]);
  // three flags on poles
  const fw = 62;
  const fh = 40;
  const fy = y + 14;
  const spots = [x + 18, x + Math.floor(w / 2) - Math.floor(fw / 2), x + w - 18 - fw];
  vline(spots[0] + 2, fy - 8, fh + 12, INK, 2);
  vline(spots[1] + 2, fy - 8, fh + 12, INK, 2);
  vline(spots[2] + 2, fy - 8, fh + 12, INK, 2);
  flagUS(spots[0] + 4, fy, fw, fh);
  flagCN(spots[1] + 4, fy, fw, fh);
  flagRU(spots[2] + 4, fy, fw, fh);
  drawText(x + 10, y + h - 26, "SHENZHEN", 1, WHITE);
}

// --- world map ---
// Land as row ranges [row, colStart, colEnd] on a 56x26 grid.
const MAP_LAND = [
  [2, 16, 19], [2, 33, 52],
  [3, 2, 15], [3, 16, 18], [3, 27, 30], [3, 31, 53],
  [4, 2, 14], [4, 27, 31], [4, 32, 53],
  [5, 3, 14], [5, 27, 30], [5, 33, 52],
  [6, 3, 13], [6, 27, 29], [6, 33, 50],
  [7, 4, 13], [7, 26, 33], [7, 33, 48],
  [8, 5, 12], [8, 26, 33], [8, 34, 46],
  [9, 6, 12], [9, 27, 32], [9, 35, 44],
  [10, 8, 11], [10, 27, 31], [10, 36, 42], [10, 42, 46],
  [11, 13, 17], [11, 28, 31], [11, 43, 46],
  [12, 13, 18], [12, 28, 30],
  [13, 13, 17], [13, 28, 30],
  [14, 14, 17], [14, 28, 29],
  [15, 14, 16], [15, 45, 50],
  [16, 14, 16], [16, 44, 51],
  [17, 15, 16], [17, 45, 50],
  [18, 15, 16], [18, 46, 49],
];
// Numbered story dots: [story number, grid col, grid row]
const MAP_DOTS = [
  [1, 46, 8], [2, 27, 3], [3, 13, 7], [4, 30, 7], [5, 30, 4], [6, 35, 8],
  [7, 38, 9], [8, 15, 8], [9, 11, 8], [10, 31, 9], [11, 28, 6], [12, 26, 5],
];

function drawMap(x, y, cell) {
  const mw = 56 * cell;
  const mh = 26 * cell;
  fillRect(x, y, mw, mh, NAVY);
  for (const [r, c0, c1] of MAP_LAND) {
    fillRect(x + c0 * cell, y + r * cell, (c1 - c0 + 1) * cell, cell, TAN);
  }
  // numbered dots
  for (const [n, c, r] of MAP_DOTS) {
    const dx = x + c * cell + Math.floor(cell / 2);
    const dy = y + r * cell + Math.floor(cell / 2);
    const label = String(n);
    const rad = label.length > 1 ? 7 : 6;
    circle(dx, dy, rad, RED);
    circleOutline(dx, dy, rad, WHITE);
    drawText(dx - Math.floor(textWidth(label, 1) / 2), dy - 4, label, 1, WHITE);
  }
}

// --- small scene icons for the 9 grid cards (x, y, w=320, h=30) ---
function iconCOP31(x, y, w, h) {
  fillRect(x, y, w, h, [253, 214, 130]);
  circle(x + 40, y + 12, 9, [230, 120, 20]);
  triangle(x + 90, y + h, x + 150, y + 6, x + 210, y + h, [90, 140, 90]);
  triangle(x + 180, y + h, x + 240, y + 12, x + 300, y + h, [60, 110, 70]);
  fillRect(x, y + h - 6, w, 6, [70, 110, 70]);
}

function iconBridge(x, y, w, h) {
  fillRect(x, y, w, h, [168, 200, 224]);
  fillRect(x, y + h - 10, w, 10, [40, 90, 140]);
  line2(x + 20, y + h - 10, x + 160, y + 4, INK);
  line2(x + 160, y + 4, x + 300, y + h - 10, INK);
  for (const sx of [70, 110, 210, 250]) vline(sx, y + 12, 8, INK, 2);
  fillRect(x + 20, y + h - 14, w - 40, 4, [90, 90, 90]);
  star(x + 160, y + 12, 7, [230, 60, 20]);
}

function iconBarrel(x, y, w, h) {
  fillRect(x, y, w, h, [20, 40, 70]);
  fillRect(x + 40, y + 6, 34, 18, [30, 30, 30]);
  fillRect(x + 40, y + 12, 34, 3, [200, 200, 200]);
  triangle(x + 126, y + 24, x + 142, y + 2, x + 158, y + 24, [220, 40, 20]);
  triangle(x + 134, y + 24, x + 142, y + 10, x + 150, y + 24, [255, 200, 40]);
  triangle(x + 168, y + 24, x + 180, y + 8, x + 192, y + 24, [220, 40, 20]);
  triangle(x + 174, y + 24, x + 180, y + 14, x + 186, y + 24, [255, 200, 40]);
  fillRect(x, y + h - 4, w, 4, [10, 25, 45]);
}

function iconFlame(x, y, w, h) {
  fillRect(x, y, w, h, [240, 230, 210]);
  fillRect(x + 30, y + 10, 60, 14, [120, 120, 120]);
  fillRect(x + 100, y + 6, 40, 18, [100, 100, 100]);
  triangle(x + 196, y + 24, x + 214, y + 2, x + 232, y + 24, [220, 40, 20]);
  triangle(x + 204, y + 24, x + 214, y + 10, x + 224, y + 24, [255, 200, 40]);
  triangle(x + 238, y + 24, x + 252, y + 8, x + 266, y + 24, [220, 40, 20]);
  triangle(x + 246, y + 24, x + 252, y + 14, x + 258, y + 24, [255, 200, 40]);
}

function iconSunflower(x, y, w, h) {
  fillRect(x, y, w, h, [250, 240, 200]);
  const cx = x + 60;
  const cy = y + 14;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    triangle(cx, cy, Math.round(cx + 16 * Math.cos(a - 0.25)), Math.round(cy + 16 * Math.sin(a - 0.25)), Math.round(cx + 16 * Math.cos(a + 0.25)), Math.round(cy + 16 * Math.sin(a + 0.25)), [240, 200, 30]);
  }
  circle(cx, cy, 7, [120, 70, 20]);
  vline(x + 200, y + 8, 16, [60, 120, 60], 3);
  circle(x + 200, y + 8, 5, [200, 60, 60]);
}

function iconCapitol(x, y, w, h) {
  fillRect(x, y, w, h, [30, 50, 80]);
  const cx = x + 160;
  circle(cx, y + 16, 14, WHITE);
  fillRect(cx - 16, y + 16, 32, 4, WHITE);
  for (let i = 0; i < 5; i++) fillRect(cx - 60 + i * 26, y + 18, 8, 8, WHITE);
  fillRect(x, y + h - 4, w, 4, WHITE);
}

function iconTank(x, y, w, h) {
  fillRect(x, y, w, h, [210, 200, 170]);
  fillRect(x + 60, y + 12, 90, 8, [90, 95, 60]);
  fillRect(x + 95, y + 6, 30, 7, [90, 95, 60]);
  line(x + 125, y + 9, x + 175, y + 9, [70, 75, 50]);
  for (let i = 0; i < 4; i++) circle(x + 72 + i * 22, y + 23, 4, [60, 60, 60]);
}

function iconAtom(x, y, w, h) {
  fillRect(x, y, w, h, [20, 30, 60]);
  const cx = x + 160;
  const cy = y + 15;
  circleOutline(cx, cy, 12, [150, 200, 255]);
  circleOutline(cx, cy, 8, [255, 200, 100]);
  circle(cx, cy, 3, [255, 255, 255]);
  circle(cx + 12, cy - 4, 2, [150, 200, 255]);
  circle(cx - 8, cy + 6, 2, [255, 200, 100]);
}

function iconEU(x, y, w, h) {
  fillRect(x, y, w, h, [0, 51, 153]);
  const cx = x + 160;
  const cy = y + 15;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6 - Math.PI / 2;
    star(Math.round(cx + 11 * Math.cos(a)), Math.round(cy + 11 * Math.sin(a)), 3, [255, 209, 0]);
  }
}

// ---------------------------------------------------------------- layout
// 1024x1024 newspaper front page. Content x: 16..1008 (992 wide).

// --- content ---
const HEROES = [
  {
    kicker: "1 · SHENZHEN · SUMMIT",
    headline: "Trump, Xi and Putin hold first three-way summit",
    body: "The US, Chinese and Russian leaders meet together for the first time. Ukraine, arms control and the Iran war top the agenda.",
    draw: drawSummitPanel,
  },
  {
    kicker: "2 · THE HAGUE · LAW",
    headline: "World Court rules on Myanmar's Rohingya genocide",
    body: "The UN's highest court rules on Gambia's genocide case against Myanmar over the 2017 campaign. The judgment is final.",
    draw: drawCourtPanel,
  },
  {
    kicker: "3 · NASDAQ · MARKETS",
    headline: "Anthropic debuts in the biggest IPO on record",
    body: "Priced at $83, above its $70-78 range; $81.3bn raised, valuing the Claude maker near $1.5tn. First trades Thursday.",
    draw: drawChartPanel,
  },
];

const GRID = [
  {
    kicker: "4 · ANTALYA · CLIMATE",
    headline: "COP31 enters its final 48 hours",
    body: "Ministers take over the text; 'phase out' and the $120bn fund are still open.",
    draw: iconCOP31,
  },
  {
    kicker: "5 · KYIV · WAR",
    headline: "Ukraine strikes Crimean Bridge again",
    body: "A third attack in a week; traffic is suspended after the new strike, Russian officials say.",
    draw: iconBridge,
  },
  {
    kicker: "6 · HORMUZ · ENERGY",
    headline: "IEA: Mideast crisis threatens energy",
    body: "The Middle East crisis is the greatest threat to energy security, the IEA's report says.",
    draw: iconBarrel,
  },
  {
    kicker: "7 · DHAKA · POLITICS",
    headline: "Bangladesh sinks into turmoil",
    body: "Yunus's ancestral home is set on fire; 28 districts hit by violence amid Hasina party protests.",
    draw: iconFlame,
  },
  {
    kicker: "8 · NEW YORK · ARTS",
    headline: "Van Gogh sells for $190.4m, a record",
    body: "'Chataigniers en fleurs', painted in 1890, is auctioned at Sotheby's in New York.",
    draw: iconSunflower,
  },
  {
    kicker: "9 · WASHINGTON · IRAN",
    headline: "Netanyahu presses Trump to strike Iran",
    body: "Netanyahu urges a 4- to 7-day campaign; Trump says Iran seeks chemical and biological arms.",
    draw: iconCapitol,
  },
  {
    kicker: "10 · GAZA · WAR",
    headline: "Israel crosses the Yellow Line in Gaza",
    body: "Israeli forces launch a rare ground operation in central Gaza, beyond the Yellow Line.",
    draw: iconTank,
  },
  {
    kicker: "11 · VIENNA · NUCLEAR",
    headline: "North Korea expands uranium work",
    body: "The IAEA reports further expansion at Yongbyon; Seoul's president calls for renewed dialogue.",
    draw: iconAtom,
  },
  {
    kicker: "12 · BRUSSELS · EUROPE",
    headline: "EU proposes a €45bn loan to Ukraine",
    body: "The European Commission proposes a new 45 billion euro loan to Kyiv.",
    draw: iconEU,
  },
];

const BRIEFS = [
  "CARACAS — US and Venezuela sign a military cooperation agreement.",
  "WASHINGTON — IMF chief Georgieva: worldwide inflation has hit 4.7%.",
  "SHENZHEN — Trump tells APEC the US opposes globalist AI regulation.",
  "SEOUL — President Lee calls for renewed dialogue with Pyongyang.",
  "JAKARTA — Indonesia's parliament approves an asset-forfeiture bill.",
  "SUVA — Fiji declares a national disaster over the El Nino drought.",
  "LONDON — Save the Children: 589m children lived in conflict zones in 2025.",
  "MARKETS — CAC -0.85%, DAX -1.19%, FTSE -1.30%, S&P -0.23%.",
  "KUWAIT CITY — Kuwait repels its first Iranian attack in two months.",
  "WASHINGTON — US files a new emergency Supreme Court request over Venezuelan TPS.",
  "KUALA LUMPUR — UNHCR stops registering new asylum-seeker cases in Malaysia.",
  "MANILA — White House pursues a loan package over $2bn for the Philippines.",
  "SANA'A — Coalition reports a missile threat towards Riyadh.",
  "PANAMA CITY — Second arrest over the attack on a journalist's home.",
  "CAPE CANAVERAL — NASA sets coverage for the Northrop Grumman CRS-25 launch.",
  "NADI — Cyclone Xavier: winds near the centre reach 100 knots.",
  "KHASAB — Tanker strike reported in Hormuz; crew safe, UKMTO says.",
  "JERUSALEM — Israel delays E1 settlement; settler kills woman near Jericho.",
  "SHENZHEN — APEC opens as leaders gather for the trilateral talks.",
  "WASHINGTON — New START expiry raises questions over arms limits.",
  "SHENZHEN — Trump meets Putin and Xi separately before the three-way talks.",
  "RIYADH — Civil Defence says danger has passed after a new warning.",
];

const STATS = [
  ["$81.3bn", "raised by Anthropic — the largest IPO on record"],
  ["3", "leaders hold the first three-way summit in Shenzhen"],
  ["$120bn", "adaptation-finance goal still open at COP31"],
  ["730,000", "Rohingya who fled in 2017 — the ICJ case"],
  ["$190.4m", "Van Gogh sells for a record at Sotheby's"],
  ["4.7%", "global inflation, the IMF warns in Shenzhen"],
];

const REGIONS = [
  ["EUROPE 6", BLUE],
  ["THE AMERICAS 9", GREEN],
  ["ASIA-PACIFIC 9", RED],
  ["MIDEAST 7", ORANGE],
  ["OCEANIA 2", TEAL],
  ["WORLD 1", [51, 51, 51]],
];

// --- draw the page ---
fillRect(0, 0, W, H, PAPER);
rectOutline(8, 8, 1008, 1008, INK);
hline(10, 10, 1004, INK, 1);

// Masthead
drawTextCentered(512, 22, "THE WORLD IN ONE DAY", 2, RED);
{
  const t = "THURSDAY'S NEWS · ONE PAGE · 34 STORIES";
  drawText(1008 - textWidth(t, 1), 24, t, 1, INK);
}
drawTextCentered(512, 46, "Thursday 19 November 2026", 6, INK);
drawTextCentered(
  512, 98,
  "Three leaders meet in Shenzhen · A court rules on Myanmar · The biggest IPO ever",
  2, RED
);
hline(16, 120, 992, INK, 2);

// Region strip
{
  const tabW = 992 / 6;
  for (let i = 0; i < REGIONS.length; i++) {
    const x = 16 + Math.floor(i * tabW);
    const w = Math.floor((i + 1) * tabW) - Math.floor(i * tabW);
    fillRect(x, 126, w, 26, REGIONS[i][1]);
    drawTextCentered(x + Math.floor(w / 2), 135, REGIONS[i][0], 1, WHITE);
  }
}

// Stat strip
{
  const colW = 992 / 6;
  for (let i = 0; i < STATS.length; i++) {
    const x = 16 + Math.floor(i * colW);
    if (i > 0) vline(x, 164, 62, GREY, 1);
    drawText(x + 8, 164, STATS[i][0], 3, RED);
    drawWrapped(x + 8, 192, Math.floor(colW) - 16, STATS[i][1], 1, INK, 1);
  }
}
hline(16, 230, 992, INK, 2);

// Heroes
for (let i = 0; i < HEROES.length; i++) {
  const x = 16 + i * 328;
  const h = HEROES[i];
  h.draw(x, 238, 320, 100);
  drawText(x, 344, h.kicker, 1, RED);
  drawWrapped(x, 358, 320, h.headline, 3, INK, 2);
  drawWrapped(x, 431, 320, h.body, 1, INK, 2);
}
hline(16, 466, 992, INK, 2);

// Grid (3 rows x 3 cols)
for (let i = 0; i < GRID.length; i++) {
  const row = Math.floor(i / 3);
  const col = i % 3;
  const x = 16 + col * 328;
  const y = 474 + row * 104;
  const g = GRID[i];
  g.draw(x, y, 320, 28);
  drawText(x, y + 32, g.kicker, 1, RED);
  drawWrapped(x, y + 44, 320, g.headline, 2, INK, 2);
  drawWrapped(x, y + 78, 320, g.body, 1, INK, 1);
  if (col < 2) vline(x + 324, y, 96, GREY_LT, 1);
}
hline(16, 784, 992, INK, 2);

// Bottom: map (left) + briefs (right)
drawText(16, 792, "WHERE IT HAPPENED", 2, RED);
drawMap(16, 810, 6);
drawText(16, 970, "Red numbers mark stories 1-12.", 1, INK);
drawText(16, 979, "Positions are approximate.", 1, INK);

drawText(360, 792, "ALSO ON THURSDAY 19 NOVEMBER — 22 MORE STORIES", 2, RED);
for (let i = 0; i < BRIEFS.length; i++) {
  drawText(360, 810 + i * 8, BRIEFS[i], 1, INK);
}

// Footer
hline(16, 992, 992, INK, 1);
drawTextCentered(
  512, 996,
  "Every story happened, or was first reported, on Thursday 19 November 2026.",
  1, INK
);
drawTextCentered(
  512, 1005,
  "Sources: Reuters, AP, AFP, BBC, The Hindu, IMD, NASA, ICJ. Original drawings.",
  1, INK
);

// ---------------------------------------------------------------- write
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
mkdirSync(outDir, { recursive: true });
const png = encodePNG();
writeFileSync(outDir + "/entry.png", png);
