// font.ts — minimal TrueType reader + glyph rasterizer (even-odd scanline).
// Fresh code for news-image-20261119 akun 1. No deps, stdlib only.
import * as fs from "node:fs";

export type Pt = [number, number];

export interface Font {
  upm: number;
  numGlyphs: number;
  indexToLocFormat: number;
  numHMetrics: number;
  cmap: Map<number, number>;
  hmtx: Buffer;
  loca: Buffer;
  glyf: Buffer;
}

function u16(b: Buffer, o: number): number { return b.readUInt16BE(o); }
function i16(b: Buffer, o: number): number { return b.readInt16BE(o); }
function u32(b: Buffer, o: number): number { return b.readUInt32BE(o); }

export function loadFont(file: string): Font {
  const b = fs.readFileSync(file);
  const numTables = u16(b, 4);
  const tables = new Map<string, { off: number; len: number }>();
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    const tag = b.toString("ascii", o, o + 4);
    tables.set(tag, { off: u32(b, o + 8), len: u32(b, o + 12) });
  }
  const need = (t: string): { off: number; len: number } => {
    const x = tables.get(t);
    if (!x) throw new Error("missing table " + t);
    return x;
  };
  const head = need("head");
  const maxp = need("maxp");
  const hhea = need("hhea");
  const hmtxT = need("hmtx");
  const locaT = need("loca");
  const glyfT = need("glyf");
  const cmapT = need("cmap");
  const upm = u16(b, head.off + 18);
  const indexToLocFormat = i16(b, head.off + 50);
  const numGlyphs = u16(b, maxp.off + 4);
  const numHMetrics = u16(b, hhea.off + 34);
  const cmap = parseCmap4(b, cmapT.off);
  return {
    upm, numGlyphs, indexToLocFormat, numHMetrics, cmap,
    hmtx: b.subarray(hmtxT.off, hmtxT.off + hmtxT.len),
    loca: b.subarray(locaT.off, locaT.off + locaT.len),
    glyf: b.subarray(glyfT.off, glyfT.off + glyfT.len),
  };
}

function parseCmap4(b: Buffer, off: number): Map<number, number> {
  const map = new Map<number, number>();
  const numTables = u16(b, off + 2);
  let fmt4off = -1;
  for (let i = 0; i < numTables; i++) {
    const platform = u16(b, off + 4 + i * 8);
    const encoding = u16(b, off + 6 + i * 8);
    const sub = u32(b, off + 8 + i * 8);
    const fmt = u16(b, off + sub);
    if (fmt === 4 && fmt4off < 0) fmt4off = off + sub;
    if (fmt === 4 && platform === 3 && encoding === 1) { fmt4off = off + sub; break; }
  }
  if (fmt4off < 0) return map;
  const segCount = u16(b, fmt4off + 6) / 2;
  const endBase = fmt4off + 14;
  const startBase = endBase + segCount * 2 + 2;
  const deltaBase = startBase + segCount * 2;
  const rangeBase = deltaBase + segCount * 2;
  const glyphBase = rangeBase + segCount * 2;
  for (let i = 0; i < segCount; i++) {
    const end = u16(b, endBase + i * 2);
    const start = u16(b, startBase + i * 2);
    const delta = i16(b, deltaBase + i * 2);
    const rangeOff = u16(b, rangeBase + i * 2);
    if (start === 0xffff && end === 0xffff) continue;
    for (let c = start; c <= end; c++) {
      let g = 0;
      if (rangeOff === 0) {
        g = (c + delta) & 0xffff;
      } else {
        const idx = i + rangeOff / 2 + (c - start) - segCount;
        const pos = glyphBase + idx * 2;
        if (pos + 1 < b.length) {
          const v = u16(b, pos);
          if (v !== 0) g = (v + delta) & 0xffff;
        }
      }
      if (g !== 0) map.set(c, g);
    }
  }
  return map;
}

export function glyphId(font: Font, cp: number): number {
  return font.cmap.get(cp) ?? 0;
}

export function advance(font: Font, gid: number, size: number): number {
  const i = Math.min(gid, font.numHMetrics - 1);
  const adv = u16(font.hmtx, i * 4);
  return (adv * size) / font.upm;
}

function glyphOffset(font: Font, gid: number): [number, number] {
  if (gid >= font.numGlyphs) return [0, 0];
  if (font.indexToLocFormat === 1) {
    return [u32(font.loca, gid * 4), u32(font.loca, (gid + 1) * 4)];
  }
  return [u16(font.loca, gid * 2) * 2, u16(font.loca, (gid + 1) * 2) * 2];
}

