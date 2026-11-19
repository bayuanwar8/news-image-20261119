// THE WORLD IN WOODCUT — Thursday 19 November 2026
// A one-page newspaper front page drawn in woodcut-block style.
// Node 22, standard library only. No network, no Date, no randomness.
// Writes a deterministic 1024x1024 PNG to out/entry.png (or $MAKEFUN_OUTPUT_DIR).

import * as fs from 'node:fs';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';
import * as path from 'node:path';

// ---------------------------------------------------------------- palette
type RGB = [number, number, number];
const PAPER: RGB = [245, 235, 210];
const PAPER2: RGB = [238, 226, 196];
const INK: RGB = [28, 22, 18];
const RED: RGB = [178, 44, 28];
const NAVY: RGB = [30, 55, 95];
const OCHRE: RGB = [198, 138, 28];
const TEAL: RGB = [38, 105, 85];
const PLUM: RGB = [110, 45, 70];
const LEAF: RGB = [110, 140, 95];
const LEAF_D: RGB = [88, 116, 76];
const WHITE: RGB = [252, 250, 244];
const GREY: RGB = [110, 105, 95];
const LGREY: RGB = [200, 192, 172];
const SKY: RGB = [232, 180, 110]; // warm woodcut sunset sky
const SKY2: RGB = [222, 140, 80];
const SEA: RGB = [214, 222, 205]; // pale sea for the map

// ---------------------------------------------------------------- canvas
const W = 1024;
const H = 1024;
const SS = 4; // supersampling factor
const SW = W * SS;
const SH = H * SS;
const buf = new Uint8Array(SW * SH * 3);

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= SW || y >= SH) return;
  const i = (y * SW + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x * SS));
  const y0 = Math.max(0, Math.round(y * SS));
  const x1 = Math.min(SW, Math.round((x + w) * SS));
  const y1 = Math.min(SH, Math.round((y + h) * SS));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * SW + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      i += 3;
    }
  }
}

// Fill the whole canvas.
fillRect(0, 0, W, H, PAPER);

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function encodePNG(rgb: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (1 + w * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Downsample the 4x buffer to 1024x1024 by box average.
function downsample(): Uint8Array {
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < SS; dy++) {
        let i = ((y * SS + dy) * SW + x * SS) * 3;
        for (let dx = 0; dx < SS; dx++) {
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
          i += 3;
        }
      }
      const o = (y * W + x) * 3;
      out[o] = Math.round(r / (SS * SS));
      out[o + 1] = Math.round(g / (SS * SS));
      out[o + 2] = Math.round(b / (SS * SS));
    }
  }
  return out;
}

// Deterministic integer hash for paper grain (no randomness).
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) % 1000;
}

// Subtle paper grain: sparse darker speckles, only on paper-coloured pixels.
function applyGrain(rgb: Uint8Array): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      const r = rgb[o], g = rgb[o + 1], b = rgb[o + 2];
      if (Math.abs(r - PAPER[0]) < 26 && Math.abs(g - PAPER[1]) < 26 && Math.abs(b - PAPER[2]) < 26) {
        const hv = hash2(x, y);
        if (hv < 7) {
          rgb[o] = Math.max(0, r - 14);
          rgb[o + 1] = Math.max(0, g - 13);
          rgb[o + 2] = Math.max(0, b - 11);
        } else if (hv < 12) {
          rgb[o] = Math.min(255, r + 8);
          rgb[o + 1] = Math.min(255, g + 7);
          rgb[o + 2] = Math.min(255, b + 5);
        }
      }
    }
  }
}

function writeOutput(): string {
  const rgb = downsample();
  applyGrain(rgb);
  const png = encodePNG(rgb, W, H);
  const dir = process.env.MAKEFUN_OUTPUT_DIR || path.join(process.cwd(), 'out');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'entry.png');
  fs.writeFileSync(file, png);
  const sha = crypto.createHash('sha256').update(png).digest('hex');
  console.log(`wrote ${file} bytes=${png.length} sha256=${sha}`);
  if (png.length > 1024 * 1024) throw new Error(`PNG too big: ${png.length} bytes`);
  return sha;
}

// ---------------------------------------------------------------- TrueType
interface Pt { x: number; y: number; on: boolean }
type Seg = [number, number, number, number]; // x0,y0,x1,y1 in font units

interface Font {
  data: Buffer;
  unitsPerEm: number;
  numGlyphs: number;
  indexToLocFormat: number;
  tables: Map<string, { off: number; len: number }>;
  cmap4: { end: number[]; start: number[]; delta: number[]; rangeOff: number[]; glyphs: Buffer; rangeBase: number } | null;
  cmap12: { start: number[]; end: number[]; glyph: number[] } | null;
  loca: number[];
  hmtxAdv: number[];
  ascent: number;
  descent: number;
  outlineCache: Map<number, Seg[]>;
  bitmapCache: Map<string, { w: number; h: number; data: Uint8Array; bx: number; by: number; adv: number }>;
}

function u16(b: Buffer, o: number): number { return b.readUInt16BE(o); }
function i16(b: Buffer, o: number): number { return b.readInt16BE(o); }
function u32(b: Buffer, o: number): number { return b.readUInt32BE(o); }

function loadFont(file: string): Font {
  const data = fs.readFileSync(file);
  const numTables = u16(data, 4);
  const tables = new Map<string, { off: number; len: number }>();
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    const tag = data.toString('ascii', o, o + 4);
    tables.set(tag, { off: u32(data, o + 8), len: u32(data, o + 12) });
  }
  const need = ['head', 'maxp', 'hhea', 'hmtx', 'cmap', 'loca', 'glyf'];
  for (const t of need) if (!tables.has(t)) throw new Error(`font ${file} missing table ${t}`);
  const head = tables.get('head')!;
  const unitsPerEm = u16(data, head.off + 18);
  const indexToLocFormat = i16(data, head.off + 50);
  const numGlyphs = u16(data, tables.get('maxp')!.off + 4);
  const hhea = tables.get('hhea')!;
  const ascent = i16(data, hhea.off + 4);
  const descent = i16(data, hhea.off + 6);
  const numHMetrics = u16(data, hhea.off + 34);
  const hmtx = tables.get('hmtx')!;
  const hmtxAdv: number[] = [];
  for (let i = 0; i < numHMetrics; i++) hmtxAdv.push(u16(data, hmtx.off + i * 4));
  const lastAdv = hmtxAdv[hmtxAdv.length - 1];
  for (let i = numHMetrics; i < numGlyphs; i++) hmtxAdv.push(lastAdv);
  // loca
  const locaT = tables.get('loca')!;
  const loca: number[] = [];
  for (let i = 0; i <= numGlyphs; i++) {
    loca.push(indexToLocFormat === 1 ? u32(data, locaT.off + i * 4) : u16(data, locaT.off + i * 2) * 2);
  }
  // cmap: find format 4 and format 12 subtables
  const cmapT = tables.get('cmap')!;
  const nSub = u16(data, cmapT.off + 2);
  let cmap4: Font['cmap4'] = null;
  let cmap12: Font['cmap12'] = null;
  for (let i = 0; i < nSub; i++) {
    const so = cmapT.off + 4 + i * 8;
    const subOff = cmapT.off + u32(data, so + 4);
    const fmt = u16(data, subOff);
    if (fmt === 4 && !cmap4) {
      const segCount = u16(data, subOff + 6) / 2;
      const end: number[] = []; const start: number[] = [];
      const delta: number[] = []; const rangeOff: number[] = [];
      for (let s = 0; s < segCount; s++) end.push(u16(data, subOff + 14 + s * 2));
      for (let s = 0; s < segCount; s++) start.push(u16(data, subOff + 16 + segCount * 2 + s * 2));
      for (let s = 0; s < segCount; s++) delta.push(i16(data, subOff + 16 + segCount * 4 + s * 2));
      for (let s = 0; s < segCount; s++) rangeOff.push(u16(data, subOff + 16 + segCount * 6 + s * 2));
      const glyphs = data.subarray(subOff + 16 + segCount * 8);
      cmap4 = { end, start, delta, rangeOff, glyphs, rangeBase: subOff + 16 + segCount * 6 };
    } else if (fmt === 12 && !cmap12) {
      const nGroups = u32(data, subOff + 12);
      const start: number[] = []; const end: number[] = []; const glyph: number[] = [];
      for (let g = 0; g < nGroups; g++) {
        const go = subOff + 16 + g * 12;
        start.push(u32(data, go)); end.push(u32(data, go + 4)); glyph.push(u32(data, go + 8));
      }
      cmap12 = { start, end, glyph };
    }
  }
  return {
    data, unitsPerEm, numGlyphs, indexToLocFormat, tables,
    cmap4, cmap12, loca, hmtxAdv, ascent, descent,
    outlineCache: new Map(), bitmapCache: new Map(),
  };
}

function glyphIndex(f: Font, code: number): number {
  if (f.cmap12) {
    const { start, end, glyph } = f.cmap12;
    // binary search
    let lo = 0, hi = start.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (code < start[mid]) hi = mid - 1;
      else if (code > end[mid]) lo = mid + 1;
      else return glyph[mid] + (code - start[mid]);
    }
  }
  if (f.cmap4) {
    const { end, start, delta, rangeOff, rangeBase } = f.cmap4;
    for (let s = 0; s < end.length; s++) {
      if (code >= start[s] && code <= end[s]) {
        if (rangeOff[s] === 0) return (code + delta[s]) & 0xffff;
        const addr = rangeBase + s * 2 + rangeOff[s] + (code - start[s]) * 2;
        const g = u16(f.data, addr);
        if (g === 0) return 0;
        return (g + delta[s]) & 0xffff;
      }
    }
  }
  return 0;
}

// Parse one glyph into contours (font units). Handles simple + composite.
function glyphContours(f: Font, gid: number): Pt[][] {
  const glyf = f.tables.get('glyf')!;
  const off = glyf.off + f.loca[gid];
  const end = glyf.off + f.loca[gid + 1];
  if (end <= off) return [];
  const nContours = i16(f.data, off);
  if (nContours >= 0) {
    const endPts: number[] = [];
    for (let i = 0; i < nContours; i++) endPts.push(u16(f.data, off + 10 + i * 2));
    let p = off + 10 + nContours * 2;
    const instrLen = u16(f.data, p);
    p += 2 + instrLen;
    const nPts = endPts.length ? endPts[endPts.length - 1] + 1 : 0;
    const flags: number[] = [];
    while (flags.length < nPts) {
      const fl = f.data[p++];
      flags.push(fl);
      if (fl & 0x08) {
        const rep = f.data[p++];
        for (let i = 0; i < rep; i++) flags.push(fl);
      }
    }
    const xs: number[] = [];
    let x = 0;
    for (let i = 0; i < nPts; i++) {
      const fl = flags[i];
      if (fl & 0x02) {
        const v = f.data[p++];
        x += fl & 0x10 ? v : -v;
      } else if (!(fl & 0x10)) {
        x += i16(f.data, p);
        p += 2;
      }
      xs.push(x);
    }
    const ys: number[] = [];
    let y = 0;
    for (let i = 0; i < nPts; i++) {
      const fl = flags[i];
      if (fl & 0x04) {
        const v = f.data[p++];
        y += fl & 0x20 ? v : -v;
      } else if (!(fl & 0x20)) {
        y += i16(f.data, p);
        p += 2;
      }
      ys.push(y);
    }
    const contours: Pt[][] = [];
    let prev = 0;
    for (let c = 0; c < nContours; c++) {
      const pts: Pt[] = [];
      for (let i = prev; i <= endPts[c]; i++) pts.push({ x: xs[i], y: ys[i], on: (flags[i] & 0x01) !== 0 });
      contours.push(pts);
      prev = endPts[c] + 1;
    }
    return contours;
  }
  // Composite glyph
  let p = off + 10;
  const contours: Pt[][] = [];
  for (;;) {
    const flags = u16(f.data, p);
    const compGid = u16(f.data, p + 2);
    p += 4;
    let dx = 0, dy = 0;
    if (flags & 0x0001) { dx = i16(f.data, p); dy = i16(f.data, p + 2); p += 4; }
    else { dx = f.data[p]; dy = f.data[p + 1]; p += 2; }
    let a = 1, b = 0, c2 = 0, d = 1;
    if (flags & 0x0008) {
      const s = i16(f.data, p) / 16384; p += 2;
      a = s; d = s;
    } else if (flags & 0x0040) {
      a = i16(f.data, p) / 16384; d = i16(f.data, p + 2) / 16384; p += 4;
    } else if (flags & 0x0080) {
      a = i16(f.data, p) / 16384; b = i16(f.data, p + 2) / 16384;
      c2 = i16(f.data, p + 4) / 16384; d = i16(f.data, p + 6) / 16384; p += 8;
    }
    // If args are point numbers (not XY), dx/dy are point indices — treat as 0.
    if (!(flags & 0x0002)) { dx = 0; dy = 0; }
    const sub = glyphContours(f, compGid);
    for (const contour of sub) {
      contours.push(contour.map((pt) => ({
        x: a * pt.x + b * pt.y + dx,
        y: c2 * pt.x + d * pt.y + dy,
        on: pt.on,
      })));
    }
    if (!(flags & 0x0020)) break;
  }
  return contours;
}

