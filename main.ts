// main.ts — "Thursday 19 November 2026" — news-image-20261119, akun 1 @bayuanwar8.
// Fresh build from spec. Node 22 stdlib only. Own PNG encoder + TTF rasterizer.
// Deterministic: no Date, no randomness. Output: /output/entry.png (1024x1024).
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas, type RGB } from "./draw.ts";
import { loadFont, type Font } from "./font.ts";
import { encodePNG } from "./png.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || path.join(SCRIPT_DIR, "out");
const W = 1024, H = 1024;

// ---- palette: clean flat editorial, bright paper ----
const PAPER: RGB = [247, 242, 231];
const PANEL: RGB = [255, 253, 247];
const INK: RGB = [24, 24, 24];
const NAVY: RGB = [28, 44, 78];
const NAVY2: RGB = [38, 58, 98];
const RED: RGB = [178, 34, 34];
const RED2: RGB = [198, 52, 40];
const GREY: RGB = [110, 108, 100];
const LGREY: RGB = [200, 196, 186];
const SKY: RGB = [176, 208, 232];
const SKY2: RGB = [205, 226, 242];
const SEA: RGB = [120, 170, 205];
const SAND: RGB = [232, 214, 170];
const GREEN: RGB = [64, 128, 84];
const TEAL: RGB = [38, 110, 104];
const GOLD: RGB = [198, 148, 52];
const ORANGE: RGB = [232, 122, 48];
const SKIN: RGB = [232, 196, 158];
const SKIN2: RGB = [214, 172, 132];
const BLOND: RGB = [226, 196, 110];
const WHITE: RGB = [255, 255, 255];
const CREAM: RGB = [240, 230, 205];

const SERIF: Font = loadFont(path.join(SCRIPT_DIR, "fonts", "DejaVuSerif-Bold.ttf"));
const SANSB: Font = loadFont(path.join(SCRIPT_DIR, "fonts", "DejaVuSans-Bold.ttf"));
const SANS: Font = loadFont(path.join(SCRIPT_DIR, "fonts", "DejaVuSans.ttf"));

const cv = new Canvas(W, H, PAPER);

// ---- region colors ----
const REG_COLOR: Record<string, RGB> = {
  ASIA: [150, 40, 48], "MIDDLE EAST": [36, 96, 92], AMERICAS: [28, 44, 78],
  GLOBAL: [70, 70, 76], WORLD: [70, 70, 76], EUROPE: [48, 88, 150],
  OCEANIA: [58, 122, 78], AFRICA: [176, 122, 40],
};

// ---- stories 1..16 ----
interface Story { n: number; region: string; tag: string; head: string; deck: string; src: string; }
const STORIES: Story[] = [
  { n: 1, region: "ASIA", tag: "ASIA · SUMMIT", head: "Trump, Xi and Putin hold first three-way summit", deck: "The US, Chinese and Russian leaders met for 90 minutes and issued a “Declaration on Peace” on nuclear risk and UN reform.", src: "Reuters · AP · Xinhua" },
  { n: 2, region: "GLOBAL", tag: "GLOBAL · JUSTICE", head: "World Court: Myanmar committed genocide", deck: "By 9 votes to 6 the ICJ found Myanmar guilty of genocide against the Rohingya and ordered reparations.", src: "Al Jazeera · UN News" },
  { n: 3, region: "GLOBAL", tag: "GLOBAL · CLIMATE", head: "COP31 draft drops fossil fuels and $120bn aid goal", deck: "The slimmer text has no figure for adaptation aid. Talks are due to end on Friday.", src: "Reuters · AFP" },
  { n: 4, region: "AMERICAS", tag: "AMERICAS · MARKETS", head: "Anthropic debuts in the biggest IPO ever", deck: "Priced at $83; $81.3bn raised.", src: "Reuters" },
  { n: 5, region: "WORLD", tag: "WORLD · GAMES", head: "GTA VI arrives after a 13-year wait", deck: "Midnight launch in NZ; 99 on Metacritic.", src: "Reuters" },
  { n: 6, region: "ASIA", tag: "ASIA · STORM", head: "Cyclone Akvan bears down as 200,000 flee the coast", deck: "80,000 evacuated; 11 districts on alert.", src: "IMD" },
  { n: 7, region: "EUROPE", tag: "EUROPE · WAR", head: "Ukraine hits Crimea bridge again", deck: "Third attack in a week; traffic suspended.", src: "Euronews" },
  { n: 8, region: "MIDDLE EAST", tag: "MIDDLE EAST · WAR", head: "Saudis shoot down Houthi missiles", deck: "Debris fell on the capital; no casualties.", src: "Reuters" },
  { n: 9, region: "ASIA", tag: "ASIA · JUSTICE", head: "Korea’s top court clears ex-PM Han", deck: "Han Duck-soo’s conviction is overturned.", src: "AP" },
  { n: 10, region: "EUROPE", tag: "EUROPE · SECURITY", head: "Denmark backs Arctic pact with US", deck: "Parliament approves the Greenland deal 109–0.", src: "AP" },
  { n: 11, region: "OCEANIA", tag: "OCEANIA · ECONOMY", head: "Australia’s jobless rate hits 4.9%", deck: "Highest since 2024; shares and dollar slide.", src: "ABC" },
  { n: 12, region: "AMERICAS", tag: "AMERICAS · LABOUR", head: "Colombia’s unions hold national strike", deck: "Marches in three cities against a rescue bill.", src: "Infobae" },
  { n: 13, region: "AFRICA", tag: "AFRICA · SPORT", head: "Marathon champion banned for doping", deck: "Kenya’s Peres Jepchirchir gets three years.", src: "ABC" },
  { n: 14, region: "ASIA", tag: "ASIA · POLITICS", head: "Bangladesh sinks into turmoil", deck: "Yunus’s home is set on fire; 28 districts hit.", src: "AFP" },
  { n: 15, region: "MIDDLE EAST", tag: "MIDDLE EAST · IRAN", head: "Netanyahu urges Iran strike", deck: "Urges a 4- to 7-day campaign; Trump cites arms.", src: "AP" },
  { n: 16, region: "MIDDLE EAST", tag: "MIDDLE EAST · WAR", head: "Israel crosses Yellow Line", deck: "Rare ground operation in central Gaza.", src: "Reuters" },
];