// Outline of one glyph as flattened contours (font units, y up).
// Each contour is a list of points forming a closed polygon.
export function glyphOutline(font: Font, gid: number): Pt[][] {
  const [o0, o1] = glyphOffset(font, gid);
  if (o1 <= o0) return [];
  const g = font.glyf;
  const nContours = i16(g, o0);
  if (nContours >= 0) return simpleOutline(g, o0, nContours);
  // composite glyph
  const out: Pt[][] = [];
  let p = o0 + 10;
  for (;;) {
    const flags = u16(g, p);
    const compGid = u16(g, p + 2);
    p += 4;
    let dx = 0, dy = 0;
    if (flags & 0x0001) { dx = i16(g, p); dy = i16(g, p + 2); p += 4; }
    else { dx = g.readInt8(p); dy = g.readInt8(p + 1); p += 2; }
    let a = 1, b2 = 0, c2 = 0, d = 1;
    if (flags & 0x0008) { const s = i16(g, p) / 16384; a = s; d = s; p += 2; }
    else if (flags & 0x0040) { a = i16(g, p) / 16384; d = i16(g, p + 2) / 16384; p += 4; }
    else if (flags & 0x0080) { a = i16(g, p) / 16384; b2 = i16(g, p + 2) / 16384; c2 = i16(g, p + 4) / 16384; d = i16(g, p + 6) / 16384; p += 8; }
    const sub = glyphOutline(font, compGid);
    for (const contour of sub) {
      out.push(contour.map(([x, y]): Pt => [a * x + c2 * y + dx, b2 * x + d * y + dy]));
    }
    if (!(flags & 0x0020)) break;
  }
  return out;
}

function simpleOutline(g: Buffer, o: number, nContours: number): Pt[][] {
  const endPts: number[] = [];
  for (let i = 0; i < nContours; i++) endPts.push(u16(g, o + 10 + i * 2));
  const instrLen = u16(g, o + 10 + nContours * 2);
  let p = o + 12 + nContours * 2 + instrLen;
  const nPts = endPts.length ? endPts[endPts.length - 1] + 1 : 0;
  const flags: number[] = [];
  while (flags.length < nPts) {
    const f = g[p++];
    flags.push(f);
    if (f & 0x08) {
      const rep = g[p++];
      for (let k = 0; k < rep; k++) flags.push(f);
    }
  }
  const xs: number[] = [];
  let x = 0;
  for (let i = 0; i < nPts; i++) {
    const f = flags[i];
    if (f & 0x02) {
      const d = g[p++];
      x += f & 0x10 ? d : -d;
    } else if (!(f & 0x10)) {
      x += i16(g, p);
      p += 2;
    }
    xs.push(x);
  }
  const ys: number[] = [];
  let y = 0;
  for (let i = 0; i < nPts; i++) {
    const f = flags[i];
    if (f & 0x04) {
      const d = g[p++];
      y += f & 0x20 ? d : -d;
    } else if (!(f & 0x20)) {
      y += i16(g, p);
      p += 2;
    }
    ys.push(y);
  }
  const contours: Pt[][] = [];
  let start = 0;
  for (let ci = 0; ci < nContours; ci++) {
    const end = endPts[ci];
    const pts: { x: number; y: number; on: boolean }[] = [];
    for (let i = start; i <= end; i++) pts.push({ x: xs[i], y: ys[i], on: (flags[i] & 0x01) !== 0 });
    contours.push(flattenContour(pts));
    start = end + 1;
  }
  return contours;
}