// Flatten one contour (quadratic outlines) into line segments.
function flattenContour(pts: Pt[]): Seg[] {
  const segs: Seg[] = [];
  const n = pts.length;
  if (n === 0) return segs;
  // Determine the start point (must be on-curve).
  let startIdx = 0;
  let startPt: Pt;
  if (pts[0].on) { startIdx = 0; startPt = pts[0]; }
  else if (pts[n - 1].on) { startIdx = n - 1; startPt = pts[n - 1]; }
  else {
    startPt = { x: (pts[n - 1].x + pts[0].x) / 2, y: (pts[n - 1].y + pts[0].y) / 2, on: true };
    startIdx = -1;
  }
  const quad = (p0: Pt, c: Pt, p1: Pt): void => {
    const len = Math.hypot(p0.x - c.x, p0.y - c.y) + Math.hypot(c.x - p1.x, c.y - p1.y);
    const k = Math.max(2, Math.min(32, Math.ceil(len / 2.5)));
    let px = p0.x, py = p0.y;
    for (let i = 1; i <= k; i++) {
      const t = i / k;
      const mt = 1 - t;
      const x = mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x;
      const y = mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y;
      segs.push([px, py, x, y]);
      px = x; py = y;
    }
  };
  let cur: Pt = startPt;
  let ctrl: Pt | null = null;
  const visit = (p: Pt): void => {
    if (p.on) {
      if (ctrl) quad(cur, ctrl, p);
      else segs.push([cur.x, cur.y, p.x, p.y]);
      cur = p;
      ctrl = null;
    } else {
      if (ctrl) {
        const mid: Pt = { x: (ctrl.x + p.x) / 2, y: (ctrl.y + p.y) / 2, on: true };
        quad(cur, ctrl, mid);
        cur = mid;
      }
      ctrl = p;
    }
  };
  if (startIdx === -1) {
    for (let i = 0; i < n; i++) visit(pts[i]);
  } else {
    for (let i = 1; i <= n; i++) visit(pts[(startIdx + i) % n]);
  }
  visit(startPt);
  return segs;
}

function glyphSegments(f: Font, gid: number): Seg[] {
  const cached = f.outlineCache.get(gid);
  if (cached) return cached;
  const contours = glyphContours(f, gid);
  const segs: Seg[] = [];
  for (const c of contours) segs.push(...flattenContour(c));
  f.outlineCache.set(gid, segs);
  return segs;
}

// ---------------------------------------------------------------- glyph raster
interface GlyphBmp { w: number; h: number; data: Uint8Array; bx: number; by: number; adv: number }

// Rasterize one glyph at a size into a bitmap (supersampled).
// CRITICAL: ALL contours are filled in ONE scanline pass with the even-odd
// rule, so counters (holes in o, d, p, 0, 6, 9, ...) stay white.
function rasterizeGlyph(f: Font, gid: number, size: number): GlyphBmp {
  const key = `${gid}:${size}`;
  const cached = f.bitmapCache.get(key);
  if (cached) return cached;
  const scale = (size / f.unitsPerEm) * SS;
  const adv = f.hmtxAdv[gid] * (size / f.unitsPerEm);
  const segs = glyphSegments(f, gid);
  const glyf = f.tables.get('glyf')!;
  const off = glyf.off + f.loca[gid];
  const xMin = i16(f.data, off + 2);
  const yMin = i16(f.data, off + 4);
  const xMax = i16(f.data, off + 6);
  const yMax = i16(f.data, off + 8);
  if (segs.length === 0 || xMax <= xMin || yMax <= yMin) {
    const empty: GlyphBmp = { w: 0, h: 0, data: new Uint8Array(0), bx: 0, by: 0, adv };
    f.bitmapCache.set(key, empty);
    return empty;
  }
  const w = Math.ceil((xMax - xMin) * scale) + 2;
  const h = Math.ceil((yMax - yMin) * scale) + 2;
  const data = new Uint8Array(w * h);
  const ox = -xMin * scale + 1; // bitmap x of font x=0
  const oy = yMax * scale + 1; // bitmap y of font y=0 (screen y down)
  // Transform segments to bitmap (supersampled) coordinates.
  const ts: Seg[] = segs.map(([x0, y0, x1, y1]) => [
    x0 * scale + ox, oy - y0 * scale, x1 * scale + ox, oy - y1 * scale,
  ]);
  for (let sy = 0; sy < h; sy++) {
    const yc = sy + 0.5;
    const xs: number[] = [];
    for (const [x0, y0, x1, y1] of ts) {
      if ((y0 <= yc && yc < y1) || (y1 <= yc && yc < y0)) {
        xs.push(x0 + ((yc - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a = Math.max(0, Math.ceil(xs[i] - 0.5));
      const b = Math.min(w, Math.floor(xs[i + 1] - 0.5) + 1);
      for (let x = a; x < b; x++) data[sy * w + x] = 1;
    }
  }
  const bmp: GlyphBmp = { w, h, data, bx: xMin * scale - 1, by: -yMax * scale - 1, adv };
  f.bitmapCache.set(key, bmp);
  return bmp;
}

// Blit a glyph bitmap onto the supersampled canvas at (penX, baselineY)
// given in final (1024) coordinates.
function blitGlyph(bmp: GlyphBmp, penX: number, baselineY: number, c: RGB): void {
  if (bmp.w === 0) return;
  // bx/by are already in supersampled pixels: bitmap pixel 0 sits at
  // (penX*SS + bx, baselineY*SS + by).
  const x0 = Math.round(penX * SS) + Math.round(bmp.bx);
  const y0 = Math.round(baselineY * SS) + Math.round(bmp.by);
  for (let sy = 0; sy < bmp.h; sy++) {
    const yy = y0 + sy;
    if (yy < 0 || yy >= SH) continue;
    const row = sy * bmp.w;
    let sx = 0;
    while (sx < bmp.w) {
      if (bmp.data[row + sx]) {
        let ex = sx;
        while (ex < bmp.w && bmp.data[row + ex]) ex++;
        const ax0 = Math.max(0, x0 + sx);
        const ax1 = Math.min(SW, x0 + ex);
        let i = (yy * SW + ax0) * 3;
        for (let xx = ax0; xx < ax1; xx++) {
          buf[i] = c[0];
          buf[i + 1] = c[1];
          buf[i + 2] = c[2];
          i += 3;
        }
        sx = ex;
      } else sx++;
    }
  }
}

function textWidth(f: Font, size: number, text: string): number {
  let w = 0;
  for (const ch of text) {
    const gid = glyphIndex(f, ch.codePointAt(0)!);
    w += f.hmtxAdv[gid] * (size / f.unitsPerEm);
  }
  return w;
}

// Draw text; y is the TOP of the text box. Returns the width drawn.
function drawText(f: Font, size: number, x: number, yTop: number, text: string, c: RGB): number {
  const baseline = yTop + (f.ascent * size) / f.unitsPerEm;
  let pen = x;
  for (const ch of text) {
    const gid = glyphIndex(f, ch.codePointAt(0)!);
    const bmp = rasterizeGlyph(f, gid, size);
    blitGlyph(bmp, pen, baseline, c);
    pen += bmp.adv;
  }
  return pen - x;
}

function drawTextCentered(f: Font, size: number, cx: number, yTop: number, text: string, c: RGB): void {
  drawText(f, size, cx - textWidth(f, size, text) / 2, yTop, text, c);
}

function wrapLines(f: Font, size: number, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const trial = cur ? cur + ' ' + word : word;
    if (textWidth(f, size, trial) <= maxW || !cur) cur = trial;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draw wrapped text; returns total height used. Throws if it exceeds maxLines.
function drawWrapped(f: Font, size: number, x: number, yTop: number, maxW: number, text: string, c: RGB, lineH: number, maxLines = 99): number {
  const lines = wrapLines(f, size, text, maxW);
  if (lines.length > maxLines) throw new Error(`text overflow: "${text.slice(0, 40)}..." needs ${lines.length} lines, max ${maxLines}`);
  for (let i = 0; i < lines.length; i++) drawText(f, size, x, yTop + i * lineH, lines[i], c);
  return lines.length * lineH;
}

// Load the three fonts available in fonts/.
const FONT_DIR = path.join(process.cwd(), 'fonts');
const SERIF_B = loadFont(path.join(FONT_DIR, 'DejaVuSerif-Bold.ttf'));
const SANS = loadFont(path.join(FONT_DIR, 'DejaVuSans.ttf'));
const SANS_B = loadFont(path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'));

// ---------------------------------------------------------------- shapes
type Pt2 = [number, number];

function hline(x: number, y: number, w: number, c: RGB, t = 1): void {
  fillRect(x, y - t / 2, w, t, c);
}
function vline(x: number, y: number, h: number, c: RGB, t = 1): void {
  fillRect(x - t / 2, y, t, h, c);
}
function rectOutline(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

// Scanline polygon fill (even-odd), final coordinates, drawn at 4x SS.
function fillPoly(pts: Pt2[], c: RGB): void {
  if (pts.length < 3) return;
  const sp = pts.map(([x, y]): Pt2 => [x * SS, y * SS]);
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of sp) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(SH - 1, Math.ceil(maxY));
  for (let sy = y0; sy <= y1; sy++) {
    const yc = sy + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < sp.length; i++) {
      const [x0, y0e] = sp[i];
      const [x1, y1e] = sp[(i + 1) % sp.length];
      if ((y0e <= yc && yc < y1e) || (y1e <= yc && yc < y0e)) {
        xs.push(x0 + ((yc - y0e) * (x1 - x0)) / (y1e - y0e));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a = Math.max(0, Math.ceil(xs[i]));
      const b = Math.min(SW, Math.floor(xs[i + 1]));
      let idx = (sy * SW + a) * 3;
      for (let x = a; x < b; x++) {
        buf[idx] = c[0]; buf[idx + 1] = c[1]; buf[idx + 2] = c[2];
        idx += 3;
      }
    }
  }
}

// Thick line as a filled quad (width in final px).
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, w = 1): void {
  if (w <= 1) {
    // Bresenham at SS resolution for a crisp 1px (final) line.
    let ax = Math.round(x0 * SS), ay = Math.round(y0 * SS);
    const bx = Math.round(x1 * SS), by = Math.round(y1 * SS);
    const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
    let err = dx - dy;
    for (let i = 0; i < 20000; i++) {
      setPx(ax, ay, c);
      if (ax === bx && ay === by) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; ax += sx; }
      if (e2 < dx) { err += dx; ay += sy; }
    }
    return;
  }
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2), ny = (dx / len) * (w / 2);
  fillPoly([
    [x0 + nx, y0 + ny], [x1 + nx, y1 + ny],
    [x1 - nx, y1 - ny], [x0 - nx, y0 - ny],
  ], c);
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  const rSS = r * SS;
  const cxSS = cx * SS, cySS = cy * SS;
  const y0 = Math.max(0, Math.floor(cySS - rSS));
  const y1 = Math.min(SH - 1, Math.ceil(cySS + rSS));
  for (let sy = y0; sy <= y1; sy++) {
    const dy = sy + 0.5 - cySS;
    const dx = Math.sqrt(Math.max(0, rSS * rSS - dy * dy));
    const a = Math.max(0, Math.ceil(cxSS - dx));
    const b = Math.min(SW, Math.floor(cxSS + dx));
    let idx = (sy * SW + a) * 3;
    for (let x = a; x < b; x++) {
      buf[idx] = c[0]; buf[idx + 1] = c[1]; buf[idx + 2] = c[2];
      idx += 3;
    }
  }
}

function circleOutline(cx: number, cy: number, r: number, c: RGB, t = 1): void {
  const steps = Math.max(24, Math.floor(2 * Math.PI * r * 2));
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * 2 * Math.PI;
    const a1 = ((i + 1) / steps) * 2 * Math.PI;
    line(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, c, t);
  }
}

// Hatch lines clipped to a polygon: parallel lines at `angle` degrees,
// `spacing` px apart, drawn only inside the polygon.
function hatchPoly(pts: Pt2[], angleDeg: number, spacing: number, c: RGB, w = 0.75): void {
  const a = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const nx = -uy, ny = ux;
  let minD = Infinity, maxD = -Infinity;
  let minT = Infinity, maxT = -Infinity;
  for (const [x, y] of pts) {
    const d = x * nx + y * ny;
    const t = x * ux + y * uy;
    minD = Math.min(minD, d); maxD = Math.max(maxD, d);
    minT = Math.min(minT, t); maxT = Math.max(maxT, t);
  }
  const cross = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;
  for (let d = minD + spacing / 2; d <= maxD; d += spacing) {
    const ts: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      const ex = bx - ax, ey = by - ay;
      const den = cross(ux, uy, ex, ey);
      if (Math.abs(den) < 1e-9) continue;
      // Solve d*n + t*u = A + s*E  =>  t = cross(A - d*n, E) / cross(u, E)
      const rx = ax - d * nx, ry = ay - d * ny;
      const t = cross(rx, ry, ex, ey) / den;
      const s = cross(rx, ry, ux, uy) / den;
      if (s >= -0.001 && s <= 1.001 && t >= minT - 1 && t <= maxT + 1) ts.push(t);
    }
    if (ts.length < 2) continue;
    ts.sort((p, q) => p - q);
    for (let i = 0; i + 1 < ts.length; i += 2) {
      const t0 = ts[i], t1 = ts[i + 1];
      if (t1 - t0 < 0.5) continue;
      line(d * nx + t0 * ux, d * ny + t0 * uy, d * nx + t1 * ux, d * ny + t1 * uy, c, w);
    }
  }
}

function hatchRect(x: number, y: number, w: number, h: number, angleDeg: number, spacing: number, c: RGB, lw = 0.75): void {
  hatchPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], angleDeg, spacing, c, lw);
}