// ---- briefs 17..36: [num, PLACE, one-liner, source] ----
const BRIEFS: [number, string, string, string][] = [
  [17, "SHENZHEN", "Xi urges ban on all nuclear arms.", "Al Jazeera"],
  [18, "WASHINGTON", "IMF: global inflation hits 4.7%.", "IMF"],
  [19, "SEOUL", "Lee calls for talks with Pyongyang.", "Yonhap"],
  [20, "JAKARTA", "Indonesia passes asset-seizure bill.", "Antara"],
  [21, "SUVA", "Fiji declares drought.", "RNZ"],
  [22, "LONDON", "589m children lived in war zones.", "UN"],
  [23, "MARKETS", "CAC -0.85%, DAX -1.19%, FTSE -1.30%.", "Markets"],
  [24, "KUWAIT CITY", "Kuwait repels Iranian attack.", "Reuters"],
  [25, "WASHINGTON", "US seeks stay on Venezuelan TPS.", "AP"],
  [26, "KUALA LUMPUR", "UNHCR halts new asylum cases.", "UNHCR"],
  [27, "MANILA", "US pursues $20bn loan for Philippines.", "Reuters"],
  [28, "SANA’A", "Missile threat reported near Riyadh.", "Reuters"],
  [29, "NADI", "Cyclone Xavier winds hit 100 knots.", "Fiji Met"],
  [30, "KHASAB", "Tanker hit in Hormuz; crew safe.", "Reuters"],
  [31, "JERUSALEM", "£1 delayed; settler kills woman.", "Reuters"],
  [32, "WASHINGTON", "New START expiry raises arms fears.", "AP"],
  [33, "SHENZHEN", "Trump meets Putin, Xi separately.", "AP"],
  [34, "RIYADH", "Danger passed after new warning.", "SPA"],
  [35, "CARACAS", "US, Venezuela sign military deal.", "Reuters"],
  [36, "FLORIDA", "Flooded Florida braces for more rain.", "AP"],
];

// region counts computed from data (never invented)
const REGIONS: [string, number][] = (() => {
  const counts = new Map<string, number>();
  const regOf = (place: string): string => {
    if (["SHENZHEN", "SEOUL", "JAKARTA", "KUALA LUMPUR", "MANILA", "SANA’A"].includes(place)) return "ASIA";
    if (["WASHINGTON", "CARACAS", "FLORIDA"].includes(place)) return "AMERICAS";
    if (["SUVA", "NADI"].includes(place)) return "OCEANIA";
    if (["LONDON"].includes(place)) return "EUROPE";
    if (["KUWAIT CITY", "KHASAB", "JERUSALEM", "RIYADH"].includes(place)) return "MIDDLE EAST";
    return "GLOBAL";
  };
  for (const s of STORIES) {
    const r = s.region === "WORLD" ? "GLOBAL" : s.region;
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  for (const [, place] of BRIEFS) {
    const r = regOf(place);
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const order = ["ASIA", "MIDDLE EAST", "AMERICAS", "GLOBAL", "EUROPE", "OCEANIA", "AFRICA"];
  return order.filter((r) => counts.get(r)).map((r): [string, number] => [r, counts.get(r) as number]);
})();

// ---- small helpers ----
function fitSerif(text: string, maxW: number, startSize: number): number {
  let s = startSize;
  while (s > 20 && cv.textWidth(SERIF, s, text) > maxW) s -= 1;
  return s;
}
function numBadge(x: number, y: number, n: number, size: number, fg: RGB = WHITE, bg: RGB = RED): void {
  const d = size;
  cv.circle(x + d / 2, y + d / 2, d / 2, bg);
  cv.text(SANSB, Math.round(size * 0.62), x + d / 2, y + d / 2 + Math.round(size * 0.22), String(n), fg, "c");
}
function tagRow(x: number, y: number, w: number, s: Story, size: number): void {
  const c = REG_COLOR[s.region] ?? INK;
  cv.text(SANSB, size, x, y + size, s.tag, c);
  cv.text(SANS, Math.max(8, size - 2), x + w, y + size, s.src, GREY, "r");
}
function skyBand(x: number, y: number, w: number, h: number, top: RGB, bot: RGB): void {
  const half = Math.floor(h / 2);
  cv.rect(x, y, w, half, top);
  cv.rect(x, y + half, w, h - half, bot);
}
function sun(x: number, y: number, r: number): void {
  cv.circle(x, y, r, [250, 200, 90]);
  cv.ring(x, y, r + 3, [250, 200, 90], 2);
}
function star(cx: number, cy: number, r: number, c: RGB, rot = -Math.PI / 2): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const ang = rot + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.382;
    pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]);
  }
  cv.poly(pts, c);
}
function flagUS(x: number, y: number, w: number, h: number): void {
  const y0 = Math.round(y), y1 = Math.round(y + h);
  for (let i = 0; i < 7; i++) {
    const sy0 = y0 + Math.round((i * (y1 - y0)) / 7);
    const sy1 = y0 + Math.round(((i + 1) * (y1 - y0)) / 7);
    cv.rect(x, sy0, w, sy1 - sy0, i % 2 ? WHITE : RED2);
  }
  const cw = w * 0.42, ch = (h * 4) / 7;
  cv.rect(x, y, cw, ch, NAVY);
  const rows = ch >= 11 ? 5 : 3;
  const cols = cw >= 30 ? 6 : 4;
  const r = Math.max(1.0, Math.min(1.6, (ch / rows) * 0.45));
  for (let ri = 0; ri < rows; ri++)
    for (let ci = 0; ci < cols; ci++)
      star(x + ((ci + 0.5) * cw) / cols, y + ((ri + 0.5) * ch) / rows, r, WHITE);
  cv.strokeRect(x, y, w, h, [90, 90, 90], 1);
}
function flagCN(x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, RED2);
  const bx = x + w * 0.16, by = y + h * 0.3, br = Math.max(2.5, h * 0.2);
  star(bx, by, br, GOLD);
  const sr = Math.max(1.2, h * 0.06);
  const arc: [number, number][] = [[0.33, 0.08], [0.41, 0.18], [0.43, 0.36], [0.34, 0.48]];
  for (const [fx, fy] of arc) {
    const sx = x + w * fx, sy = y + h * fy;
    star(sx, sy, sr, GOLD, Math.atan2(by - sy, bx - sx));
  }
  cv.strokeRect(x, y, w, h, [90, 90, 90], 1);
}
function flagRU(x: number, y: number, w: number, h: number): void {
  const y0 = Math.round(y), y1 = Math.round(y + h);
  const b1 = y0 + Math.round((y1 - y0) / 3);
  const b2 = y0 + Math.round((2 * (y1 - y0)) / 3);
  cv.rect(x, y0, w, b1 - y0, WHITE);
  cv.rect(x, b1, w, b2 - b1, [40, 90, 180]);
  cv.rect(x, b2, w, y1 - b2, RED2);
  cv.strokeRect(x, y, w, h, [90, 90, 90], 1);
}
function flagDK(x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, RED2);
  cv.rect(x + w * 0.3, y, w * 0.12, h, WHITE);
  cv.rect(x, y + h * 0.42, w, h * 0.16, WHITE);
  cv.strokeRect(x, y, w, h, [90, 90, 90], 1);
}
function flagIL(x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, WHITE);
  const s = Math.max(1, Math.round(h * 0.16));
  cv.rect(x, y + Math.round(h * 0.12), w, s, [0, 56, 184]);
  cv.rect(x, y + h - Math.round(h * 0.12) - s, w, s, [0, 56, 184]);
  // Star of David: two overlapping triangles
  const cx0 = x + w * 0.5, cy0 = y + h * 0.5, r = h * 0.26;
  const tri = (flip: number): [number, number][] => [
    [cx0, cy0 + flip * r],
    [cx0 - r * 0.9, cy0 - flip * r * 0.6],
    [cx0 + r * 0.9, cy0 - flip * r * 0.6],
  ];
  cv.poly(tri(1), [0, 56, 184]);
  cv.poly(tri(-1), [0, 56, 184]);
  cv.strokeRect(x, y, w, h, [90, 90, 90], 1);
}