function mid(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function flattenContour(pts: { x: number; y: number; on: boolean }[]): Pt[] {
  if (pts.length === 0) return [];
  // Build walk: sequence of (on-curve point, optional control point) pairs.
  const seq: { p: { x: number; y: number }; ctrl: { x: number; y: number } | null }[] = [];
  const n = pts.length;
  let i = 0;
  // find a starting on-curve point; if none, start at implied midpoint
  let startIdx = 0;
  while (startIdx < n && !pts[startIdx].on) startIdx++;
  if (startIdx === n) {
    // all off-curve: implied points between each pair
    for (let k = 0; k < n; k++) {
      const a = pts[k], b2 = pts[(k + 1) % n];
      seq.push({ p: mid(a, b2), ctrl: b2 });
    }
  } else {
    i = startIdx;
    for (let k = 0; k < n; k++) {
      const cur = pts[(startIdx + k) % n];
      const nxt = pts[(startIdx + k + 1) % n];
      if (cur.on) {
        if (nxt.on) seq.push({ p: cur, ctrl: null });
        else seq.push({ p: cur, ctrl: nxt });
      } else {
        // cur off-curve: implied on-curve point between prev and cur was
        // already handled when we saw prev; if prev was off-curve too,
        // the implied midpoint is the start of this quadratic.
        const prev = pts[(startIdx + k - 1 + n) % n];
        if (!prev.on) seq.push({ p: mid(prev, cur), ctrl: cur });
        // if prev was on-curve, this cur was already recorded as ctrl
      }
    }
  }
  // Emit polygon points from the walk.
  const out: Pt[] = [];
  // 16 segments per quadratic: chord error stays well under 0.05 px even
  // at masthead size, so curves render smooth instead of faceted.
  const SUB = 16;
  for (let k = 0; k < seq.length; k++) {
    const cur = seq[k];
    const nxt = seq[(k + 1) % seq.length];
    if (cur.ctrl === null) {
      out.push([cur.p.x, cur.p.y]);
    } else {
      const c = cur.ctrl;
      const p0 = cur.p, p1 = nxt.p;
      for (let s = 1; s <= SUB; s++) {
        const t = s / SUB;
        const mt = 1 - t;
        out.push([
          mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
          mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y,
        ]);
      }
    }
  }
  return out;
}

// ---- rasterization (scanline fill, even-odd, 4x supersample) ----

export interface GlyphBitmap {
  w: number; // final-pixel width
  h: number; // final-pixel height
  dx: number; // left bearing in final pixels (from pen x)
  dy: number; // top offset in final pixels (from baseline, negative = above)
  adv: number; // advance width in final pixels
  alpha: Uint8Array; // w*h, 0..255
}

const SSG = 8; // glyph supersample factor (8x8 = 65 grey levels per pixel)

const cache = new WeakMap<Font, Map<string, GlyphBitmap | null>>();

export function rasterize(font: Font, size: number, cp: number): GlyphBitmap | null {
  let fc = cache.get(font);
  if (!fc) { fc = new Map(); cache.set(font, fc); }
  const key = size + ":" + cp;
  const hit = fc.get(key);
  if (hit !== undefined) return hit;
  const gb = rasterizeFresh(font, size, cp);
  fc.set(key, gb);
  return gb;
}

function rasterizeFresh(font: Font, size: number, cp: number): GlyphBitmap | null {
  const gid = glyphId(font, cp);
  const adv = advance(font, gid, size);
  if (gid === 0) return { w: 0, h: 0, dx: 0, dy: 0, adv, alpha: new Uint8Array(0) };
  const contours = glyphOutline(font, gid);
  if (contours.length === 0) return { w: 0, h: 0, dx: 0, dy: 0, adv, alpha: new Uint8Array(0) };
  const scale = size / font.upm;
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (const c of contours) for (const [x, y] of c) {
    if (x < xMin) xMin = x; if (x > xMax) xMax = x;
    if (y < yMin) yMin = y; if (y > yMax) yMax = y;
  }
  // Integer bitmap origin in final-pixel units (relative to pen/baseline).
  // The old code anchored the outline at the EXACT fractional bbox corner
  // (xMin, yMax) but placed the bitmap at the ROUNDED corner, silently
  // discarding up to 1 px of fractional offset per glyph, differently for
  // every glyph: neighbouring letters ended up shifted 0-1.5 px against
  // each other, so baselines and letter tops wobbled — the "wavy" text.
  // Anchoring to the integer origin instead keeps the fractional offset
  // INSIDE the bitmap as subpixel coverage: every glyph now shares one
  // exact pixel grid, vertical placement is exact (baseline wobble gone),
  // and horizontal placement keeps only the pen rounding (+/-0.5 px).
  const bx = Math.floor(xMin * scale);
  const by = Math.ceil(yMax * scale);
  const bw = Math.max(1, Math.ceil(xMax * scale) - bx + 1);
  const bh = Math.max(1, by - Math.floor(yMin * scale) + 1);
  const sw = bw * SSG, sh = bh * SSG;
  const cover = new Uint8Array(sw * sh);
  // edges in subpixel coords relative to the integer origin (bx, by):
  // sx = (x*scale - bx) * SSG, sy = (by - y*scale) * SSG
  const edges: number[] = []; // flat x0,y0,x1,y1
  for (const c of contours) {
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b2 = c[(i + 1) % c.length];
      const x0 = (a[0] * scale - bx) * SSG;
      const y0 = (by - a[1] * scale) * SSG;
      const x1 = (b2[0] * scale - bx) * SSG;
      const y1 = (by - b2[1] * scale) * SSG;
      if (y0 === y1) continue;
      edges.push(x0, y0, x1, y1);
    }
  }
  const xs: number[] = [];
  for (let r = 0; r < sh; r++) {
    const y = r + 0.5;
    xs.length = 0;
    for (let e = 0; e < edges.length; e += 4) {
      const x0 = edges[e], y0 = edges[e + 1], x1 = edges[e + 2], y1 = edges[e + 3];
      if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) {
        xs.push(x0 + (y - y0) * (x1 - x0) / (y1 - y0));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const c1 = Math.min(sw, Math.ceil(xs[k + 1] - 0.5));
      for (let cx = c0; cx < c1; cx++) cover[r * sw + cx] = 1;
    }
  }
  const alpha = new Uint8Array(bw * bh);
  for (let py = 0; py < bh; py++) {
    for (let px = 0; px < bw; px++) {
      let s = 0;
      for (let yy = 0; yy < SSG; yy++) {
        const row = (py * SSG + yy) * sw + px * SSG;
        for (let xx = 0; xx < SSG; xx++) s += cover[row + xx];
      }
      alpha[py * bw + px] = Math.round((s * 255) / (SSG * SSG));
    }
  }
  return {
    w: bw, h: bh,
    dx: bx,
    dy: -by,
    adv, alpha,
  };
}

export function measure(font: Font, size: number, text: string): number {
  let w = 0;
  for (const ch of text) {
    const gid = glyphId(font, ch.codePointAt(0) as number);
    w += advance(font, gid, size);
  }
  return w;
}