function crossHatchPoly(pts: Pt2[], spacing: number, c: RGB): void {
  hatchPoly(pts, 45, spacing, c);
  hatchPoly(pts, -45, spacing, c);
}

// Halftone dots: deterministic dot grid, radius from a hash pattern.
function halftone(x: number, y: number, w: number, h: number, step: number, maxR: number, c: RGB): void {
  for (let gy = y + step / 2; gy < y + h; gy += step) {
    for (let gx = x + step / 2; gx < x + w; gx += step) {
      const hv = hash2(Math.round(gx), Math.round(gy)) / 1000;
      const r = 0.25 + hv * maxR;
      fillCircle(gx, gy, r, c);
    }
  }
}

// Banded sky: horizontal ink lines with widening gaps (woodcut sky).
function bandedSky(x: number, y: number, w: number, h: number, c: RGB, baseGap = 3): void {
  let yy = y + 2;
  let i = 0;
  while (yy < y + h) {
    line(x, yy, x + w, yy, c, 0.75);
    yy += baseGap + Math.floor(i / 3);
    i++;
  }
}

// Sun disc with radiating short rays.
function sunDisc(cx: number, cy: number, r: number, disc: RGB, ray: RGB): void {
  fillCircle(cx, cy, r, disc);
  circleOutline(cx, cy, r, ray, 1.5);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * 2 * Math.PI;
    const r0 = r + 2, r1 = r + 2 + (i % 2 === 0 ? 6 : 3.5);
    line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, ray, 1);
  }
}

// ---------------------------------------------------------------- art scenes
// Every scene draws inside its box (x, y, w, h) in final coordinates.

// Small window grid inside a building rect.
function windows(x: number, y: number, w: number, h: number, cols: number, rows: number, c: RGB): void {
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      if (hash2(Math.round(x + col * 7), Math.round(y + r * 11)) % 3 === 0) continue;
      fillRect(x + col * cw + cw * 0.22, y + r * ch + ch * 0.22, cw * 0.56, ch * 0.56, c);
    }
  }
}

function tower(x: number, yBase: number, w: number, h: number, c: RGB, win: RGB): void {
  fillRect(x, yBase - h, w, h, c);
  rectOutline(x, yBase - h, w, h, INK, 1.5);
  const cols = Math.max(2, Math.floor(w / 9));
  const rows = Math.max(2, Math.floor(h / 11));
  windows(x, yBase - h, w, h, cols, rows, win);
  // hatch the shaded right side
  hatchRect(x + w * 0.62, yBase - h, w * 0.38, h, 45, 4, INK, 0.6);
}

function heroLabel(x: number, y: number, w: number, text: string): void {
  fillRect(x, y, w, 13, INK);
  fillRect(x, y + 11, w, 2, OCHRE);
  drawTextCentered(SANS_B, 8, x + w / 2, y + 2.5, text, WHITE);
}

// --- Hero 1: GTA VI — Vice City sunset, woodcut ---
function drawGTA(x: number, y: number, w: number, h: number): void {
  heroLabel(x, y, w, 'VICE CITY · MIDNIGHT LAUNCH');
  const sy = y + 13;
  const sh = h - 13;
  fillRect(x, sy, w, sh, SKY);
  bandedSky(x, sy + 2, w, sh * 0.40, INK, 3);
  // birds
  const bird = (bx: number, by: number, s: number): void => {
    line(bx - 5 * s, by, bx, by - 3 * s, INK, 1);
    line(bx, by - 3 * s, bx + 5 * s, by, INK, 1);
  };
  bird(x + w * 0.16, sy + 12, 1);
  bird(x + w * 0.27, sy + 7, 0.8);
  bird(x + w * 0.86, sy + 10, 0.9);
  // big sun, low on the left so the towers do not swallow it
  sunDisc(x + w * 0.22, sy + sh * 0.18, 12, OCHRE, INK);
  // distant skyline: 10 towers, varied shapes (0 rect, 1 dome, 2 pointed)
  const base = sy + sh * 0.60;
  const skyline: Array<[number, number, number, number]> = [
    [0.01, 0.18, 0.08, 0], [0.10, 0.24, 0.09, 0], [0.20, 0.14, 0.07, 2],
    [0.28, 0.32, 0.10, 0], [0.39, 0.20, 0.08, 1], [0.48, 0.26, 0.09, 0],
    [0.58, 0.34, 0.10, 0], [0.69, 0.18, 0.08, 2], [0.78, 0.28, 0.09, 0],
    [0.88, 0.16, 0.08, 1],
  ];
  for (const [fx, fh, fw, shape] of skyline) {
    const tx = x + w * fx, tw = w * fw, th = sh * fh;
    if (shape === 1) {
      // dome tower
      fillRect(tx, base - th, tw, th, PLUM);
      fillCircle(tx + tw / 2, base - th, tw / 2, PLUM);
      arc(tx + tw / 2, base - th, tw / 2, Math.PI, 2 * Math.PI, INK, 1.2);
      rectOutline(tx, base - th, tw, th, INK, 1);
    } else if (shape === 2) {
      // pointed tower
      fillRect(tx, base - th, tw, th, PLUM);
      fillPoly([[tx - 1, base - th], [tx + tw / 2, base - th - 8], [tx + tw + 1, base - th]], PLUM);
      line(tx - 1, base - th, tx + tw / 2, base - th - 8, INK, 1.2);
      line(tx + tw / 2, base - th - 8, tx + tw + 1, base - th, INK, 1.2);
      rectOutline(tx, base - th, tw, th, INK, 1);
    } else {
      fillRect(tx, base - th, tw, th, PLUM);
      rectOutline(tx, base - th, tw, th, INK, 1);
    }
    if (fh > 0.2) windows(tx + 2, base - th + 2, tw - 4, th - 4, 2, 2, OCHRE);
    hatchRect(tx + tw * 0.6, base - th, tw * 0.4, th, 45, 3, INK, 0.6);
  }
  // near towers (ink / navy, lit windows)
  const wy = base + sh * 0.16;
  tower(x + w * 0.06, wy, w * 0.13, sh * 0.34, INK, OCHRE);
  tower(x + w * 0.34, wy, w * 0.11, sh * 0.42, INK, OCHRE);
  tower(x + w * 0.80, wy, w * 0.12, sh * 0.38, NAVY, OCHRE);
  // palm silhouettes, four of them, in front of the towers
  const palm = (px: number, py: number, s: number): void => {
    line(px, py, px + 2 * s, py - 16 * s, INK, 2.5);
    for (let i = 0; i < 5; i++) {
      const a = -0.3 - i * 0.45;
      const tx = px + 2 * s + Math.cos(a) * 9 * s;
      const ty = py - 16 * s + Math.sin(a) * 5 * s;
      line(px + 2 * s, py - 16 * s, tx, ty, INK, 1.5);
    }
  };
  palm(x + w * 0.17, wy, 1.1);
  palm(x + w * 0.47, wy, 0.9);
  palm(x + w * 0.66, wy, 1.2);
  palm(x + w * 0.93, wy, 0.85);
  // water with horizontal line reflections
  fillRect(x, wy, w, sy + sh - wy, TEAL);
  for (let i = 0; i < 5; i++) {
    const yy = wy + 3 + i * 3;
    const lx = x + w * (0.08 + 0.13 * i);
    line(lx, yy, lx + w * (0.16 - 0.02 * i), yy, WHITE, 1);
  }
  // sun reflection column (under the sun at 0.22w)
  for (let i = 0; i < 4; i++) {
    const yy = wy + 2 + i * 3.5;
    line(x + w * 0.16, yy, x + w * 0.28, yy, OCHRE, 1.2);
  }
  // small causeway bridge over the water, right side
  line(x + w * 0.74, wy + 2, x + w * 0.99, wy + 2, PAPER, 2);
  arc(x + w * 0.865, wy + 2, 6, 0, Math.PI, INK, 1.2);
  line(x + w * 0.78, wy + 2, x + w * 0.78, wy + 9, INK, 1.2);
  line(x + w * 0.95, wy + 2, x + w * 0.95, wy + 9, INK, 1.2);
  // street with two cars, headlights on
  fillRect(x, sy + sh - 9, w, 9, INK);
  const car = (cx0: number, cw: number, col: RGB): void => {
    const cy0 = sy + sh - 17;
    fillRect(cx0, cy0, cw, 8, col);
    rectOutline(cx0, cy0, cw, 8, PAPER, 0.75);
    fillRect(cx0 + cw * 0.18, cy0 - 5, cw * 0.5, 5, col);
    rectOutline(cx0 + cw * 0.18, cy0 - 5, cw * 0.5, 5, PAPER, 0.75);
    fillCircle(cx0 + cw * 0.12, sy + sh - 6, 1.8, OCHRE);
    fillCircle(cx0 + cw * 0.88, sy + sh - 6, 1.8, OCHRE);
    line(cx0 + cw, sy + sh - 7, cx0 + cw + 12, sy + sh - 7, OCHRE, 1);
  };
  car(x + w * 0.28, w * 0.13, NAVY);
  car(x + w * 0.60, w * 0.10, PLUM);
  fillRect(x + w * 0.08, sy + sh - 5, 10, 1.5, WHITE);
  fillRect(x + w * 0.86, sy + sh - 5, 10, 1.5, WHITE);
  rectOutline(x, y, w, h, INK, 2);
}