// ---- figures (hero 1: three named leaders) ----
function figure(cx: number, headY: number, r: number, hair: RGB, suit: RGB, tie: RGB, name: string, plateY: number, plateW: number): void {
  // suit body
  cv.rect(cx - r * 1.9, headY + r * 0.9, r * 3.8, plateY - (headY + r * 0.9), suit);
  // white shirt + tie
  cv.poly([[cx - r * 0.5, headY + r * 0.9], [cx + r * 0.5, headY + r * 0.9], [cx, headY + r * 1.9]], WHITE);
  cv.poly([[cx - r * 0.22, headY + r * 1.0], [cx + r * 0.22, headY + r * 1.0], [cx, headY + r * 2.2]], tie);
  // hair behind head
  cv.circle(cx, headY - r * 0.25, r * 0.95, hair);
  // face
  cv.circle(cx, headY + r * 0.15, r * 0.92, SKIN);
  // eyes
  cv.circle(cx - r * 0.36, headY + r * 0.05, 1.4, INK);
  cv.circle(cx + r * 0.36, headY + r * 0.05, 1.4, INK);
  // name plate
  cv.rect(cx - plateW / 2, plateY, plateW, 13, WHITE);
  cv.strokeRect(cx - plateW / 2, plateY, plateW, 13, NAVY, 1);
  cv.text(SANSB, 9, cx, plateY + 10, name, INK, "c");
}

// ---- scenes: draw into box (x,y,w,h), bright + layered ----
function scene(n: number, x: number, y: number, w: number, h: number): void {
  if (n === 1) {
    skyBand(x, y, w, h, SKY2, [226, 234, 240]);
    const gap = 4;
    const fw = (w - 2 * gap) / 3;
    flagUS(x, y + 2, fw, h * 0.24);
    flagCN(x + fw + gap, y + 2, fw, h * 0.24);
    flagRU(x + 2 * (fw + gap), y + 2, fw, h * 0.24);
    const headY = y + h * 0.44, r = h * 0.145, plateY = y + h * 0.82;
    figure(x + w * 0.17, headY, r, BLOND, NAVY, RED2, "TRUMP", plateY, w * 0.27);
    figure(x + w * 0.5, headY, r, INK, [30, 30, 34], RED2, "XI", plateY, w * 0.27);
    figure(x + w * 0.83, headY, r, [168, 168, 168], [44, 44, 52], [40, 90, 180], "PUTIN", plateY, w * 0.27);
    cv.rect(x, y + h * 0.8, w, 2, [120, 84, 52]);
    return;
  }
  if (n === 2) {
    skyBand(x, y, w, h, SKY2, CREAM);
    // courthouse
    const bx = x + w * 0.08, bw = w * 0.52, by = y + h * 0.3;
    cv.poly([[bx, by], [bx + bw / 2, y + h * 0.06], [bx + bw, by]], NAVY2);
    cv.rect(bx, by, bw, h * 0.62, [238, 230, 210]);
    for (let i = 0; i < 4; i++) cv.rect(bx + bw * 0.1 + (i * bw * 0.78) / 3, by + h * 0.06, bw * 0.09, h * 0.5, WHITE);
    cv.rect(bx, by + h * 0.56, bw, h * 0.06, NAVY2);
    // scales of justice — pans hang from the beam on strings, pole stops
    // well above the 9-6 badge
    const sx = x + w * 0.76, sy = y + h * 0.22;
    const beamY = sy + h * 0.06, panY = sy + h * 0.24, panR = h * 0.07;
    cv.vline(sx, sy, h * 0.38, GOLD);
    cv.hline(sx - w * 0.09, beamY, w * 0.18, GOLD);
    const bowl = (cx: number): [number, number][] => {
      const pts: [number, number][] = [];
      for (let a = 180; a <= 360; a += 15) {
        const rad = (a * Math.PI) / 180;
        pts.push([cx + Math.cos(rad) * panR, panY - Math.sin(rad) * panR * 0.55]);
      }
      return pts;
    };
    for (const sgn of [-1, 1]) {
      const bx = sx + sgn * w * 0.09;
      cv.line(bx, beamY, bx - panR, panY, GOLD, 1);
      cv.line(bx, beamY, bx, panY + panR * 0.5, GOLD, 1);
      cv.line(bx, beamY, bx + panR, panY, GOLD, 1);
      cv.poly(bowl(bx), GOLD);
    }
    // big 9-6 badge
    cv.rect(x + w * 0.62, y + h * 0.66, w * 0.32, h * 0.28, WHITE);
    cv.strokeRect(x + w * 0.62, y + h * 0.66, w * 0.32, h * 0.28, RED, 2);
    cv.text(SERIF, Math.round(h * 0.24), x + w * 0.78, y + h * 0.9, "9–6", RED, "c");
    return;
  }
  if (n === 3) {
    cv.rect(x, y, w, h, [214, 232, 222]);
    // globe — ocean, organic continents, equator, outline
    const gx = x + w * 0.24, gy = y + h * 0.42, gr = h * 0.34;
    cv.circle(gx, gy, gr, SEA);
    // equator first (continents drawn over it, so it shows only over ocean)
    cv.line(gx - gr * 0.96, gy + gr * 0.12, gx + gr * 0.96, gy + gr * 0.12, [80, 130, 175], 1);
    // continent 1 (upper-left, large irregular landmass)
    cv.poly([
      [gx - gr * 0.62, gy - gr * 0.15], [gx - gr * 0.45, gy - gr * 0.55],
      [gx - gr * 0.1, gy - gr * 0.62], [gx + gr * 0.05, gy - gr * 0.35],
      [gx - gr * 0.05, gy - gr * 0.05], [gx - gr * 0.35, gy + gr * 0.05],
    ], GREEN);
    // continent 2 (lower-right)
    cv.poly([
      [gx + gr * 0.05, gy + gr * 0.15], [gx + gr * 0.35, gy + gr * 0.05],
      [gx + gr * 0.6, gy + gr * 0.3], [gx + gr * 0.45, gy + gr * 0.6],
      [gx + gr * 0.15, gy + gr * 0.62], [gx - gr * 0.05, gy + gr * 0.4],
    ], GREEN);
    // small island (upper-right)
    cv.poly([
      [gx + gr * 0.35, gy - gr * 0.55], [gx + gr * 0.55, gy - gr * 0.6],
      [gx + gr * 0.62, gy - gr * 0.4], [gx + gr * 0.42, gy - gr * 0.38],
    ], [58, 116, 76]);
    // outline
    cv.ring(gx, gy, gr, [70, 120, 170], 1);
    // small cloud top-left
    cv.circle(x + w * 0.05, y + h * 0.14, h * 0.06, WHITE);
    cv.circle(x + w * 0.09, y + h * 0.12, h * 0.08, WHITE);
    cv.circle(x + w * 0.13, y + h * 0.15, h * 0.055, WHITE);
    // heat rays between globe and thermometer
    cv.line(x + w * 0.4, y + h * 0.3, x + w * 0.43, y + h * 0.16, ORANGE, 2);
    cv.line(x + w * 0.46, y + h * 0.34, x + w * 0.48, y + h * 0.2, ORANGE, 2);
    cv.line(x + w * 0.51, y + h * 0.32, x + w * 0.54, y + h * 0.2, ORANGE, 2);
    // thermometer — tube + bulb as one merged shape
    const tx = x + w * 0.56;
    const tw = w * 0.07, tcx = tx + tw / 2;
    cv.rect(tx, y + h * 0.1, tw, h * 0.62, WHITE);
    cv.strokeRect(tx, y + h * 0.1, tw, h * 0.62, INK, 1);
    cv.rect(tx + 1, y + h * 0.44, tw - 2, h * 0.28, RED2);
    cv.circle(tcx, y + h * 0.72, tw / 2 + 3, RED2);
    // tick marks
    cv.hline(tx - 4, y + h * 0.24, 4, INK);
    cv.hline(tx - 4, y + h * 0.4, 4, INK);
    cv.hline(tx - 4, y + h * 0.56, 4, INK);
    // leaf bottom-left + embers bottom-middle
    cv.poly([[x + w * 0.05, y + h * 0.86], [x + w * 0.09, y + h * 0.8], [x + w * 0.13, y + h * 0.86], [x + w * 0.09, y + h * 0.92]], [58, 122, 78]);
    cv.line(x + w * 0.09, y + h * 0.86, x + w * 0.09, y + h * 0.95, [58, 122, 78], 1);
    cv.circle(x + w * 0.42, y + h * 0.88, 2, ORANGE);
    cv.circle(x + w * 0.47, y + h * 0.9, 2, ORANGE);
    // stamp banner — taller box, all three lines fully inside with padding
    cv.rect(x + w * 0.67, y + h * 0.24, w * 0.32, h * 0.54, RED2);
    cv.text(SANSB, Math.round(h * 0.11), x + w * 0.83, y + h * 0.4, "FOSSIL", WHITE, "c");
    cv.text(SANSB, Math.round(h * 0.11), x + w * 0.83, y + h * 0.54, "FUELS", WHITE, "c");
    cv.text(SANSB, Math.round(h * 0.11), x + w * 0.83, y + h * 0.68, "CUT", WHITE, "c");
    return;
  }
  if (n === 4) {
    cv.rect(x, y, w, h, [228, 238, 226]);
    // rising candlesticks
    const base = y + h * 0.82;
    const cw = w / 7;
    for (let i = 0; i < 5; i++) {
      const ch = h * (0.18 + i * 0.1);
      const cx0 = x + w * 0.08 + i * cw;
      const up = i % 2 === 0;
      cv.vline(cx0 + cw * 0.25, base - ch - h * 0.06, ch + h * 0.12, INK);
      cv.rect(cx0, base - ch, cw * 0.5, ch, up ? GREEN : RED2);
    }
    cv.text(SERIF, Math.round(h * 0.42), x + w * 0.62, y + h * 0.5, "$83", NAVY, "l");
    cv.poly([[x + w * 0.6, y + h * 0.2], [x + w * 0.72, y + h * 0.08], [x + w * 0.84, y + h * 0.18]], GREEN);
    return;
  }
  if (n === 5) {
    skyBand(x, y, w, h, [250, 170, 90], [196, 84, 130]);
    sun(x + w * 0.78, y + h * 0.3, h * 0.16);
    // skyline
    const by = y + h * 0.62;
    const bw = w / 6;
    for (let i = 0; i < 6; i++) {
      const bh = h * (0.18 + ((i * 37) % 3) * 0.08);
      cv.rect(x + i * bw + 2, by + h * 0.38 - bh, bw - 4, bh, [52, 38, 80]);
      cv.rect(x + i * bw + 5, by + h * 0.38 - bh + 4, 3, 3, [250, 220, 110]);
      cv.rect(x + i * bw + 9, by + h * 0.38 - bh + 12, 3, 3, [250, 220, 110]);
    }
    cv.text(SERIF, Math.round(h * 0.55), x + w * 0.5, y + h * 0.62, "VI", WHITE, "c");
    return;
  }
  if (n === 6) {
    skyBand(x, y, w, h, SKY, SKY2);
    // cyclone spiral: bold white rings + deep-blue outer anchor ring
    const cx0 = x + w * 0.38, cy0 = y + h * 0.52;
    cv.ring(cx0, cy0, h * 0.38, [50, 110, 180], 2);
    for (let k = 1; k <= 3; k++) cv.ring(cx0, cy0, h * 0.11 * k, WHITE, 3);
    cv.circle(cx0, cy0, h * 0.08, WHITE);
    // curved wind arm (was a straight scratch-like line) + cloud puff at its end
    cv.line(cx0 + h * 0.28, cy0 - h * 0.08, cx0 + h * 0.48, cy0 - h * 0.3, WHITE, 3);
    cv.line(cx0 + h * 0.48, cy0 - h * 0.3, x + w * 0.85, y + h * 0.14, WHITE, 3);
    cv.circle(x + w * 0.85, y + h * 0.14, h * 0.06, WHITE);
    // coastline
    cv.poly([[x + w * 0.62, y + h], [x + w * 0.78, y + h * 0.55], [x + w, y + h * 0.7], [x + w, y + h]], SAND);
    cv.rect(x, y + h * 0.88, w, h * 0.12, SEA);
    return;
  }
  if (n === 7) {
    skyBand(x, y, w, h, SKY2, [232, 226, 210]);
    // water up to just below the deck so the bridge spans water
    cv.rect(x, y + h * 0.7, w, h * 0.3, SEA);
    cv.hline(x, y + h * 0.76, w, WHITE);
    cv.hline(x, y + h * 0.88, w, WHITE);
    // two pylons standing in the water + top beam (portal frame)
    const px1 = x + w * 0.28, px2 = x + w * 0.68;
    cv.rect(px1, y + h * 0.2, w * 0.045, h * 0.62, [90, 90, 96]);
    cv.rect(px2, y + h * 0.2, w * 0.045, h * 0.62, [90, 90, 96]);
    cv.rect(px1, y + h * 0.2, px2 - px1 + w * 0.045, h * 0.05, [90, 90, 96]);
    // deck across the water
    const by = y + h * 0.6;
    cv.rect(x, by, w, h * 0.08, [70, 70, 76]);
    cv.hline(x, by - 1, w, [150, 150, 156]);
    // suspension cable sagging between pylon tops + suspenders
    cv.line(px1 + w * 0.02, y + h * 0.24, x + w * 0.5, y + h * 0.52, [110, 110, 116], 2);
    cv.line(x + w * 0.5, y + h * 0.52, px2 + w * 0.02, y + h * 0.24, [110, 110, 116], 2);
    cv.vline(x + w * 0.39, y + h * 0.36, h * 0.22, [110, 110, 116]);
    cv.vline(x + w * 0.61, y + h * 0.36, h * 0.22, [110, 110, 116]);
    // explosion starburst sitting ON the deck
    const ex = x + w * 0.5, ey = y + h * 0.5;
    cv.poly([[ex, ey - h * 0.22], [ex + h * 0.07, ey - h * 0.06], [ex + h * 0.22, ey - h * 0.08], [ex + h * 0.09, ey + h * 0.06], [ex + h * 0.16, ey + h * 0.2], [ex, ey + h * 0.1], [ex - h * 0.16, ey + h * 0.2], [ex - h * 0.09, ey + h * 0.06], [ex - h * 0.22, ey - h * 0.08], [ex - h * 0.07, ey - h * 0.06]], ORANGE);
    cv.circle(ex, ey, h * 0.08, [250, 210, 90]);
    // smoke rising above the blast
    cv.circle(x + w * 0.56, y + h * 0.3, h * 0.09, [150, 150, 150]);
    cv.circle(x + w * 0.64, y + h * 0.22, h * 0.07, [170, 170, 170]);
    return;
  }
  if (n === 8) {
    cv.rect(x, y, w, h, [32, 52, 92]);
    // lit towers
    const bw = w / 5;
    for (let i = 0; i < 5; i++) {
      const bh = h * (0.3 + ((i * 53) % 3) * 0.12);
      cv.rect(x + i * bw + 3, y + h - bh, bw - 6, bh, [58, 72, 110]);
      for (let wy = 0; wy < 3; wy++) cv.rect(x + i * bw + 6, y + h - bh + 5 + wy * 9, 3, 3, [250, 220, 110]);
    }
    // interceptor trails
    cv.line(x + w * 0.15, y + h * 0.42, x + w * 0.4, y + h * 0.1, WHITE, 2);
    cv.line(x + w * 0.45, y + h * 0.5, x + w * 0.72, y + h * 0.16, WHITE, 2);
    cv.circle(x + w * 0.4, y + h * 0.1, 3, [255, 240, 160]);
    cv.circle(x + w * 0.72, y + h * 0.16, 3, [255, 240, 160]);
    cv.circle(x + w * 0.85, y + h * 0.22, h * 0.09, [240, 240, 220]);
    return;
  }
}