// --- Hero 2: Shenzhen summit — three leaders as woodcut figures ---
function drawSummit(x: number, y: number, w: number, h: number): void {
  heroLabel(x, y, w, 'APEC 2026 · SHENZHEN');
  const sy = y + 13;
  const sh = h - 13;
  fillRect(x, sy, w, sh, PAPER2);
  // red summit banner across the top
  fillRect(x, sy, w, 12, RED);
  rectOutline(x, sy, w, 12, INK, 1);
  drawTextCentered(SANS_B, 8.5, x + w / 2, sy + 2, 'APEC 2026', WHITE);
  const tableTop = sy + sh - 20;
  // hall columns at the far edges
  for (const cx0 of [x + 2, x + w - 10]) {
    fillRect(cx0, sy + 12, 8, tableTop - (sy + 12), WHITE);
    rectOutline(cx0, sy + 12, 8, tableTop - (sy + 12), INK, 1);
    fillRect(cx0 - 1, sy + 12, 10, 3, INK);
    fillRect(cx0 - 1, tableTop - 3, 10, 3, INK);
    hatchRect(cx0 + 4, sy + 16, 4, tableTop - (sy + 12) - 8, 45, 3, INK, 0.6);
  }
  // long conference table across the bottom
  fillRect(x, tableTop, w, sy + sh - tableTop, INK);
  fillRect(x, tableTop, w, 2, PAPER);
  // one leader: big head + hair + suit, standing behind the table
  const leader = (cx: number, kind: number, name: string): void => {
    const headW = kind === 0 ? 34 : kind === 1 ? 32 : 30;
    const headH = kind === 2 ? 18 : 20;
    const headTop = sy + 15;
    const hx0 = cx - headW / 2;
    // neck
    fillRect(cx - 4, headTop + headH - 2, 8, 5, SKY);
    rectOutline(cx - 4, headTop + headH - 2, 8, 5, INK, 1);
    // face: slightly tapered jaw so it reads as a head, not a box
    fillPoly([
      [hx0, headTop], [hx0 + headW, headTop],
      [hx0 + headW - 3, headTop + headH], [hx0 + 3, headTop + headH],
    ], SKY);
    line(hx0, headTop, hx0 + headW, headTop, INK, 1.5);
    line(hx0 + headW, headTop, hx0 + headW - 3, headTop + headH, INK, 1.5);
    line(hx0 + headW - 3, headTop + headH, hx0 + 3, headTop + headH, INK, 1.5);
    line(hx0 + 3, headTop + headH, hx0, headTop, INK, 1.5);
    // eyebrows, eyes, nose, mouth
    line(cx - 10, headTop + 6, cx - 3, headTop + 5, INK, 0.75);
    line(cx + 3, headTop + 5, cx + 10, headTop + 6, INK, 0.75);
    fillCircle(cx - 6, headTop + 9, 1.8, INK);
    fillCircle(cx + 6, headTop + 9, 1.8, INK);
    line(cx, headTop + 10, cx, headTop + 14, INK, 1);
    line(cx - 3, headTop + 16, cx + 3, headTop + 16, INK, 1);
    // hair — the main differentiator
    if (kind === 0) { // TRUMP: blond, swept to the side, tall wave
      fillPoly([
        [hx0 - 1, headTop + 8], [hx0 + 2, headTop - 6],
        [hx0 + headW * 0.55, headTop - 8], [hx0 + headW + 2, headTop + 1],
        [hx0 + headW - 2, headTop + 5], [hx0 + headW * 0.6, headTop + 1],
        [hx0 + headW * 0.3, headTop + 6],
      ], OCHRE);
      line(hx0 + 4, headTop - 4, hx0 + headW - 5, headTop - 6, INK, 0.75);
      line(hx0 + 3, headTop, hx0 + headW - 6, headTop - 2, INK, 0.75);
    } else if (kind === 1) { // XI: black, neat flat cap with side part
      fillRect(hx0 - 1, headTop - 3, headW + 2, 8, INK);
      rectOutline(hx0 - 1, headTop - 3, headW + 2, 8, INK, 1);
      line(hx0 + headW * 0.62, headTop - 3, hx0 + headW * 0.55, headTop + 4, PAPER, 0.75);
    } else { // PUTIN: light grey, short, receding
      fillPoly([
        [hx0, headTop + 6], [hx0 + 2, headTop - 2],
        [hx0 + headW - 2, headTop - 2], [hx0 + headW, headTop + 6],
        [hx0 + headW - 6, headTop + 2], [hx0 + 6, headTop + 2],
      ], GREY);
      rectOutline(hx0, headTop - 2, headW, 7, INK, 1);
    }
    // suit: shoulders down to the table (Trump navy, Xi ink, Putin plum)
    const shTop = headTop + headH + 3;
    const shW = 76;
    const suitCol = kind === 0 ? NAVY : kind === 1 ? INK : PLUM;
    const hatchCol = kind === 1 ? PAPER : INK;
    fillPoly([
      [cx - shW / 2, tableTop], [cx - shW / 2 + 6, shTop],
      [cx + shW / 2 - 6, shTop], [cx + shW / 2, tableTop],
    ], suitCol);
    rectOutline(cx - shW / 2, shTop, shW, tableTop - shTop, INK, 1.5);
    hatchRect(cx + 8, shTop + 4, shW / 2 - 12, tableTop - shTop - 6, 45, 3, hatchCol, 0.6);
    // shirt + tie (Trump/Xi red, Putin ochre)
    fillPoly([[cx - 8, shTop], [cx + 8, shTop], [cx, shTop + 12]], WHITE);
    const tieCol = kind === 2 ? OCHRE : RED;
    fillPoly([
      [cx - 3, shTop + 2], [cx + 3, shTop + 2], [cx + 4, shTop + 13],
      [cx, shTop + 16], [cx - 4, shTop + 13],
    ], tieCol);
    // microphone on the table, left of the figure
    line(cx - 42, tableTop, cx - 42, tableTop - 11, INK, 1.2);
    fillCircle(cx - 42, tableTop - 12, 2.5, INK);
    // small flag on the table, right of the figure
    const fpx = cx + 38;
    line(fpx, tableTop, fpx, tableTop - 13, INK, 1);
    if (kind === 0) { // US: stripes + canton
      fillRect(fpx, tableTop - 13, 9, 8, WHITE);
      fillRect(fpx, tableTop - 12, 9, 2, RED);
      fillRect(fpx, tableTop - 8, 9, 2, RED);
      fillRect(fpx, tableTop - 13, 4, 4, NAVY);
    } else if (kind === 1) { // China: red + star
      fillRect(fpx, tableTop - 13, 9, 8, RED);
      fillCircle(fpx + 3, tableTop - 10, 1.4, OCHRE);
    } else { // Russia: white / navy / red bands
      fillRect(fpx, tableTop - 13, 9, 3, WHITE);
      fillRect(fpx, tableTop - 10, 9, 3, NAVY);
      fillRect(fpx, tableTop - 7, 9, 2, RED);
    }
    rectOutline(fpx, tableTop - 13, 9, 8, INK, 0.75);
    // name plate on the table front
    const pw = 58, ph = 13, py = tableTop + 3.5;
    fillRect(cx - pw / 2, py, pw, ph, WHITE);
    rectOutline(cx - pw / 2, py, pw, ph, INK, 1.5);
    drawTextCentered(SANS_B, 8.5, cx, py + 2.5, name, INK);
  };
  leader(x + w * 0.185, 0, 'TRUMP');
  leader(x + w * 0.50, 1, 'XI');
  leader(x + w * 0.815, 2, 'PUTIN');
  rectOutline(x, y, w, h, INK, 2);
}

// --- Hero 3: Anthropic IPO — rising candlesticks ---
function drawIPO(x: number, y: number, w: number, h: number): void {
  heroLabel(x, y, w, 'NASDAQ · FIRST DAY');
  const sy = y + 13;
  const sh = h - 13;
  fillRect(x, sy, w, sh, PAPER2);
  // grid lines
  for (let i = 1; i < 4; i++) line(x + 4, sy + (sh * i) / 4, x + w - 4, sy + (sh * i) / 4, LGREY, 0.75);
  for (let i = 1; i < 6; i++) line(x + (w * i) / 6, sy + 4, x + (w * i) / 6, sy + sh - 17, LGREY, 0.75);
  // big $83 with an ink shadow so it reads as carved type
  drawText(SERIF_B, 34, x + 10, sy + 2, '$83', INK);
  drawText(SERIF_B, 34, x + 8, sy, '$83', RED);
  drawText(SANS_B, 8, x + 9, sy + 36, 'ANT · NASDAQ', INK);
  line(x + 9, sy + 46, x + 90, sy + 46, INK, 2);
  // 10 dense candlesticks rising left to right
  const candles: Array<[number, number, number]> = [
    [0.33, 0.60, 0.10], [0.40, 0.54, 0.12], [0.47, 0.58, 0.10],
    [0.54, 0.48, 0.13], [0.61, 0.42, 0.12], [0.68, 0.46, 0.10],
    [0.75, 0.36, 0.13], [0.82, 0.30, 0.12], [0.89, 0.34, 0.10],
    [0.96, 0.24, 0.13],
  ];
  candles.forEach(([fx, top, bh], i) => {
    const cx = x + w * fx;
    const up = i % 2 === 0;
    const col = up ? TEAL : RED;
    line(cx, sy + sh * (top - 0.08), cx, sy + sh * (top + bh + 0.06), INK, 1.2);
    fillRect(cx - 7, sy + sh * top, 14, sh * bh, col);
    rectOutline(cx - 7, sy + sh * top, 14, sh * bh, INK, 1);
    hatchRect(cx - 7, sy + sh * top, 14, sh * bh, up ? 45 : -45, 3, INK, 0.6);
  });
  // bold rising trend line with arrow head
  line(x + w * 0.30, sy + sh * 0.72, x + w * 0.97, sy + sh * 0.20, INK, 2.5);
  fillPoly([
    [x + w * 0.97, sy + sh * 0.20], [x + w * 0.915, sy + sh * 0.175],
    [x + w * 0.925, sy + sh * 0.235],
  ], INK);
  // volume bars aligned with the candles
  candles.forEach(([fx], i) => {
    const cx = x + w * fx;
    const vh = 3 + (i % 3) * 1.5;
    fillRect(cx - 7, sy + sh - 17, 14, vh, i % 2 ? RED : TEAL);
    rectOutline(cx - 7, sy + sh - 17, 14, vh, INK, 0.75);
  });
  // ticker strip at the bottom
  fillRect(x, sy + sh - 11, w, 11, INK);
  for (let i = 0; i < 14; i++) {
    fillRect(x + 5 + i * 22, sy + sh - 9, 12, 7, i % 2 ? OCHRE : WHITE);
  }
  rectOutline(x, y, w, h, INK, 2);
}

// Arc as a polyline of short line segments.
function arc(cx: number, cy: number, r: number, a0: number, a1: number, c: RGB, w = 1): void {
  const steps = Math.max(6, Math.floor(Math.abs(a1 - a0) * r * 0.6));
  let px = cx + Math.cos(a0) * r, py = cy + Math.sin(a0) * r;
  for (let i = 1; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const qx = cx + Math.cos(a) * r, qy = cy + Math.sin(a) * r;
    line(px, py, qx, qy, c, w);
    px = qx; py = qy;
  }
}

// --- Medium 4: World Court — columns, pediment, steps ---
function drawCourt(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER2);
  bandedSky(x, y + 1, w, h * 0.30, INK, 4);
  halftone(x, y + 1, w, h * 0.22, 6, 0.8, LGREY);
  const apexY = y + h * 0.16;
  const baseY = y + h * 0.34;
  // scales of justice on a pole above the pediment
  line(x + w * 0.50, y + h * 0.02, x + w * 0.50, apexY, INK, 1.2);
  line(x + w * 0.43, y + h * 0.06, x + w * 0.57, y + h * 0.06, INK, 1.2);
  fillPoly([[x + w * 0.42, y + h * 0.12], [x + w * 0.44, y + h * 0.12], [x + w * 0.43, y + h * 0.06]], INK);
  fillPoly([[x + w * 0.56, y + h * 0.12], [x + w * 0.58, y + h * 0.12], [x + w * 0.57, y + h * 0.06]], INK);
  line(x + w * 0.43, y + h * 0.06, x + w * 0.43, y + h * 0.12, INK, 0.75);
  line(x + w * 0.57, y + h * 0.06, x + w * 0.57, y + h * 0.12, INK, 0.75);
  // big pediment, cross-hatched
  fillPoly([[x + w * 0.06, baseY], [x + w * 0.50, apexY], [x + w * 0.94, baseY]], NAVY);
  crossHatchPoly([[x + w * 0.06, baseY], [x + w * 0.50, apexY], [x + w * 0.94, baseY]], 3, INK);
  line(x + w * 0.06, baseY, x + w * 0.50, apexY, INK, 1.5);
  line(x + w * 0.50, apexY, x + w * 0.94, baseY, INK, 1.5);
  line(x + w * 0.06, baseY, x + w * 0.94, baseY, INK, 1.5);
  // frieze band
  fillRect(x + w * 0.06, baseY, w * 0.88, h * 0.04, INK);
  // six columns with capitals and hatched right side
  for (let i = 0; i < 6; i++) {
    const cx = x + w * (0.13 + i * 0.135);
    fillRect(cx, y + h * 0.38, w * 0.055, h * 0.40, WHITE);
    rectOutline(cx, y + h * 0.38, w * 0.055, h * 0.40, INK, 0.75);
    fillRect(cx - 1, y + h * 0.38, w * 0.055 + 2, 2, INK);
    hatchRect(cx + w * 0.03, y + h * 0.40, w * 0.025, h * 0.36, 45, 3, INK, 0.5);
  }
  // three steps, full width
  fillRect(x + w * 0.06, y + h * 0.78, w * 0.88, h * 0.05, INK);
  fillRect(x + w * 0.03, y + h * 0.84, w * 0.94, h * 0.05, INK);
  fillRect(x, y + h * 0.90, w, h * 0.06, INK);
  fillRect(x + w * 0.10, y + h * 0.80, w * 0.80, 1, PAPER);
  rectOutline(x, y, w, h, INK, 1.5);
}

// --- Medium 5: COP31 — globe, flags, sun ---
function drawCOP(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER2);
  bandedSky(x, y + 1, w, h * 0.28, INK, 4);
  // small stars in the sky, left side
  const star = (sx: number, sy: number): void => {
    line(sx - 2, sy, sx + 2, sy, INK, 0.75);
    line(sx, sy - 2, sx, sy + 2, INK, 0.75);
  };
  star(x + w * 0.10, y + h * 0.10);
  star(x + w * 0.20, y + h * 0.06);
  star(x + w * 0.06, y + h * 0.20);
  const cx = x + w * 0.42, cy = y + h * 0.50, r = h * 0.36;
  fillCircle(cx, cy, r, TEAL);
  // continents as bigger leaf blobs
  fillPoly([[cx - r * 0.60, cy - r * 0.30], [cx - r * 0.10, cy - r * 0.60], [cx + r * 0.15, cy - r * 0.20], [cx - r * 0.30, cy + r * 0.05]], LEAF);
  fillPoly([[cx + r * 0.10, cy + r * 0.10], [cx + r * 0.60, cy - r * 0.05], [cx + r * 0.55, cy + r * 0.45], [cx + r * 0.05, cy + r * 0.50]], LEAF);
  fillPoly([[cx - r * 0.55, cy + r * 0.25], [cx - r * 0.25, cy + r * 0.35], [cx - r * 0.40, cy + r * 0.65]], LEAF);
  arc(cx, cy, r * 0.72, 0.4, 2.4, INK, 0.75);
  arc(cx, cy, r * 0.72, 3.6, 5.6, INK, 0.75);
  // shadow: hatch the right half of the globe
  const halfPts: Pt2[] = [[cx, cy]];
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI;
    halfPts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  hatchPoly(halfPts, 45, 2.5, INK, 0.6);
  circleOutline(cx, cy, r, INK, 2);
  // banded sun top-right
  sunDisc(x + w * 0.85, y + h * 0.15, 7, OCHRE, INK);
  // five small flags on a ground line at the base
  line(x, y + h * 0.97, x + w, y + h * 0.97, INK, 1.2);
  const flagCols: RGB[] = [RED, NAVY, OCHRE, TEAL, PLUM];
  for (let i = 0; i < 5; i++) {
    const fx = x + w * (0.12 + i * 0.16);
    line(fx, y + h * 0.84, fx, y + h * 0.97, INK, 1);
    fillRect(fx, y + h * 0.84, w * 0.065, h * 0.07, flagCols[i]);
    rectOutline(fx, y + h * 0.84, w * 0.065, h * 0.07, INK, 0.75);
  }
  rectOutline(x, y, w, h, INK, 1.5);
}