// ---- scenes 9-16 (mid panels, same relative drawing) ----
function sceneMid(n: number, x: number, y: number, w: number, h: number): void {
  if (n <= 8) { scene(n, x, y, w, h); return; }
  if (n === 9) {
    skyBand(x, y, w, h, SKY2, CREAM);
    cv.rect(x + w * 0.06, y + h * 0.35, w * 0.5, h * 0.5, [238, 230, 210]);
    cv.poly([[x + w * 0.06, y + h * 0.35], [x + w * 0.31, y + h * 0.1], [x + w * 0.56, y + h * 0.35]], NAVY2);
    for (let i = 0; i < 3; i++) cv.rect(x + w * 0.12 + i * w * 0.15, y + h * 0.42, w * 0.06, h * 0.38, WHITE);
    // gavel
    cv.rect(x + w * 0.62, y + h * 0.3, w * 0.3, h * 0.14, [120, 84, 52]);
    cv.rect(x + w * 0.6, y + h * 0.44, w * 0.34, h * 0.08, [150, 110, 70]);
    cv.rect(x + w * 0.74, y + h * 0.52, w * 0.06, h * 0.3, [120, 84, 52]);
    return;
  }
  if (n === 10) {
    skyBand(x, y, w, h, SKY, WHITE);
    // far peak (pale) behind the main peaks
    cv.poly([[x + w * 0.12, y + h], [x + w * 0.38, y + h * 0.12], [x + w * 0.64, y + h]], [226, 234, 242]);
    // main peak (white) + shaded right face
    cv.poly([[x, y + h], [x + w * 0.3, y + h * 0.2], [x + w * 0.55, y + h]], WHITE);
    cv.poly([[x + w * 0.3, y + h * 0.2], [x + w * 0.44, y + h * 0.62], [x + w * 0.55, y + h]], [205, 222, 238]);
    // middle peak (pale blue-grey) + shaded face
    cv.poly([[x + w * 0.35, y + h], [x + w * 0.62, y + h * 0.1], [x + w * 0.9, y + h]], [232, 238, 244]);
    cv.poly([[x + w * 0.62, y + h * 0.1], [x + w * 0.76, y + h * 0.55], [x + w * 0.9, y + h]], [205, 222, 238]);
    // right peak (white)
    cv.poly([[x + w * 0.6, y + h], [x + w * 0.82, y + h * 0.35], [x + w, y + h]], WHITE);
    // sea + ice floes at the bottom
    cv.rect(x, y + h * 0.82, w, h * 0.18, [150, 190, 215]);
    cv.hline(x, y + h * 0.82, w, [90, 140, 175]);
    cv.poly([[x + w * 0.1, y + h * 0.9], [x + w * 0.24, y + h * 0.87], [x + w * 0.3, y + h * 0.93], [x + w * 0.14, y + h * 0.96]], WHITE);
    cv.poly([[x + w * 0.58, y + h * 0.92], [x + w * 0.72, y + h * 0.88], [x + w * 0.8, y + h * 0.94], [x + w * 0.62, y + h * 0.97]], WHITE);
    flagDK(x + w * 0.06, y + h * 0.08, w * 0.2, h * 0.3);
    flagUS(x + w * 0.3, y + h * 0.08, w * 0.2, h * 0.3);
    cv.text(SERIF, Math.round(h * 0.4), x + w * 0.62, y + h * 0.42, "109–0", NAVY, "l");
    return;
  }
  if (n === 11) {
    cv.rect(x, y, w, h, [232, 236, 232]);
    const bw = w / 6;
    for (let i = 0; i < 4; i++) {
      const bh = h * (0.25 + i * 0.12);
      cv.rect(x + w * 0.06 + i * bw, y + h * 0.85 - bh, bw * 0.6, bh, i < 3 ? [70, 110, 170] : RED2);
    }
    // "4.9%" in navy, top-right on the light background — never over the red bar
    cv.text(SERIF, Math.round(h * 0.36), x + w * 0.97, y + h * 0.3, "4.9%", NAVY, "r");
    return;
  }
  if (n === 12) {
    skyBand(x, y, w, h, SKY2, SAND);
    // crowd
    const SKINS: RGB[] = [SKIN, SKIN2, [196, 160, 120]];
    const SHIRTS: RGB[] = [[178, 34, 34], NAVY2, GREEN, TEAL, [120, 84, 52]];
    const cols = 5;
    for (let r2 = 0; r2 < 2; r2++) {
      for (let i = 0; i < cols; i++) {
        const cx0 = x + w * (0.08 + i * 0.18) + (r2 ? w * 0.07 : 0);
        const cy0 = y + h * (0.52 + r2 * 0.24);
        cv.circle(cx0, cy0, h * 0.09, SKINS[(i + r2) % 3]);
        cv.rect(cx0 - h * 0.1, cy0 + h * 0.08, h * 0.2, h * 0.22, SHIRTS[(i + r2) % 5]);
      }
    }
    cv.rect(x + w * 0.1, y + h * 0.06, w * 0.8, h * 0.26, WHITE);
    cv.strokeRect(x + w * 0.1, y + h * 0.06, w * 0.8, h * 0.26, RED, 1);
    cv.text(SANSB, Math.round(h * 0.2), x + w * 0.5, y + h * 0.27, "STRIKE", RED, "c");
    return;
  }
  if (n === 13) {
    cv.rect(x, y, w, h, [226, 214, 196]);
    // track lanes
    cv.rect(x, y + h * 0.55, w, h * 0.4, [176, 84, 60]);
    cv.hline(x, y + h * 0.66, w, WHITE);
    cv.hline(x, y + h * 0.8, w, WHITE);
    // runner
    const rx = x + w * 0.42, ry = y + h * 0.42;
    cv.circle(rx, ry - h * 0.14, h * 0.1, SKIN);
    cv.line(rx, ry - h * 0.05, rx + w * 0.06, ry + h * 0.22, NAVY, 3);
    cv.line(rx, ry + h * 0.22, rx - w * 0.05, ry + h * 0.42, NAVY, 3);
    cv.line(rx, ry + h * 0.22, rx + w * 0.09, ry + h * 0.38, NAVY, 3);
    cv.line(rx, ry, rx - w * 0.08, ry - h * 0.08, NAVY, 3);
    // stamp
    cv.rect(x + w * 0.62, y + h * 0.1, w * 0.34, h * 0.3, WHITE);
    cv.strokeRect(x + w * 0.62, y + h * 0.1, w * 0.34, h * 0.3, RED, 2);
    cv.text(SANSB, Math.round(h * 0.16), x + w * 0.79, y + h * 0.32, "BANNED", RED, "c");
    return;
  }
  if (n === 14) {
    skyBand(x, y, w, h, [240, 200, 150], SAND);
    cv.rect(x + w * 0.12, y + h * 0.4, w * 0.6, h * 0.55, [120, 100, 84]);
    cv.rect(x + w * 0.2, y + h * 0.5, w * 0.08, h * 0.12, [250, 220, 110]);
    cv.rect(x + w * 0.42, y + h * 0.5, w * 0.08, h * 0.12, [250, 220, 110]);
    // flames
    cv.poly([[x + w * 0.3, y + h * 0.42], [x + w * 0.38, y + h * 0.05], [x + w * 0.44, y + h * 0.3], [x + w * 0.52, y + h * 0.0], [x + w * 0.58, y + h * 0.42]], ORANGE);
    cv.poly([[x + w * 0.38, y + h * 0.42], [x + w * 0.44, y + h * 0.18], [x + w * 0.5, y + h * 0.42]], [250, 210, 90]);
    cv.circle(x + w * 0.68, y + h * 0.2, h * 0.1, [140, 140, 140]);
    cv.circle(x + w * 0.78, y + h * 0.12, h * 0.08, [160, 160, 160]);
    return;
  }
  if (n === 15) {
    skyBand(x, y, w, h, SKY2, CREAM);
    // Knesset: flat-roofed parliament block, NO dome (a dome reads as a mosque)
    const cx0 = x + w * 0.5, base = y + h * 0.92;
    cv.rect(x + w * 0.18, base - h * 0.3, w * 0.64, h * 0.3, WHITE);
    // entablature band + raised central block on the flat roof
    cv.rect(x + w * 0.18, base - h * 0.3, w * 0.64, h * 0.05, [220, 220, 214]);
    cv.rect(cx0 - w * 0.15, base - h * 0.42, w * 0.3, h * 0.12, WHITE);
    cv.strokeRect(cx0 - w * 0.15, base - h * 0.42, w * 0.3, h * 0.12, [200, 200, 192], 1);
    // tall columns across the facade
    for (let i = 0; i < 5; i++) cv.rect(x + w * 0.22 + i * w * 0.12, base - h * 0.25, w * 0.05, h * 0.25, NAVY2);
    // Israeli flag on a pole above the roof block (wider than tall, but not a ribbon)
    cv.vline(cx0, base - h * 0.66, h * 0.24, NAVY2);
    flagIL(cx0 + 2, base - h * 0.66, w * 0.14, h * 0.22);
    return;
  }
  // 16: tank + yellow line
  cv.rect(x, y, w, h, SAND);
  cv.rect(x, y + h * 0.72, w, h * 0.28, [210, 190, 150]);
  cv.rect(x + w * 0.12, y + h * 0.5, w * 0.55, h * 0.24, [96, 104, 72]);
  cv.rect(x + w * 0.28, y + h * 0.34, w * 0.3, h * 0.18, [110, 118, 84]);
  cv.line(x + w * 0.58, y + h * 0.4, x + w * 0.9, y + h * 0.34, [80, 88, 60], 3);
  cv.hline(x, y + h * 0.24, w, [232, 200, 40]);
  cv.rect(x, y + h * 0.24, w, 3, [232, 200, 40]);
}

// ---- dotted world map: land runs [row, c0, c1] on a 40x18 grid ----
const LAND: [number, number, number][] = [
  [1, 2, 7], [1, 13, 15],
  [2, 2, 11], [2, 13, 15], [2, 19, 23], [2, 25, 38],
  [3, 2, 11], [3, 18, 18], [3, 19, 24], [3, 25, 39],
  [4, 3, 10], [4, 20, 24], [4, 25, 39],
  [5, 3, 10], [5, 20, 22], [5, 26, 38],
  [6, 4, 9], [6, 21, 26], [6, 27, 37],
  [7, 5, 9], [7, 21, 27], [7, 28, 36],
  [8, 6, 8], [8, 21, 27], [8, 29, 35],
  [9, 7, 8], [9, 22, 27], [9, 30, 34],
  [10, 8, 11], [10, 22, 26], [10, 32, 35],
  [11, 8, 12], [11, 23, 26], [11, 33, 34],
  [12, 9, 12], [12, 23, 25],
  [13, 9, 11], [13, 24, 25], [13, 34, 38],
  [14, 10, 11], [14, 34, 38],
  [15, 10, 10], [15, 35, 37],
];
// pin positions [story, grid col, grid row]
const PINS: [number, number, number][] = [
  [1, 31.6, 7.3], [2, 19.3, 3.2], [3, 22.2, 5.3], [4, 10.7, 4.7],
  [5, 38, 16.1], [6, 28.3, 7.6], [7, 22.7, 4.2], [8, 24.1, 6.9],
  [9, 33, 5.3], [10, 14.2, 1.5], [11, 35.4, 15.2], [12, 10.7, 9.7],
  [13, 23, 10.5], [14, 28.9, 7.1], [15, 10.3, 5.0], [16, 22.7, 6.1],
];