// --- Medium 6: Cyclone Akvan — spiral, rain, coast ---
function drawAkvan(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER2);
  // storm cloud band across the top
  fillRect(x, y, w, h * 0.12, LGREY);
  hatchRect(x, y, w, h * 0.12, 45, 3, GREY, 0.7);
  line(x, y + h * 0.12, x + w, y + h * 0.12, INK, 1);
  // small cloud puffs filling the empty sky on the right
  fillCircle(x + w * 0.80, y + h * 0.30, 5, LGREY);
  fillCircle(x + w * 0.90, y + h * 0.24, 4, LGREY);
  circleOutline(x + w * 0.80, y + h * 0.30, 5, GREY, 0.75);
  const cx = x + w * 0.40, cy = y + h * 0.44;
  for (let i = 0; i < 6; i++) {
    arc(cx, cy, 3 + i * 4, i * 0.9, i * 0.9 + 5.0, i % 2 ? NAVY : INK, 1.6);
  }
  fillCircle(cx, cy, 3.5, PAPER2);
  circleOutline(cx, cy, 3.5, INK, 1);
  // dense rain streaks
  for (let i = 0; i < 11; i++) {
    const rx = x + w * (0.04 + i * 0.085);
    line(rx, y + h * 0.56, rx - 3, y + h * 0.76, NAVY, 1);
  }
  for (let i = 0; i < 3; i++) {
    const rx = x + w * (0.14 + i * 0.30);
    line(rx, y + h * 0.58, rx - 3, y + h * 0.72, WHITE, 1);
  }
  // sea with layered waves
  fillRect(x, y + h * 0.78, w, h * 0.22, TEAL);
  line(x, y + h * 0.78, x + w, y + h * 0.78, INK, 1.2);
  for (let i = 0; i < 3; i++) {
    const yy = y + h * (0.83 + i * 0.05);
    line(x + w * (0.04 + 0.08 * i), yy, x + w * (0.46 + 0.08 * i), yy, WHITE, 0.9);
  }
  hatchRect(x + w * 0.55, y + h * 0.80, w * 0.42, h * 0.16, 45, 3.5, INK, 0.5);
  // small boat on the waves, left
  fillPoly([[x + w * 0.10, y + h * 0.84], [x + w * 0.24, y + h * 0.84], [x + w * 0.21, y + h * 0.90], [x + w * 0.13, y + h * 0.90]], INK);
  line(x + w * 0.17, y + h * 0.84, x + w * 0.17, y + h * 0.72, INK, 1.2);
  fillPoly([[x + w * 0.17, y + h * 0.72], [x + w * 0.17, y + h * 0.83], [x + w * 0.25, y + h * 0.83]], WHITE);
  line(x + w * 0.17, y + h * 0.72, x + w * 0.25, y + h * 0.83, INK, 0.75);
  // two houses on the coast, right
  fillRect(x + w * 0.68, y + h * 0.66, w * 0.11, h * 0.12, RED);
  fillPoly([[x + w * 0.67, y + h * 0.66], [x + w * 0.735, y + h * 0.58], [x + w * 0.80, y + h * 0.66]], INK);
  rectOutline(x + w * 0.68, y + h * 0.66, w * 0.11, h * 0.12, INK, 1);
  fillRect(x + w * 0.84, y + h * 0.70, w * 0.09, h * 0.08, NAVY);
  fillPoly([[x + w * 0.83, y + h * 0.70], [x + w * 0.885, y + h * 0.64], [x + w * 0.94, y + h * 0.70]], INK);
  rectOutline(x, y, w, h, INK, 1.5);
}

// --- Medium 7: Crimean Bridge — long bridge, broken gap, smoke ---
function drawBridge(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER2);
  bandedSky(x, y + 1, w, h * 0.28, INK, 4);
  line(x + w * 0.12, y + h * 0.08, x + w * 0.16, y + h * 0.05, INK, 1);
  line(x + w * 0.16, y + h * 0.05, x + w * 0.20, y + h * 0.08, INK, 1);
  const by = y + h * 0.50;
  // bridge deck in two pieces with a gap, thicker than before
  fillRect(x + w * 0.04, by, w * 0.38, h * 0.09, INK);
  fillRect(x + w * 0.58, by, w * 0.38, h * 0.09, INK);
  line(x + w * 0.04, by, x + w * 0.42, by, PAPER, 1);
  line(x + w * 0.58, by, x + w * 0.96, by, PAPER, 1);
  // broken span falling into the gap
  fillPoly([[x + w * 0.44, by], [x + w * 0.50, by], [x + w * 0.52, by + h * 0.16], [x + w * 0.47, by + h * 0.17]], INK);
  line(x + w * 0.56, by, x + w * 0.52, by + h * 0.18, INK, 2);
  // car crossing the right deck
  const carX = x + w * 0.70, carY = by - 7;
  fillRect(carX, carY, w * 0.11, 6, NAVY);
  rectOutline(carX, carY, w * 0.11, 6, INK, 1);
  fillRect(carX + w * 0.02, carY - 5, w * 0.06, 5, NAVY);
  rectOutline(carX + w * 0.02, carY - 5, w * 0.06, 5, INK, 1);
  fillCircle(carX + w * 0.025, by - 1, 1.8, INK);
  fillCircle(carX + w * 0.085, by - 1, 1.8, INK);
  fillCircle(carX + w * 0.11, by - 4, 1.4, OCHRE);
  // pillars with hatch
  for (const fx of [0.12, 0.30, 0.66, 0.84]) {
    fillRect(x + w * fx, by + h * 0.09, w * 0.03, h * 0.16, NAVY);
    hatchRect(x + w * fx, by + h * 0.09, w * 0.015, h * 0.16, 45, 3, INK, 0.6);
  }
  // smoke above the gap
  fillCircle(x + w * 0.50, by - h * 0.10, 6, GREY);
  fillCircle(x + w * 0.54, by - h * 0.20, 8, LGREY);
  fillCircle(x + w * 0.47, by - h * 0.28, 7, GREY);
  circleOutline(x + w * 0.54, by - h * 0.20, 8, GREY, 0.75);
  // hatched water
  fillRect(x, by + h * 0.26, w, y + h - (by + h * 0.26), TEAL);
  for (let i = 0; i < 4; i++) {
    const yy = by + h * (0.34 + i * 0.09);
    line(x + w * 0.06, yy, x + w * 0.94, yy, WHITE, 0.9);
  }
  hatchRect(x, by + h * 0.26, w, h * 0.06, 45, 4, INK, 0.5);
  rectOutline(x, y, w, h, INK, 1.5);
}

// --- Medium 8: Bangladesh — flame over a house, crowd ---
function drawBangladesh(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER2);
  // dense smoke hatch across the top
  hatchRect(x + w * 0.06, y + h * 0.02, w * 0.88, h * 0.10, 45, 3, GREY, 0.7);
  hatchRect(x + w * 0.06, y + h * 0.02, w * 0.88, h * 0.10, -45, 3, GREY, 0.7);
  fillCircle(x + w * 0.22, y + h * 0.06, 5, GREY);
  fillCircle(x + w * 0.72, y + h * 0.05, 6, GREY);
  const cx = x + w * 0.5;
  // BIG flame: three layered teardrops
  fillPoly([[cx - 18, y + h * 0.58], [cx - 5, y + h * 0.08], [cx + 2, y + h * 0.30], [cx + 9, y + h * 0.04], [cx + 18, y + h * 0.58]], RED);
  fillPoly([[cx - 11, y + h * 0.58], [cx - 3, y + h * 0.24], [cx + 4, y + h * 0.40], [cx + 11, y + h * 0.58]], OCHRE);
  fillPoly([[cx - 5, y + h * 0.58], [cx - 1, y + h * 0.40], [cx + 5, y + h * 0.58]], WHITE);
  // side tongues + embers
  fillPoly([[cx - 22, y + h * 0.58], [cx - 18, y + h * 0.40], [cx - 13, y + h * 0.58]], RED);
  fillPoly([[cx + 13, y + h * 0.58], [cx + 18, y + h * 0.42], [cx + 22, y + h * 0.58]], RED);
  fillCircle(cx - 14, y + h * 0.30, 1.5, OCHRE);
  fillCircle(cx + 15, y + h * 0.22, 1.5, OCHRE);
  fillCircle(cx + 2, y + h * 0.12, 1.5, RED);
  // house, bigger: roof + walls + door + lit windows
  fillPoly([[x + w * 0.14, y + h * 0.62], [cx, y + h * 0.46], [x + w * 0.86, y + h * 0.62]], INK);
  fillRect(x + w * 0.20, y + h * 0.62, w * 0.60, h * 0.24, NAVY);
  rectOutline(x + w * 0.20, y + h * 0.62, w * 0.60, h * 0.24, INK, 1);
  hatchRect(x + w * 0.62, y + h * 0.62, w * 0.18, h * 0.24, 45, 3, INK, 0.6);
  fillRect(cx - 5, y + h * 0.72, 10, h * 0.14, INK);
  fillRect(x + w * 0.26, y + h * 0.66, 7, 7, OCHRE);
  fillRect(x + w * 0.68, y + h * 0.66, 7, 7, OCHRE);
  rectOutline(x + w * 0.26, y + h * 0.66, 7, 7, INK, 0.75);
  rectOutline(x + w * 0.68, y + h * 0.66, 7, 7, INK, 0.75);
  // crowd silhouettes at the base, two with raised arms
  for (let i = 0; i < 7; i++) {
    const px = x + w * (0.08 + i * 0.14);
    const hh = i % 2 === 0 ? 4 : 3;
    fillCircle(px, y + h * 0.90, hh, INK);
    fillRect(px - 3, y + h * 0.92, 6, h * 0.08, INK);
    if (i === 1 || i === 5) {
      line(px - 3, y + h * 0.92, px - 7, y + h * 0.84, INK, 1.2);
      line(px + 3, y + h * 0.92, px + 7, y + h * 0.84, INK, 1.2);
    }
  }
  fillRect(x, y + h * 0.96, w, h * 0.04, INK);
  rectOutline(x, y, w, h, INK, 1.5);
}

// --- Medium 9: Capitol dome with columns and flag ---
function drawCapitol(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER2);
  bandedSky(x, y + 1, w, h * 0.26, INK, 4);
  sunDisc(x + w * 0.88, y + h * 0.12, 5, OCHRE, INK);
  const base = y + h * 0.88;
  // big dome: triangle + arc, hatched on the right side
  fillPoly([[x + w * 0.34, y + h * 0.42], [x + w * 0.50, y + h * 0.10], [x + w * 0.66, y + h * 0.42]], NAVY);
  hatchPoly([[x + w * 0.50, y + h * 0.10], [x + w * 0.66, y + h * 0.42], [x + w * 0.50, y + h * 0.42]], 45, 2.5, INK, 0.6);
  arc(x + w * 0.50, y + h * 0.42, w * 0.14, Math.PI, 2 * Math.PI, INK, 1.2);
  line(x + w * 0.34, y + h * 0.42, x + w * 0.50, y + h * 0.10, INK, 1.5);
  line(x + w * 0.50, y + h * 0.10, x + w * 0.66, y + h * 0.42, INK, 1.5);
  // flag on top of the dome
  line(x + w * 0.50, y + h * 0.02, x + w * 0.50, y + h * 0.10, INK, 1);
  fillRect(x + w * 0.50, y + h * 0.02, w * 0.08, h * 0.05, RED);
  rectOutline(x + w * 0.50, y + h * 0.02, w * 0.08, h * 0.05, INK, 0.75);
  // drum + six columns
  fillRect(x + w * 0.36, y + h * 0.42, w * 0.28, h * 0.08, WHITE);
  rectOutline(x + w * 0.36, y + h * 0.42, w * 0.28, h * 0.08, INK, 1);
  for (let i = 0; i < 6; i++) {
    const cx = x + w * (0.22 + i * 0.115);
    fillRect(cx, y + h * 0.52, w * 0.05, h * 0.26, WHITE);
    rectOutline(cx, y + h * 0.52, w * 0.05, h * 0.26, INK, 0.75);
    fillRect(cx - 1, y + h * 0.52, w * 0.05 + 2, 2, INK);
    hatchRect(cx + w * 0.028, y + h * 0.54, w * 0.022, h * 0.22, 45, 3, INK, 0.5);
  }
  // three steps
  fillRect(x + w * 0.18, y + h * 0.78, w * 0.64, h * 0.04, INK);
  fillRect(x + w * 0.12, y + h * 0.83, w * 0.76, h * 0.04, INK);
  fillRect(x + w * 0.06, base - 2, w * 0.88, 2, INK);
  // podium with microphone, right of centre on the steps
  fillPoly([[x + w * 0.66, y + h * 0.86], [x + w * 0.68, y + h * 0.74], [x + w * 0.78, y + h * 0.74], [x + w * 0.80, y + h * 0.86]], INK);
  fillRect(x + w * 0.675, y + h * 0.72, w * 0.11, 2, WHITE);
  line(x + w * 0.73, y + h * 0.72, x + w * 0.73, y + h * 0.66, INK, 1.2);
  fillCircle(x + w * 0.73, y + h * 0.65, 2, INK);
  fillRect(x, y + h * 0.94, w, h * 0.06, INK);
  rectOutline(x, y, w, h, INK, 1.5);
}