function drawMap(x: number, y: number, w: number, h: number): void {
  const cols = 40, rows = 18;
  const dx = w / cols, dy = h / rows;
  const dot: RGB = [120, 138, 155];
  for (const [r, c0, c1] of LAND) {
    for (let c = c0; c <= c1; c++) {
      cv.circle(x + (c + 0.5) * dx, y + (r + 0.5) * dy, 2.1, dot);
    }
  }
  for (const [n, c, r] of PINS) {
    const px = x + (c + 0.5) * dx, py = y + (r + 0.5) * dy;
    cv.circle(px, py, 7, RED);
    cv.circle(px, py, 7, RED);
    cv.text(SANSB, 8, px, py + 3, String(n), WHITE, "c");
  }
}

// ---- top strips ----
function drawKicker(): void {
  cv.text(SANSB, 12, 16, 20, "THE WORLD IN ONE DAY", RED);
  cv.text(SANSB, 11, 1008, 20, "36 STORIES · 7 REGIONS · 16 DRAWN · ALL FROM THIS THURSDAY", INK, "r");
  cv.hline(16, 26, 992, INK);
}
function drawMasthead(): void {
  const size = fitSerif("Thursday 19 November 2026", 992, 68);
  cv.text(SERIF, size, 512, 92, "Thursday 19 November 2026", INK, "c");
  cv.text(SERIF, 15, 512, 116, "Trump, Xi and Putin share one table · The World Court finds genocide in Myanmar · COP31’s draft drops fossil fuels", RED, "c");
}
function drawRegions(): void {
  const y = 124, h = 24, w = 992 / REGIONS.length;
  REGIONS.forEach(([name, count], i) => {
    const x = 16 + i * w;
    cv.rect(x + 1, y, w - 2, h, REG_COLOR[name] ?? INK);
    cv.text(SANSB, 12, x + w / 2, y + 17, name + " " + count, WHITE, "c");
  });
}
function drawNumbers(): void {
  const stats: [string, string][] = [
    ["3", "presidents at one table"],
    ["9–6", "World Court vote"],
    ["$81.3bn", "Anthropic IPO"],
    ["15.9m", "GTA VI pre-orders"],
    ["200,000", "evacuated ahead of Akvan"],
    ["$120bn", "COP31 goal unresolved"],
  ];
  const y = 152;
  cv.text(SANSB, 10, 16, y + 10, "THE DAY", RED);
  cv.text(SANSB, 10, 16, y + 22, "IN NUMBERS", RED);
  const colW = (992 - 92) / 6;
  stats.forEach(([num, label], i) => {
    const x = 108 + i * colW;
    cv.text(SERIF, 23, x, y + 26, num, NAVY);
    const lines = cv.wrap(SANS, 10, label, colW - 8);
    lines.slice(0, 2).forEach((ln, k) => cv.text(SANS, 10, x, y + 38 + k * 12, ln, GREY));
    if (i < 5) cv.vline(x + colW - 4, y + 6, 40, LGREY);
  });
  cv.hline(16, y + 50, 992, LGREY);
}
function drawUTC(): void {
  const y = 206;
  cv.text(SANSB, 10, 16, y + 10, "THE DAY", RED);
  cv.text(SANSB, 10, 16, y + 22, "IN UTC", RED);
  const pts: [string, string][] = [
    ["00:00 Auckland", "GTA VI unlocks"],
    ["04:42 Riyadh", "air-raid sirens"],
    ["08:00 Seoul", "exam begins"],
    ["09:30 Jakarta", "law passed"],
    ["P.M. Shenzhen", "three leaders meet"],
    ["10:00 Hague", "genocide ruling"],
    ["21:00 New York", "market opens"],
  ];
  const x0 = 128, x1 = 1000, lineY = y + 22;
  cv.hline(x0, lineY, x1 - x0, NAVY);
  pts.forEach(([t, ev], i) => {
    const cx0 = x0 + ((x1 - x0) * i) / (pts.length - 1);
    const lx = Math.max(x0 + 50, Math.min(x1 - 50, cx0));
    cv.circle(cx0, lineY, 4, NAVY);
    cv.circle(cx0, lineY, 2, WHITE);
    cv.text(SANSB, 10, lx, lineY - 6, t, INK, "c");
    cv.text(SANS, 9, lx, lineY + 14, ev, GREY, "c");
  });
}

// ---- panels ----
function heroPanel(s: Story, x: number, y: number, w: number): void {
  const HP = 196;
  cv.rect(x, y, w, HP, PANEL);
  cv.strokeRect(x, y, w, HP, LGREY, 1);
  scene(s.n, x + 4, y + 4, w - 8, 92);
  numBadge(x + 8, y + 100, s.n, 16);
  cv.text(SANSB, 11, x + 28, y + 112, s.tag, REG_COLOR[s.region] ?? INK);
  cv.text(SANS, 9, x + w - 8, y + 112, s.src, GREY, "r");
  cv.para(SERIF, 17, x + 8, y + 118, s.head, w - 16, 19, INK, 2);
  cv.para(SANS, 11, x + 8, y + 158, s.deck, w - 16, 12.5, [60, 58, 52], 3);
}

function midPanel(s: Story, x: number, y: number, w: number): void {
  const HP = 132;
  cv.rect(x, y, w, HP, PANEL);
  cv.strokeRect(x, y, w, HP, LGREY, 1);
  sceneMid(s.n, x + 3, y + 3, w - 6, 38);
  numBadge(x + 6, y + 44, s.n, 11);
  cv.text(SANSB, 9.5, x + 20, y + 53, s.tag, REG_COLOR[s.region] ?? INK);
  const tagW = cv.textWidth(SANSB, 9.5, s.tag);
  const srcW = cv.textWidth(SANS, 8, s.src);
  if (20 + tagW + 8 + srcW <= w - 6) cv.text(SANS, 8, x + w - 6, y + 53, s.src, GREY, "r");
  cv.para(SERIF, 12.5, x + 6, y + 58, s.head, w - 12, 14, INK, 3);
  cv.para(SANS, 10, x + 6, y + 102, s.deck, w - 12, 12, [60, 58, 52], 2);
}

// ---- bottom ----
function drawBottom(): void {
  const y = 730, bh = 180;
  // map panel
  cv.rect(16, y, 330, bh, PANEL);
  cv.strokeRect(16, y, 330, bh, LGREY, 1);
  cv.text(SANSB, 11, 24, y + 14, "WHERE IT HAPPENED", RED);
  drawMap(22, y + 20, 318, 136);
  cv.text(SANS, 8.5, 24, y + 168, "Red pins: stories 1–16; grey dots: briefs.", GREY);
  cv.text(SANS, 8.5, 24, y + 178, "Positions approximate.", GREY);
  // also-on panel
  cv.rect(354, y, 654, bh, PANEL);
  cv.strokeRect(354, y, 654, bh, LGREY, 1);
  cv.text(SANSB, 11, 362, y + 14, "ALSO ON THURSDAY 19 NOVEMBER — 20 MORE STORIES", RED);
  const colW = 319, rowH = 15.6;
  BRIEFS.forEach((b, i) => {
    const col = i < 10 ? 0 : 1;
    const row = i % 10;
    const bx = 362 + col * (colW + 8);
    const by = y + 22 + row * rowH;
    const [n, place, sum, src] = b;
    cv.text(SANSB, 9.5, bx, by + 10, String(n), RED);
    const px = bx + 20;
    cv.text(SANSB, 9.5, px, by + 10, place, INK);
    let rest = " — " + sum + " " + src;
    let fs = 9.5;
    const pw = cv.textWidth(SANSB, 9.5, place);
    let rw = cv.textWidth(SANS, fs, rest);
    if (px + pw + rw > bx + colW) {
      fs = 9;
      rw = cv.textWidth(SANS, fs, rest);
    }
    if (px + pw + rw > bx + colW) {
      // trim the summary to fit, keep the source
      const tail = " " + src;
      const tailW = cv.textWidth(SANS, fs, tail);
      let s2 = sum;
      while (s2.length > 4 && px + pw + cv.textWidth(SANS, fs, " — " + s2 + "…" + tail) > bx + colW) s2 = s2.slice(0, -1);
      rest = " — " + s2 + "…" + tail;
    }
    cv.text(SANS, fs, px + pw, by + 10, rest, GREY);
  });
}

function drawDateCheck(): void {
  const y = 916, h = 44;
  cv.strokeRect(16, y, 992, h, RED, 2);
  const full = "DATE CHECK — LEFT OUT AS OTHER DAYS’ NEWS: 18 NOV: EU’s €45bn Ukraine loan plan · Iran fires on Kuwait and Bahrain · Nvidia results · Jeffries named for US speaker · Van Gogh sold for $190.4m. 20 NOV: COP31’s scheduled close · Cyclone Akvan’s landfall.";
  const lines = cv.wrap(SANS, 11, full, 976).slice(0, 3);
  lines.forEach((ln, i) => {
    const ly = y + 14 + i * 13;
    if (i === 0 && ln.startsWith("DATE CHECK")) {
      cv.text(SANSB, 11, 24, ly, "DATE CHECK", RED);
      const w0 = cv.textWidth(SANSB, 11, "DATE CHECK");
      cv.text(SANS, 11, 24 + w0, ly, ln.slice("DATE CHECK".length), INK);
    } else {
      cv.text(SANS, 11, 24, ly, ln, INK);
    }
  });
}

function drawFooter(): void {
  cv.text(SANSB, 10.5, 512, 978, "HOW SURE ARE WE?  REPORTED — named wire or official source · CLAIM — one side’s account, attributed · FORECAST — expected, not yet happened.", INK, "c");
  cv.text(SANS, 8.5, 512, 996, "Every story here happened, or was first reported, on Thursday 19 November 2026. Sources: Reuters, AP, AFP, BBC, Al Jazeera, UN News, Euronews, ABC, IMD, Infobae. Original drawings.", GREY, "c");
}

// ---- build ----
function main(): void {
  drawKicker();
  drawMasthead();
  drawRegions();
  drawNumbers();
  drawUTC();
  // heroes
  const hw = (992 - 16) / 3;
  for (let i = 0; i < 3; i++) heroPanel(STORIES[i], 16 + i * (hw + 8), 254, hw);
  // mids row A: stories 4-10 (7 panels)
  const aw = (992 - 6 * 6) / 7;
  for (let i = 0; i < 7; i++) midPanel(STORIES[3 + i], 16 + i * (aw + 6), 456, aw);
  // mids row B: stories 11-16 (6 panels)
  const bw = (992 - 5 * 6) / 6;
  for (let i = 0; i < 6; i++) midPanel(STORIES[10 + i], 16 + i * (bw + 6), 592, bw);
  drawBottom();
  drawDateCheck();
  drawFooter();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "entry.png");
  fs.writeFileSync(outPath, encodePNG(W, H, cv.buf));
  console.log("wrote " + outPath + " " + fs.statSync(outPath).size + " bytes");
}

main();