// --- Medium 10: Gaza tanks on a road, dust, buildings ---
function drawTanks(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER2);
  bandedSky(x, y + 1, w, h * 0.22, INK, 4);
  // distant thin tower with antenna, right edge
  fillRect(x + w * 0.90, y + h * 0.18, w * 0.04, h * 0.40, NAVY);
  line(x + w * 0.92, y + h * 0.10, x + w * 0.92, y + h * 0.18, INK, 1);
  fillCircle(x + w * 0.92, y + h * 0.09, 1.5, RED);
  // ruined buildings with jagged broken tops
  const ruin = (bx: number, bw: number, bh: number, col: RGB, jag: number): void => {
    const top = y + h * 0.62 - bh;
    fillPoly([
      [bx, y + h * 0.62], [bx, top + jag], [bx + bw * 0.3, top],
      [bx + bw * 0.5, top + jag * 1.4], [bx + bw * 0.75, top + jag * 0.4],
      [bx + bw, top + jag], [bx + bw, y + h * 0.62],
    ], col);
    rectOutline(bx, top, bw, y + h * 0.62 - top, INK, 1);
  };
  ruin(x + w * 0.04, w * 0.18, h * 0.32, NAVY, 5);
  ruin(x + w * 0.26, w * 0.13, h * 0.22, PLUM, 4);
  ruin(x + w * 0.74, w * 0.14, h * 0.28, NAVY, 5);
  windows(x + w * 0.04, y + h * 0.34, w * 0.18, h * 0.28, 2, 3, OCHRE);
  windows(x + w * 0.74, y + h * 0.38, w * 0.14, h * 0.24, 2, 2, WHITE);
  hatchRect(x + w * 0.16, y + h * 0.34, w * 0.06, h * 0.28, 45, 3, INK, 0.6);
  // dust clouds
  fillCircle(x + w * 0.30, y + h * 0.66, 6, LGREY);
  fillCircle(x + w * 0.68, y + h * 0.62, 8, LGREY);
  fillCircle(x + w * 0.50, y + h * 0.70, 5, GREY);
  circleOutline(x + w * 0.68, y + h * 0.62, 8, GREY, 0.75);
  // road with dashes and a crater
  fillRect(x, y + h * 0.72, w, h * 0.28, INK);
  fillRect(x + w * 0.06, y + h * 0.85, w * 0.10, 1.5, OCHRE);
  fillRect(x + w * 0.84, y + h * 0.85, w * 0.10, 1.5, OCHRE);
  fillCircle(x + w * 0.46, y + h * 0.82, 4, INK);
  circleOutline(x + w * 0.46, y + h * 0.82, 4, GREY, 0.75);
  // rubble at the corners
  fillPoly([[x + 2, y + h - 2], [x + 10, y + h - 2], [x + 6, y + h - 8]], GREY);
  fillPoly([[x + w - 12, y + h - 2], [x + w - 2, y + h - 2], [x + w - 7, y + h - 7]], GREY);
  // tanks, bigger than before
  const tank = (tx: number, ty: number, s: number): void => {
    fillRect(tx, ty, 34 * s, 8 * s, NAVY);
    rectOutline(tx, ty, 34 * s, 8 * s, INK, 1);
    hatchRect(tx + 18 * s, ty, 16 * s, 8 * s, 45, 3, INK, 0.6);
    fillRect(tx + 8 * s, ty - 6 * s, 16 * s, 6 * s, NAVY);
    rectOutline(tx + 8 * s, ty - 6 * s, 16 * s, 6 * s, INK, 1);
    line(tx + 22 * s, ty - 3 * s, tx + 38 * s, ty - 5 * s, INK, 2);
    for (let i = 0; i < 4; i++) {
      fillCircle(tx + (5 + i * 8) * s, ty + 8 * s, 2.6 * s, INK);
      fillCircle(tx + (5 + i * 8) * s, ty + 8 * s, 1.2 * s, GREY);
    }
  };
  tank(x + w * 0.08, y + h * 0.58, 1.15);
  tank(x + w * 0.55, y + h * 0.62, 0.9);
  rectOutline(x, y, w, h, INK, 1.5);
}

// --- Medium 11: Atom with orbiting electrons, fenced facility ---
function drawAtom(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER2);
  bandedSky(x, y + 1, w, h * 0.24, INK, 4);
  const cx = x + w * 0.38, cy = y + h * 0.44;
  // mountains with snow caps behind the atom
  fillPoly([[x + w * 0.02, y + h * 0.78], [x + w * 0.22, y + h * 0.42], [x + w * 0.44, y + h * 0.78]], NAVY);
  fillPoly([[x + w * 0.18, y + h * 0.50], [x + w * 0.22, y + h * 0.42], [x + w * 0.26, y + h * 0.50]], WHITE);
  fillPoly([[x + w * 0.30, y + h * 0.78], [x + w * 0.52, y + h * 0.50], [x + w * 0.72, y + h * 0.78]], PLUM);
  hatchPoly([[x + w * 0.30, y + h * 0.78], [x + w * 0.52, y + h * 0.50], [x + w * 0.72, y + h * 0.78]], 45, 3, INK, 0.6);
  // facility: building + chimney + cooling tower
  fillRect(x + w * 0.64, y + h * 0.62, w * 0.14, h * 0.16, INK);
  fillRect(x + w * 0.64, y + h * 0.62, w * 0.14, h * 0.03, RED);
  fillRect(x + w * 0.80, y + h * 0.56, w * 0.03, h * 0.22, INK);
  fillCircle(x + w * 0.815, y + h * 0.52, 3, GREY);
  fillCircle(x + w * 0.83, y + h * 0.47, 4, LGREY);
  fillPoly([[x + w * 0.86, y + h * 0.78], [x + w * 0.885, y + h * 0.60], [x + w * 0.94, y + h * 0.60], [x + w * 0.965, y + h * 0.78]], NAVY);
  // orbits (ellipses as scaled arcs)
  const ellipse = (rx: number, ry: number, rot: number, c: RGB): void => {
    const steps = 40;
    let px = 0, py = 0;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * 2 * Math.PI;
      const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
      const qx = cx + ex * Math.cos(rot) - ey * Math.sin(rot);
      const qy = cy + ex * Math.sin(rot) + ey * Math.cos(rot);
      if (i > 0) line(px, py, qx, qy, c, 1);
      px = qx; py = qy;
    }
  };
  ellipse(22, 9, 0.3, INK);
  ellipse(22, 9, 1.2, NAVY);
  ellipse(22, 9, 2.1, INK);
  fillCircle(cx, cy, 5.5, RED);
  circleOutline(cx, cy, 5.5, INK, 1);
  fillCircle(cx + 19, cy - 4, 2.5, OCHRE);
  fillCircle(cx - 15, cy + 9, 2.5, OCHRE);
  fillCircle(cx - 6, cy - 12, 2.5, WHITE);
  circleOutline(cx - 6, cy - 12, 2.5, INK, 0.75);
  // fence with two rails
  for (let i = 0; i < 6; i++) {
    const fx = x + w * (0.08 + i * 0.16);
    line(fx, y + h * 0.82, fx, y + h * 0.96, INK, 1);
  }
  line(x + w * 0.06, y + h * 0.84, x + w * 0.94, y + h * 0.84, INK, 1);
  line(x + w * 0.06, y + h * 0.90, x + w * 0.94, y + h * 0.90, INK, 1);
  fillRect(x, y + h * 0.96, w, h * 0.04, INK);
  rectOutline(x, y, w, h, INK, 1.5);
}

// --- Medium 12: Oil barrel with flame, derrick ---
function drawBarrel(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER2);
  bandedSky(x, y + 1, w, h * 0.20, INK, 4);
  // derrick: big triangle frame with crossbars, pulley and hook
  fillPoly([[x + w * 0.68, y + h * 0.86], [x + w * 0.79, y + h * 0.08], [x + w * 0.90, y + h * 0.86]], INK);
  line(x + w * 0.71, y + h * 0.62, x + w * 0.87, y + h * 0.62, PAPER, 1.2);
  line(x + w * 0.73, y + h * 0.40, x + w * 0.85, y + h * 0.40, PAPER, 1.2);
  line(x + w * 0.75, y + h * 0.20, x + w * 0.83, y + h * 0.20, PAPER, 1.2);
  fillCircle(x + w * 0.79, y + h * 0.08, 3, OCHRE);
  circleOutline(x + w * 0.79, y + h * 0.08, 3, INK, 1);
  line(x + w * 0.79, y + h * 0.11, x + w * 0.79, y + h * 0.22, INK, 1);
  // barrel, bigger
  const bx = x + w * 0.16, bw = w * 0.38, by = y + h * 0.30, bh = h * 0.58;
  fillRect(bx, by, bw, bh, RED);
  rectOutline(bx, by, bw, bh, INK, 1.5);
  line(bx, by + bh * 0.3, bx + bw, by + bh * 0.3, INK, 1.2);
  line(bx, by + bh * 0.65, bx + bw, by + bh * 0.65, INK, 1.2);
  hatchRect(bx, by, bw * 0.35, bh, 45, 2.5, INK, 0.6);
  // hazard diamond on the barrel front (no text)
  const dx = bx + bw * 0.62, dy = by + bh * 0.48;
  fillPoly([[dx, dy - 6], [dx + 6, dy], [dx, dy + 6], [dx - 6, dy]], WHITE);
  line(dx, dy - 6, dx + 6, dy, INK, 1);
  line(dx + 6, dy, dx, dy + 6, INK, 1);
  line(dx, dy + 6, dx - 6, dy, INK, 1);
  line(dx - 6, dy, dx, dy - 6, INK, 1);
  fillCircle(dx, dy, 1.8, RED);
  // bigger flame on top + embers
  fillPoly([[bx + bw * 0.20, by], [bx + bw * 0.38, by - h * 0.24], [bx + bw * 0.52, by - h * 0.08], [bx + bw * 0.70, by - h * 0.28], [bx + bw * 0.82, by]], OCHRE);
  fillPoly([[bx + bw * 0.34, by], [bx + bw * 0.46, by - h * 0.14], [bx + bw * 0.62, by]], RED);
  fillCircle(bx + bw * 0.30, by - h * 0.30, 1.5, OCHRE);
  fillCircle(bx + bw * 0.75, by - h * 0.34, 1.5, RED);
  // pressure gauge on a pipe between barrel and derrick
  const gx = x + w * 0.62, gy = y + h * 0.42;
  line(bx + bw, gy + 8, gx - 5, gy + 8, INK, 1.2);
  line(gx - 5, gy + 8, gx - 5, gy + 5, INK, 1.2);
  fillCircle(gx, gy, 5.5, WHITE);
  circleOutline(gx, gy, 5.5, INK, 1.2);
  line(gx, gy, gx + 3, gy - 3, RED, 1.2);
  line(gx - 4, gy - 2, gx - 2, gy - 4, INK, 0.75);
  line(gx + 2, gy - 4, gx + 4, gy - 2, INK, 0.75);
  // ground with a dark puddle
  fillRect(x, y + h * 0.88, w, h * 0.12, INK);
  fillRect(x + w * 0.10, y + h * 0.92, w * 0.30, 3, GREY);
  rectOutline(x, y, w, h, INK, 1.5);
}

// --- Medium 13: Suneung classroom — desks, heads, clock ---
function drawExam(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER2);
  // picture rail across the wall
  line(x, y + h * 0.08, x + w, y + h * 0.08, INK, 1.2);
  // second sheet peeking behind the big exam paper
  fillRect(x + w * 0.18, y + h * 0.12, w * 0.42, h * 0.52, LGREY);
  rectOutline(x + w * 0.18, y + h * 0.12, w * 0.42, h * 0.52, INK, 1);
  // BIG exam paper, no text: ruled lines + red margin + pencil
  const px = x + w * 0.13, py = y + h * 0.10, pw = w * 0.42, ph = h * 0.54;
  fillRect(px, py, pw, ph, WHITE);
  rectOutline(px, py, pw, ph, INK, 2);
  // folded corner, top right
  fillPoly([[px + pw - 9, py], [px + pw, py + 9], [px + pw - 9, py + 9]], PAPER2);
  line(px + pw - 9, py, px + pw, py + 9, INK, 0.75);
  // red margin line + ruled lines
  line(px + 8, py + 4, px + 8, py + ph - 4, RED, 1);
  for (let i = 0; i < 6; i++) {
    const ly = py + 8 + i * 4.5;
    line(px + 12, ly, px + pw - 6, ly, LGREY, 0.75);
  }
  // pencil lying diagonally across the paper, bottom right
  line(px + pw - 26, py + ph - 4, px + pw - 4, py + ph - 12, OCHRE, 2.5);
  fillPoly([[px + pw - 4, py + ph - 12], [px + pw + 1, py + ph - 14], [px + pw - 1, py + ph - 8]], INK);
  // BIG wall clock, top right, hands at 9:00
  const ccx = x + w * 0.80, ccy = y + h * 0.24;
  fillCircle(ccx, ccy, 12, WHITE);
  circleOutline(ccx, ccy, 12, INK, 2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 2 * Math.PI;
    line(ccx + Math.cos(a) * 9.5, ccy + Math.sin(a) * 9.5, ccx + Math.cos(a) * 11, ccy + Math.sin(a) * 11, INK, 1);
  }
  line(ccx, ccy, ccx - 8, ccy, INK, 1.5);
  line(ccx, ccy, ccx, ccy - 10, INK, 1.5);
  fillCircle(ccx, ccy, 1.5, INK);
  // student silhouette at a desk, bottom right
  fillCircle(x + w * 0.80, y + h * 0.62, 6, INK);
  fillPoly([
    [x + w * 0.71, y + h * 0.88], [x + w * 0.74, y + h * 0.68],
    [x + w * 0.86, y + h * 0.68], [x + w * 0.89, y + h * 0.88],
  ], NAVY);
  hatchRect(x + w * 0.80, y + h * 0.70, w * 0.09, h * 0.16, 45, 3, INK, 0.6);
  // writing arm reaching to the desk
  line(x + w * 0.76, y + h * 0.74, x + w * 0.68, y + h * 0.82, INK, 2);
  // desk in front of the student, with a small paper on it
  fillRect(x + w * 0.66, y + h * 0.80, w * 0.28, h * 0.06, INK);
  fillRect(x + w * 0.70, y + h * 0.76, w * 0.12, h * 0.04, WHITE);
  rectOutline(x + w * 0.70, y + h * 0.76, w * 0.12, h * 0.04, INK, 0.75);
  // two small desk silhouettes under the big paper, bottom left
  for (let i = 0; i < 2; i++) {
    const dx = x + w * (0.16 + i * 0.22);
    fillCircle(dx, y + h * 0.70, 3.5, INK);
    fillRect(dx - 8, y + h * 0.74, 16, h * 0.06, NAVY);
    rectOutline(dx - 8, y + h * 0.74, 16, h * 0.06, INK, 0.75);
  }
  // floor band with hatch
  fillRect(x, y + h * 0.88, w, h * 0.12, INK);
  hatchRect(x, y + h * 0.88, w, h * 0.12, 45, 3, PAPER, 0.5);
  rectOutline(x, y, w, h, INK, 1.5);
}

// ---------------------------------------------------------------- world map
// Coastlines as [lon, lat] polygons, drawn equirectangular.
const CONTINENTS: Array<Array<[number, number]>> = [
  // North America
  [[-168, 66], [-160, 58], [-152, 60], [-140, 60], [-132, 56], [-126, 50], [-124, 42], [-120, 34], [-114, 29], [-110, 24], [-105, 20], [-97, 16], [-92, 15], [-86, 12], [-82, 9], [-79, 9], [-81, 13], [-85, 16], [-88, 16], [-90, 21], [-91, 19], [-96, 19], [-97, 26], [-93, 30], [-89, 30], [-84, 30], [-81, 25], [-80, 32], [-76, 35], [-74, 40], [-70, 42], [-66, 45], [-60, 47], [-55, 47], [-60, 52], [-64, 58], [-68, 58], [-66, 61], [-72, 62], [-78, 62], [-85, 66], [-92, 66], [-95, 69], [-108, 68], [-122, 70], [-140, 70], [-155, 71], [-165, 68], [-168, 66]],
  // Greenland
  [[-58, 64], [-52, 60], [-44, 60], [-40, 65], [-32, 68], [-22, 70], [-20, 74], [-25, 78], [-35, 80], [-48, 81], [-58, 79], [-62, 76], [-68, 76], [-60, 74], [-54, 70], [-58, 64]],
  // South America
  [[-79, 9], [-77, 4], [-80, -3], [-81, -6], [-77, -12], [-72, -18], [-70, -24], [-70, -32], [-72, -38], [-73, -45], [-74, -51], [-69, -54], [-66, -55], [-68, -50], [-65, -45], [-62, -39], [-57, -34], [-52, -32], [-48, -27], [-41, -23], [-39, -17], [-35, -9], [-35, -6], [-40, -3], [-44, -2], [-50, 0], [-53, 4], [-58, 6], [-62, 9], [-68, 11], [-72, 12], [-76, 10], [-79, 9]],
  // Africa
  [[-17, 15], [-16, 21], [-15, 27], [-10, 31], [-5, 35], [0, 36], [10, 37], [11, 34], [19, 32], [30, 31], [32, 31], [35, 28], [37, 22], [39, 19], [43, 12], [48, 11], [51, 10], [46, 5], [42, 0], [40, -6], [40, -11], [39, -16], [36, -19], [35, -24], [32, -28], [28, -33], [20, -35], [17, -32], [15, -27], [12, -18], [13, -12], [12, -6], [9, 4], [6, 4], [-2, 5], [-8, 5], [-13, 8], [-17, 12], [-17, 15]],
  // Eurasia
  [[-10, 36], [-9, 38], [-9, 43], [-2, 44], [-1, 46], [-4, 48], [-2, 50], [0, 51], [3, 53], [5, 53], [8, 57], [10, 59], [6, 60], [5, 62], [10, 64], [16, 68], [22, 70], [28, 71], [32, 70], [38, 68], [44, 68], [52, 68], [60, 69], [68, 70], [74, 72], [80, 73], [88, 74], [96, 76], [104, 76], [112, 74], [120, 73], [128, 72], [136, 72], [144, 72], [152, 70], [158, 69], [162, 66], [170, 66], [178, 65], [178, 62], [170, 60], [162, 58], [158, 52], [156, 51], [150, 59], [142, 59], [141, 52], [140, 45], [138, 43], [135, 43], [132, 43], [130, 42], [127, 40], [126, 38], [122, 37], [120, 32], [118, 28], [114, 22], [110, 20], [108, 18], [105, 10], [103, 8], [100, 8], [98, 10], [97, 16], [94, 17], [92, 21], [90, 22], [88, 22], [86, 20], [83, 18], [80, 15], [77, 8], [76, 10], [74, 15], [73, 20], [72, 20], [70, 22], [68, 23], [66, 25], [62, 25], [58, 26], [56, 27], [54, 26], [52, 26], [50, 29], [48, 30], [50, 29], [54, 27], [56, 26], [57, 25], [59, 22], [58, 20], [55, 17], [52, 15], [48, 14], [44, 13], [43, 12], [40, 15], [38, 18], [37, 22], [35, 28], [34, 28], [33, 31], [35, 36], [36, 36], [30, 36], [27, 37], [26, 38], [23, 36], [22, 37], [20, 39], [19, 42], [16, 44], [14, 45], [12, 44], [10, 44], [8, 44], [7, 44], [3, 43], [0, 40], [-2, 37], [-6, 36], [-9, 37], [-10, 36]],
  // United Kingdom
  [[-5, 50], [-3, 53], [-5, 56], [-3, 58], [-1, 57], [0, 53], [1, 51], [-2, 50], [-5, 50]],
  // Japan
  [[130, 31], [132, 33], [134, 34], [136, 35], [138, 35], [140, 36], [141, 38], [141, 41], [142, 44], [144, 44], [143, 42], [141, 39], [140, 36], [137, 34], [133, 34], [131, 32], [130, 31]],
  // Borneo
  [[109, 0], [114, -4], [117, -2], [119, 1], [117, 4], [113, 4], [110, 2], [109, 0]],
  // Sumatra
  [[95, 5], [100, 0], [104, -3], [106, -6], [103, -5], [99, -1], [95, 5]],
  // Java
  [[105, -6], [110, -7], [114, -8], [114, -7], [108, -6], [105, -6]],
  // New Guinea
  [[131, -1], [136, -2], [141, -3], [146, -6], [147, -9], [143, -8], [138, -7], [134, -4], [131, -1]],
  // Sulawesi
  [[119, 0], [121, -2], [120, -4], [119, -1], [119, 0]],
  // Australia
  [[113, -22], [114, -30], [115, -33], [118, -35], [124, -33], [129, -32], [132, -32], [135, -35], [138, -35], [140, -38], [145, -38], [150, -37], [153, -32], [153, -27], [150, -23], [146, -19], [142, -15], [142, -11], [137, -12], [135, -15], [132, -12], [130, -13], [126, -14], [122, -17], [118, -20], [113, -22]],
  // New Zealand
  [[167, -45], [170, -42], [173, -40], [175, -38], [177, -38], [175, -40], [173, -43], [170, -46], [167, -45]],
];

// Numbered pins for stories 1-13: [lon, lat, n, disc dx, disc dy]
// Discs are offset per pin so neighbours (6/8 in India, 4/11/7 in Europe)
// never cover each other.
const PINS: Array<[number, number, number, number, number]> = [
  [-81, 26, 1, 4, -12], [114, 22.5, 2, 4, -12], [-74, 40.7, 3, 4, -12], [4.3, 52, 4, -8, -12], [30.7, 36.9, 5, 4, -12],
  [85.8, 19.8, 6, -9, -13], [30.5, 50.4, 7, 10, -11], [90.4, 23.8, 8, 9, -12], [-77, 38.9, 9, 4, -12], [34.5, 31.5, 10, 4, -12],
  [16.4, 48.2, 11, 0, -15], [56.5, 26.5, 12, 4, -12], [127, 37.5, 13, 4, -12],
];

// Grey dots for the briefs' cities (deduped).
const DOTS: Array<[number, number]> = [
  [-67, 10.5], [106.8, -6.2], [178.4, -18.1], [-0.1, 51.5], [48, 29.4], [101.7, 3.1],
  [121, 14.6], [44.2, 15.4], [177.4, -17.8], [57.2, 26.2], [35.2, 31.8], [46.7, 24.7],
];

function drawMap(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SEA);
  const proj = (lon: number, lat: number): Pt2 => [
    x + ((lon + 180) / 360) * w,
    y + ((85 - lat) / 145) * h,
  ];
  // faint graticule
  for (const lat of [60, 30, 0, -30]) {
    const [, py] = proj(0, lat);
    line(x, py, x + w, py, LGREY, 0.6);
  }
  for (const lon of [-120, -60, 0, 60, 120]) {
    const [px] = proj(lon, 0);
    line(px, y, px, y + h, LGREY, 0.6);
  }
  // land: fill, hatch texture, ink coastline
  for (const cont of CONTINENTS) {
    const pts = cont.map(([lon, lat]) => proj(lon, lat));
    fillPoly(pts, LEAF);
    hatchPoly(pts, 45, 5, LEAF_D, 0.6);
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      line(ax, ay, bx, by, INK, 0.9);
    }
  }
  // brief dots
  for (const [lon, lat] of DOTS) {
    const [px, py] = proj(lon, lat);
    fillCircle(px, py, 2, GREY);
    circleOutline(px, py, 2, INK, 0.6);
  }
  // numbered pins with leader lines
  for (const [lon, lat, n, dx, dy] of PINS) {
    const [px, py] = proj(lon, lat);
    // leader line: short tick from the location to the disc
    line(px, py, px + dx, py + dy + 5, INK, 0.8);
    fillCircle(px + dx, py + dy, 5.5, RED);
    circleOutline(px + dx, py + dy, 5.5, INK, 1);
    const label = String(n);
    const tw = textWidth(SANS_B, 7, label);
    drawText(SANS_B, 7, px + dx - tw / 2, py + dy - 3.5, label, WHITE);
  }
  rectOutline(x, y, w, h, INK, 1.5);
}

// ---------------------------------------------------------------- content
interface Story { n: number; kicker: string; source: string; headline: string; body: string; art: (x: number, y: number, w: number, h: number) => void }

const HEROES: Story[] = [
  { n: 1, kicker: '1 · WORLDWIDE · GAMES', source: 'REUTERS', headline: 'GTA VI arrives after a 13-year wait', body: 'Grand Theft Auto VI rolled out worldwide from midnight in New Zealand — rave reviews, a 99 on Metacritic. 15.9m pre-orders, $79.99, PS5 and Xbox, no PC yet.', art: drawGTA },
  { n: 2, kicker: '2 · SHENZHEN · SUMMIT', source: 'REUTERS · NYT', headline: 'Trump, Xi and Putin meet in one room', body: 'The three nuclear powers hold their first three-way summit at APEC. Arms control and the Iran war top the agenda.', art: drawSummit },
  { n: 3, kicker: '3 · NASDAQ · MARKETS', source: 'REUTERS', headline: 'Anthropic debuts in the biggest IPO ever', body: 'Priced at $83, above its $70-78 range; $81.3bn raised, valued near $1.5tn as ANT starts trading Thursday.', art: drawIPO },
];

const MEDIUMS: Story[] = [
  { n: 4, kicker: '4 · THE HAGUE · LAW', source: 'ICJ / AP', headline: 'World Court rules on Rohingya genocide', body: 'The ICJ rules in The Gambia v Myanmar over the 2017 campaign. The ruling is final.', art: drawCourt },
  { n: 5, kicker: '5 · ANTALYA · CLIMATE', source: 'AFP', headline: 'COP31 enters its final 48 hours', body: "Ministers take over the text. 'Phase out' and the $120bn fund are still open.", art: drawCOP },
  { n: 6, kicker: '6 · ODISHA · STORM', source: 'IMD', headline: 'Akvan bears down as 200,000 flee the coast', body: 'Red alerts in 11 districts as Cyclone Akvan nears landfall near Puri. 80,000 evacuated.', art: drawAkvan },
  { n: 7, kicker: '7 · KYIV · WAR', source: 'KYIV AF', headline: 'Ukraine hits Crimean Bridge', body: 'A third attack in a week; traffic is suspended after the new strike, Russian officials say.', art: drawBridge },
  { n: 8, kicker: '8 · DHAKA · POLITICS', source: 'AFP', headline: 'Bangladesh sinks into turmoil', body: "Yunus's ancestral home is set on fire; 28 districts hit by violence amid Hasina party protests.", art: drawBangladesh },
  { n: 9, kicker: '9 · WASHINGTON · IRAN', source: 'AP', headline: 'Netanyahu urges Iran strike', body: 'Netanyahu urges a 4- to 7-day campaign; Trump says Iran seeks chemical and biological arms.', art: drawCapitol },
  { n: 10, kicker: '10 · GAZA · WAR', source: 'REUTERS', headline: 'Israel crosses Yellow Line', body: 'Israeli forces launch a rare ground operation in central Gaza, beyond the Yellow Line.', art: drawTanks },
  { n: 11, kicker: '11 · VIENNA · NUCLEAR', source: 'IAEA', headline: 'N. Korea expands uranium work', body: "The IAEA reports further expansion at Yongbyon; Seoul's president calls for renewed dialogue.", art: drawAtom },
  { n: 12, kicker: '12 · HORMUZ · ENERGY', source: 'IEA', headline: 'Mideast crisis threatens energy', body: 'The Middle East crisis is the greatest threat to energy security, the IEA’s report says.', art: drawBarrel },
  { n: 13, kicker: '13 · SEOUL · EDUCATION', source: 'KOREA TIMES', headline: "Half a million sit Korea's Suneung", body: "551,864 take the college entrance exam. Flights pause and phones are checked.", art: drawExam },
];

const BRIEFS: Array<[number, string, string]> = [
  [14, 'CARACAS', 'US, Venezuela sign military deal.'],
  [15, 'WASHINGTON', 'IMF: global inflation hits 4.7%.'],
  [16, 'SHENZHEN', 'Trump: US opposes global AI rules.'],
  [17, 'SEOUL', 'Lee calls for talks with Pyongyang.'],
  [18, 'JAKARTA', 'Indonesia passes asset-seizure bill.'],
  [19, 'SUVA', 'Fiji declares disaster over drought.'],
  [20, 'LONDON', '589m children lived in war zones.'],
  [21, 'MARKETS', 'CAC -0.85, DAX -1.19, FTSE -1.30, S&P -0.23%.'],
  [22, 'KUWAIT CITY', 'Kuwait repels Iranian attack.'],
  [23, 'WASHINGTON', 'US seeks stay on Venezuelan TPS.'],
  [24, 'KUALA LUMPUR', 'UNHCR halts new asylum cases.'],
  [25, 'MANILA', 'US pursues $2bn loan for Philippines.'],
  [26, 'SANA’A', 'Missile threat reported near Riyadh.'],
  [27, 'NADI', 'Cyclone Xavier winds hit 100 knots.'],
  [28, 'KHASAB', 'Tanker hit in Hormuz; crew safe.'],
  [29, 'JERUSALEM', 'E1 delayed; settler kills woman.'],
  [30, 'SHENZHEN', 'APEC opens before trilateral talks.'],
  [31, 'WASHINGTON', 'New START expiry raises arms fears.'],
  [32, 'SHENZHEN', 'Trump meets Putin, Xi separately.'],
  [33, 'RIYADH', 'Danger passed after new warning.'],
  [34, 'FLORIDA', 'Flooded Florida braces for more rain; 300 rescue calls in a night.'],
];

const REGIONS: Array<[string, number, RGB]> = [
  ['EUROPE 3', 3, NAVY], ['THE AMERICAS 7', 7, [40, 130, 70]], ['ASIA-PACIFIC 13', 13, RED],
  ['MIDEAST 6', 6, OCHRE], ['OCEANIA 2', 2, TEAL], ['WORLD 3', 3, [80, 80, 80]],
];

const STATS: Array<[string, string]> = [
  ['$81.3bn', 'largest IPO on record'],
  ['15.9m', 'GTA VI pre-orders'],
  ['200,000', 'evacuated ahead of Akvan'],
  ['$120bn', 'COP31 goal unresolved'],
  ['730,000', 'Rohingya fled in 2017'],
  ['551,864', 'sit Korea’s Suneung exam'],
];

const DATE_CHECK_TEXT = 'Not Thursday’s news: Van Gogh’s $190.4m sale (Wed 18 Nov) · the EU’s proposed €45bn loan for Ukraine (Wed 18 Nov) · the US strike on Iran’s Qeshm Island (Tue 17 Nov) · Voyager 1 crossing one light-day from Earth (Wed 18 Nov) · Xi–Putin talks (Wed) · N. Korea’s Tuesday missiles.';
const HOW_SURE_TEXT = 'REPORTED — named wire or official source · CLAIM — one side’s account, attributed · FORECAST — expected, not yet happened.';
const FOOTER_TEXT = 'Every story here happened, or was first reported, on Thursday 19 November 2026. Sources: Reuters, AP, AFP, BBC, IMD, ICJ, NYT. Original woodcut-style drawings.';

// ---------------------------------------------------------------- layout
const MX = 16;
const CW = 992;

function drawCard(s: Story, x: number, y: number, w: number, h: number, imageH: number, headlineSize: number, bodySize: number): void {
  rectOutline(x, y, w, h, INK, 1.5);
  s.art(x + 5, y + 5, w - 10, imageH);
  const ty = y + 5 + imageH + 6;
  // numbered red disc + kicker + source
  const discR = headlineSize >= 19 ? 7 : 6;
  fillCircle(x + 8 + discR, ty + 5, discR, RED);
  circleOutline(x + 8 + discR, ty + 5, discR, INK, 0.75);
  const num = String(s.n);
  drawText(SANS_B, 7.5, x + 8 + discR - textWidth(SANS_B, 7.5, num) / 2, ty + 5 - 3.5, num, WHITE);
  const kSize0 = headlineSize >= 19 ? 8.5 : 8;
  const sSize = headlineSize >= 19 ? 7.5 : 7;
  const sw = textWidth(SANS, sSize, s.source);
  const kMax = w - (8 + discR * 2 + 4) - 6 - sw - 4;
  // Auto-fit the kicker by shrinking the font, never by cutting letters.
  let kSize = kSize0;
  while (kSize > 6.5 && textWidth(SANS_B, kSize, s.kicker) > kMax) kSize -= 0.5;
  drawText(SANS_B, kSize, x + 8 + discR * 2 + 4, ty, s.kicker, RED);
  drawText(SANS, sSize, x + w - 6 - sw, ty + 1, s.source, GREY);
  const hy = ty + 14;
  const hh = drawWrapped(SERIF_B, headlineSize, x + 8, hy, w - 16, s.headline, INK, headlineSize + 4, 2);
  drawWrapped(SANS, bodySize, x + 8, hy + hh + 4, w - 16, s.body, INK, bodySize + 3, 4);
}

function main(): void {
  let y = 16;
  // Top bar
  fillRect(MX, y, CW, 18, INK);
  drawText(SANS_B, 10, MX + 8, y + 4, 'ONE DAY · ONE PAGE · THE WHOLE WORLD', WHITE);
  const rb = '34 STORIES · 6 REGIONS · 13 DRAWN';
  drawText(SANS_B, 10, MX + CW - 8 - textWidth(SANS_B, 10, rb), y + 4, rb, OCHRE);
  y += 18 + 6;
  // Masthead
  drawTextCentered(SERIF_B, 46, 512, y + 2, 'THE WORLD IN WOODCUT', INK);
  drawTextCentered(SERIF_B, 17, 512, y + 54, 'Thursday 19 November 2026', INK);
  // framed 19 NOV block, right
  const bx = 884, by = y + 4, bw = 116, bh = 64;
  fillRect(bx, by, bw, bh, PAPER2);
  rectOutline(bx, by, bw, bh, INK, 2.5);
  hatchRect(bx + 3, by + 3, 14, 14, 45, 3.5, INK, 0.6);
  hatchRect(bx + bw - 17, by + bh - 17, 14, 14, 45, 3.5, INK, 0.6);
  drawTextCentered(SERIF_B, 30, bx + bw / 2, by + 6, '19', RED);
  drawTextCentered(SANS_B, 13, bx + bw / 2, by + 40, 'NOV 2026', INK);
  y += 72;
  hline(MX, y + 2, CW, INK, 2);
  hline(MX, y + 6, CW, INK, 1);
  y += 8;
  // Subhead
  drawTextCentered(SERIF_B, 15, 512, y + 2, 'GTA VI unlocks worldwide · Three leaders meet in Shenzhen · The biggest IPO ever starts trading', RED);
  y += 22;
  // Region strip
  {
    let cx = MX;
    let used = 0;
    for (let i = 0; i < REGIONS.length; i++) {
      const [label, count, col] = REGIONS[i];
      const w = i === REGIONS.length - 1 ? CW - used : Math.round((count / 34) * CW);
      fillRect(cx, y, w, 22, col);
      drawTextCentered(SANS_B, 10, cx + w / 2, y + 6, label, WHITE);
      cx += w;
      used += w;
    }
  }
  y += 22 + 6;
  // Stat strip
  {
    const colW = CW / 6;
    for (let i = 0; i < STATS.length; i++) {
      const sx = MX + i * colW;
      if (i > 0) vline(sx, y + 4, 44, LGREY, 1);
      drawText(SERIF_B, 20, sx + 8, y + 2, STATS[i][0], RED);
      drawWrapped(SANS, 9, sx + 8, y + 28, colW - 16, STATS[i][1], INK, 11, 2);
    }
  }
  y += 52 + 6;
  // Heroes
  for (let i = 0; i < HEROES.length; i++) {
    drawCard(HEROES[i], MX + i * 330, y, 322, 222, 88, 19, 11);
  }
  y += 222 + 6;
  // Mediums, 2 rows of 5
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 5; i++) {
      const s = MEDIUMS[row * 5 + i];
      drawCard(s, MX + i * 200, y, 190, 145, 48, 13, 9);
    }
    y += 145 + 6;
  }
  // Map + briefs card
  {
    const cardY = y;
    const cardH = 152;
    rectOutline(MX, cardY, CW, cardH, INK, 1.5);
    drawText(SANS_B, 10, MX + 8, cardY + 6, 'WHERE IT HAPPENED', INK);
    drawMap(MX + 8, cardY + 20, 292, 118);
    drawText(SANS, 8, MX + 8, cardY + 140, 'Red pins mark stories 1–13; grey dots mark briefs.', GREY);
    const bx0 = MX + 316;
    drawText(SANS_B, 10, bx0, cardY + 6, 'ALSO ON THURSDAY — 21 MORE STORIES', INK);
    const colW = 322;
    const lineH = 11.5;
    for (let col = 0; col < 2; col++) {
      const items = BRIEFS.slice(col * 11, col * 11 + 11);
      let byy = cardY + 22;
      for (const [n, city, text] of items) {
        const num = `${n} `;
        const nw = textWidth(SANS_B, 9, num);
        drawText(SANS_B, 9, bx0 + col * (colW + 10), byy, num, RED);
        const cw2 = textWidth(SANS_B, 9, city + ' ');
        drawText(SANS_B, 9, bx0 + col * (colW + 10) + nw, byy, city + ' ', INK);
        const used = drawWrapped(SANS, 9, bx0 + col * (colW + 10) + nw + cw2, byy, colW - nw - cw2, text, INK, lineH, 2);
        byy += Math.max(lineH, used);
      }
    }
    y = cardY + cardH;
  }
  y += 6;
  // DATE CHECK + HOW SURE ARE WE?
  {
    const boxY = y;
    rectOutline(MX, boxY, CW, 62, RED, 2);
    drawText(SANS_B, 10, MX + 8, boxY + 5, 'DATE CHECK — LEFT OFF THIS PAGE ON PURPOSE', RED);
    drawWrapped(SANS, 9.5, MX + 8, boxY + 19, CW - 16, DATE_CHECK_TEXT, INK, 12, 2);
    hline(MX + 8, boxY + 45, CW - 16, LGREY, 1);
    const label = 'HOW SURE ARE WE? ';
    drawText(SANS_B, 9.5, MX + 8, boxY + 49, label, RED);
    drawText(SANS, 9.5, MX + 8 + textWidth(SANS_B, 9.5, label), boxY + 49, HOW_SURE_TEXT, INK);
    y = boxY + 62;
  }
  y += 6;
  // Footer
  drawTextCentered(SANS, 8.5, 512, y, FOOTER_TEXT, GREY);
  y += 12;
  if (y > 1008) throw new Error(`layout overflow: used to y=${y}`);
  console.log(`layout ok, bottom y=${y}`);
}

main();
writeOutput();
