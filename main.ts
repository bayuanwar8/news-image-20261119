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

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
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

// ---------------------------------------------------------------- font (TrueType)
// Real TrueType fonts (DejaVu, SIL OFL) shipped in fonts/. A pure-stdlib
// TTF reader + glyph rasterizer: cmap format 4 and 12, glyf/loca outlines
// (quadratic Beziers, composite glyphs), scanline fill with 4x
// supersampling anti-aliasing, so the type looks like a real newspaper.
// All text is English. Deterministic: no Date, no Math.random.

const SS = 4; // supersample factor for anti-aliasing

function parseTTF(buf) {
  const u16 = (o) => buf.readUInt16BE(o);
  const i16 = (o) => buf.readInt16BE(o);
  const u32 = (o) => buf.readUInt32BE(o);
  const numTables = u16(4);
  const tabs = {};
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tabs[buf.toString("ascii", o, o + 4)] = { off: u32(o + 8), len: u32(o + 12) };
  }
  const head = tabs.head.off;
  const unitsPerEm = u16(head + 18);
  const indexToLocFormat = i16(head + 50);
  const numGlyphs = u16(tabs.maxp.off + 4);
  const hhea = tabs.hhea.off;
  const numberOfHMetrics = u16(hhea + 34);
  const ascent = i16(hhea + 4);
  const descent = i16(hhea + 6);
  // hmtx advances (last metric repeats for the remaining glyphs).
  const hmtx = tabs.hmtx.off;
  const advances = new Uint16Array(numGlyphs);
  for (let g = 0; g < numGlyphs; g++) {
    advances[g] = u16(hmtx + Math.min(g, numberOfHMetrics - 1) * 4);
  }
  // loca: glyph offsets.
  const loca = tabs.loca.off;
  const glyphOff = (g) => (indexToLocFormat === 1 ? u32(loca + g * 4) : u16(loca + g * 2) * 2);
  // cmap: prefer format 12, else format 4.
  const cmap = tabs.cmap.off;
  const nSub = u16(cmap + 2);
  let cmap12 = -1;
  let cmap4 = -1;
  for (let i = 0; i < nSub; i++) {
    const o = cmap + 4 + i * 8;
    const subOff = cmap + u32(o + 4);
    const fmt = u16(subOff);
    if (fmt === 12 && cmap12 < 0) cmap12 = subOff;
    if (fmt === 4 && cmap4 < 0) cmap4 = subOff;
  }
  const charToGlyph = new Map();
  if (cmap12 >= 0) {
    const nGroups = u32(cmap12 + 12);
    for (let i = 0; i < nGroups; i++) {
      const o = cmap12 + 16 + i * 12;
      const start = u32(o);
      const end = u32(o + 4);
      const g0 = u32(o + 8);
      for (let cp = start; cp <= end; cp++) charToGlyph.set(cp, g0 + (cp - start));
    }
  } else if (cmap4 >= 0) {
    const segCount = u16(cmap4 + 6) / 2;
    const endCodes = cmap4 + 14;
    const startCodes = endCodes + 2 * segCount + 2;
    const idDeltas = startCodes + 2 * segCount;
    const idRangeOffsets = idDeltas + 2 * segCount;
    for (let s = 0; s < segCount; s++) {
      const end = u16(endCodes + 2 * s);
      const start = u16(startCodes + 2 * s);
      if (end === 0xffff) break;
      const delta = i16(idDeltas + 2 * s);
      const rangeOff = u16(idRangeOffsets + 2 * s);
      for (let cp = start; cp <= end; cp++) {
        let g;
        if (rangeOff === 0) {
          g = (cp + delta) & 0xffff;
        } else {
          const idxOff = idRangeOffsets + 2 * s + rangeOff + 2 * (cp - start);
          g = u16(idxOff);
          if (g !== 0) g = (g + delta) & 0xffff;
        }
        if (g !== 0) charToGlyph.set(cp, g);
      }
    }
  }
  // glyf outlines. Returns contours as arrays of {x, y, on} points.
  const glyf = tabs.glyf.off;
  function glyphContours(g, depth) {
    if (g >= numGlyphs || depth > 4) return [];
    const g0 = glyphOff(g);
    const g1 = glyphOff(g + 1);
    if (g1 <= g0) return [];
    const nContours = i16(glyf + g0);
    if (nContours < 0) {
      // Composite glyph: components with offsets and optional scales.
      let p = glyf + g0 + 10;
      const out = [];
      for (;;) {
        const flags = u16(p);
        p += 2;
        const compGlyph = u16(p);
        p += 2;
        let dx = 0;
        let dy = 0;
        let sx = 1;
        let sy = 1;
        let s01 = 0;
        let s10 = 0;
        if (flags & 0x0001) {
          dx = i16(p);
          dy = i16(p + 2);
          p += 4;
        } else {
          // Args are point numbers, not offsets; treat as no offset.
          p += 2;
        }
        if (flags & 0x0008) {
          sx = sy = i16(p) / 16384;
          p += 2;
        } else if (flags & 0x0040) {
          sx = i16(p) / 16384;
          sy = i16(p + 2) / 16384;
          p += 4;
        } else if (flags & 0x0080) {
          sx = i16(p) / 16384;
          s01 = i16(p + 2) / 16384;
          s10 = i16(p + 4) / 16384;
          sy = i16(p + 6) / 16384;
          p += 8;
        }
        const sub = glyphContours(compGlyph, depth + 1);
        for (const contour of sub) {
          out.push(
            contour.map((pt) => ({
              x: dx + pt.x * sx + pt.y * s10,
              y: dy + pt.x * s01 + pt.y * sy,
              on: pt.on,
            }))
          );
        }
        if (!(flags & 0x0020)) break;
      }
      return out;
    }
    if (nContours === 0) return [];
    let p = glyf + g0 + 10;
    const endPts = [];
    for (let c = 0; c < nContours; c++) {
      endPts.push(u16(p));
      p += 2;
    }
    const instrLen = u16(p);
    p += 2 + instrLen;
    const nPts = endPts[nContours - 1] + 1;
    const flagsArr = [];
    while (flagsArr.length < nPts) {
      const f = buf[p++];
      flagsArr.push(f);
      if (f & 0x08) {
        const rep = buf[p++];
        for (let r = 0; r < rep; r++) flagsArr.push(f);
      }
    }
    const xs = [];
    let x = 0;
    for (let i = 0; i < nPts; i++) {
      const f = flagsArr[i];
      if (f & 0x02) {
        const d = buf[p++];
        x += f & 0x10 ? d : -d;
      } else if (!(f & 0x10)) {
        x += i16(p);
        p += 2;
      }
      xs.push(x);
    }
    const ys = [];
    let y = 0;
    for (let i = 0; i < nPts; i++) {
      const f = flagsArr[i];
      if (f & 0x04) {
        const d = buf[p++];
        y += f & 0x20 ? d : -d;
      } else if (!(f & 0x20)) {
        y += i16(p);
        p += 2;
      }
      ys.push(y);
    }
    const contours = [];
    let start = 0;
    for (let c = 0; c < nContours; c++) {
      const end = endPts[c];
      const pts = [];
      for (let i = start; i <= end; i++) {
        pts.push({ x: xs[i], y: ys[i], on: (flagsArr[i] & 0x01) !== 0 });
      }
      contours.push(pts);
      start = end + 1;
    }
    return contours;
  }
  // Glyph bounding box from the glyf header (xMin, yMin, xMax, yMax).
  function glyphBox(g) {
    if (g >= numGlyphs) return null;
    const g0 = glyphOff(g);
    const g1 = glyphOff(g + 1);
    if (g1 <= g0) return null;
    return {
      xMin: i16(glyf + g0 + 2),
      yMin: i16(glyf + g0 + 4),
      xMax: i16(glyf + g0 + 6),
      yMax: i16(glyf + g0 + 8),
    };
  }
  return { unitsPerEm, numGlyphs, ascent, descent, advances, charToGlyph, glyphContours, glyphBox };
}

// Flatten one contour ({x, y, on} points) into a polygon of [x, y] points.
// Handles off-curve start/end points and implied on-curve midpoints.
function flattenContour(pts) {
  const n = pts.length;
  if (n === 0) return [];
  if (n === 1) return [[pts[0].x, pts[0].y]];
  let items = [];
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (pts[i].on) {
      start = i;
      break;
    }
  }
  if (start === -1) {
    // All points off-curve: implied on-curve points between each pair.
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      items.push({ on: false, x: a.x, y: a.y });
      items.push({ on: true, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
    items = items.slice(1).concat(items.slice(0, 1));
  } else {
    for (let k = 0; k < n; k++) items.push(pts[(start + k) % n]);
    const expanded = [];
    for (let i = 0; i < items.length; i++) {
      expanded.push(items[i]);
      const nxt = items[(i + 1) % items.length];
      if (!items[i].on && !nxt.on) {
        expanded.push({ on: true, x: (items[i].x + nxt.x) / 2, y: (items[i].y + nxt.y) / 2 });
      }
    }
    items = expanded;
  }
  const poly = [[items[0].x, items[0].y]];
  let cx = items[0].x;
  let cy = items[0].y;
  let i = 1;
  while (i < items.length) {
    const it = items[i];
    if (it.on) {
      poly.push([it.x, it.y]);
      cx = it.x;
      cy = it.y;
      i++;
    } else {
      const end = items[(i + 1) % items.length];
      const segs = quadSegments(cx, cy, it.x, it.y, end.x, end.y);
      for (const p of segs) poly.push(p);
      cx = end.x;
      cy = end.y;
      i += 2;
    }
  }
  return poly;
}

// Subdivide a quadratic Bezier into line segments (excluding the start
// point, including the end point). Deterministic adaptive subdivision.
function quadSegments(x0, y0, cx, cy, x1, y1) {
  const pts = [];
  function sub(ax, ay, bx, by, ex, ey, depth) {
    const mx = (ax + 2 * bx + ex) / 4;
    const my = (ay + 2 * by + ey) / 4;
    const lx = (ax + ex) / 2;
    const ly = (ay + ey) / 2;
    const d = Math.abs(mx - lx) + Math.abs(my - ly);
    if (d < 0.5 || depth >= 10) {
      pts.push([ex, ey]);
      return;
    }
    const abx = (ax + bx) / 2;
    const aby = (ay + by) / 2;
    const bcx = (bx + ex) / 2;
    const bcy = (by + ey) / 2;
    const mxx = (abx + bcx) / 2;
    const myy = (aby + bcy) / 2;
    sub(ax, ay, abx, aby, mxx, myy, depth + 1);
    sub(mxx, myy, bcx, bcy, ex, ey, depth + 1);
  }
  sub(x0, y0, cx, cy, x1, y1, 0);
  return pts;
}

// Scanline fill of polygons with the non-zero winding rule.
// Returns a Uint8Array of 0/1 coverage at W x H.
function fillPolygons(polys, W, H) {
  const cov = new Uint8Array(W * H);
  const edges = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const x0 = poly[i][0];
      const y0 = poly[i][1];
      const x1 = poly[(i + 1) % poly.length][0];
      const y1 = poly[(i + 1) % poly.length][1];
      if (y0 === y1) continue;
      edges.push({ x0, y0, x1, y1 });
    }
  }
  for (let y = 0; y < H; y++) {
    const yc = y + 0.5;
    const crossings = [];
    for (const e of edges) {
      if ((e.y0 <= yc && e.y1 > yc) || (e.y1 <= yc && e.y0 > yc)) {
        const t = (yc - e.y0) / (e.y1 - e.y0);
        crossings.push({ x: e.x0 + t * (e.x1 - e.x0), dir: e.y1 > e.y0 ? 1 : -1 });
      }
    }
    crossings.sort((a, b) => a.x - b.x);
    let winding = 0;
    let startX = null;
    for (const c of crossings) {
      if (winding === 0) startX = c.x;
      winding += c.dir;
      if (winding === 0 && startX !== null) {
        const x0 = Math.max(0, Math.ceil(startX - 0.5));
        const x1 = Math.min(W, Math.floor(c.x + 0.5));
        for (let x = x0; x < x1; x++) cov[y * W + x] = 1;
        startX = null;
      }
    }
  }
  return cov;
}

// Rasterize one glyph at a pixel size into a grayscale bitmap.
// Returns { w, h, xOff, yOff, advance, bitmap }; xOff/yOff is the
// bitmap's top-left relative to the pen position (baseline origin).
function rasterizeGlyph(font, g, size) {
  const scale = size / font.unitsPerEm;
  const adv = font.advances[g] * scale;
  const box = font.glyphBox(g);
  if (!box) return { w: 0, h: 0, xOff: 0, yOff: 0, advance: adv, bitmap: null };
  const pad = 1;
  const x0 = Math.floor(box.xMin * scale) - pad;
  const x1 = Math.ceil(box.xMax * scale) + pad;
  const y0 = Math.floor(-box.yMax * scale) - pad;
  const y1 = Math.ceil(-box.yMin * scale) + pad;
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return { w: 0, h: 0, xOff: 0, yOff: 0, advance: adv, bitmap: null };
  const s = SS;
  const W = w * s;
  const H = h * s;
  const contours = font.glyphContours(g, 0);
  const polys = [];
  for (const contour of contours) {
    const scaled = contour.map((pt) => ({
      x: (pt.x * scale - x0) * s,
      y: (-pt.y * scale - y0) * s,
      on: pt.on,
    }));
    const poly = flattenContour(scaled);
    if (poly.length >= 3) polys.push(poly);
  }
  const cov = fillPolygons(polys, W, H);
  const bitmap = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let sy = 0; sy < s; sy++) {
        for (let sx = 0; sx < s; sx++) sum += cov[(y * s + sy) * W + (x * s + sx)];
      }
      bitmap[y * w + x] = Math.round((sum / (s * s)) * 255);
    }
  }
  return { w, h, xOff: x0, yOff: y0, advance: adv, bitmap };
}

// Composite a rasterized glyph bitmap onto the framebuffer with blending.
function drawGlyphBitmap(g, penX, baselineY, color) {
  const x0 = Math.round(penX) + g.xOff;
  const y0 = Math.round(baselineY) + g.yOff;
  for (let y = 0; y < g.h; y++) {
    const yy = y0 + y;
    if (yy < 0 || yy >= H) continue;
    for (let x = 0; x < g.w; x++) {
      const c = g.bitmap[y * g.w + x];
      if (c === 0) continue;
      const xx = x0 + x;
      if (xx < 0 || xx >= W) continue;
      const i = (yy * W + xx) * 3;
      if (c === 255) {
        px[i] = color[0];
        px[i + 1] = color[1];
        px[i + 2] = color[2];
      } else {
        const inv = 255 - c;
        px[i] = ((px[i] * inv + color[0] * c + 127) / 255) | 0;
        px[i + 1] = ((px[i + 1] * inv + color[1] * c + 127) / 255) | 0;
        px[i + 2] = ((px[i + 2] * inv + color[2] * c + 127) / 255) | 0;
      }
    }
  }
}

// Load the fonts (relative to this script; the repo is read-only /bot
// in the sandbox, and the fonts ship inside it).
function loadFont(rel) {
  const f = parseTTF(readFileSync(new URL(rel, import.meta.url)));
  f.rasterCache = new Map();
  return f;
}
const FONT_SERIF_B = loadFont("fonts/DejaVuSerif-Bold.ttf");
const FONT_SANS = loadFont("fonts/DejaVuSans.ttf");
const FONT_SANS_B = loadFont("fonts/DejaVuSans-Bold.ttf");

// Normalize curly quotes/dashes to the glyphs we use.
function normChar(ch) {
  if (ch === "’" || ch === "‘" || ch === "`") return "'";
  if (ch === "“" || ch === "”") return '"';
  if (ch === "–") return "-";
  return ch;
}

function glyphFor(font, ch) {
  const cp = normChar(ch).codePointAt(0);
  const g = font.charToGlyph.get(cp);
  return g === undefined ? 0 : g; // 0 = .notdef
}

function getGlyph(font, size, g) {
  const key = size + ":" + g;
  let r = font.rasterCache.get(key);
  if (!r) {
    r = rasterizeGlyph(font, g, size);
    font.rasterCache.set(key, r);
  }
  return r;
}

// Width of a string in pixels at a font size.
function textWidth(font, size, s) {
  let w = 0;
  for (const ch of s) w += font.advances[glyphFor(font, ch)] * (size / font.unitsPerEm);
  return w;
}

// Draw one line of text. x, y = top-left of the em box (y is the top of
// the ascender). Returns the width used.
function drawText(x, y, s, font, size, color) {
  const scale = size / font.unitsPerEm;
  const baseline = y + font.ascent * scale;
  let penX = x;
  for (const ch of s) {
    const g = glyphFor(font, ch);
    const r = getGlyph(font, size, g);
    if (r.bitmap) drawGlyphBitmap(r, penX, baseline, color);
    penX += r.advance;
  }
  return penX - x;
}

function drawTextCentered(cx, y, s, font, size, color) {
  const w = textWidth(font, size, s);
  return drawText(cx - w / 2, y, s, font, size, color);
}

// Word-wrap text into lines that fit maxW (measured, not counted).
// Returns an array of lines.
function wrapText(s, maxW, font, size) {
  const words = s.split(" ");
  const spaceW = textWidth(font, size, " ");
  const lines = [];
  let cur = "";
  let curW = 0;
  for (const w of words) {
    const ww = textWidth(font, size, w);
    if (cur === "") {
      cur = w;
      curW = ww;
    } else if (curW + spaceW + ww <= maxW) {
      cur += " " + w;
      curW += spaceW + ww;
    } else {
      lines.push(cur);
      cur = w;
      curW = ww;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// Draw wrapped text. Returns the total height used.
function drawWrapped(x, y, maxW, s, font, size, color, leading) {
  const lh = leading === undefined ? Math.round(size * 1.25) : leading;
  const lines = wrapText(s, maxW, font, size);
  for (let i = 0; i < lines.length; i++) drawText(x, y + i * lh, lines[i], font, size, color);
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
  drawText(x + 10, y + 8, "ANT", FONT_SANS_B, 16, WHITE);
  drawText(x + w - 10 - textWidth(FONT_SANS_B, 16, "$83"), y + 8, "$83", FONT_SANS_B, 16, [255, 209, 102]);
  drawText(x + 10, y + h - 18, "NASDAQ · FIRST TRADES TODAY", FONT_SANS, 10, [180, 220, 190]);
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
  drawText(x + 10, y + h - 26, "SHENZHEN", FONT_SANS_B, 11, WHITE);
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
    drawText(dx - textWidth(FONT_SANS_B, 9, label) / 2, dy - 5, label, FONT_SANS_B, 9, WHITE);
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
// All text is English. All facts are from reporting of 19 Nov 2026.

// --- content ---
const HEROES = [
  {
    kicker: "1 · SHENZHEN · SUMMIT",
    headline: "Trump, Xi and Putin hold first three-way summit",
    body: "The three leaders meet for the first time. Ukraine, arms control and the Iran war top the agenda.",
    draw: drawSummitPanel,
  },
  {
    kicker: "2 · THE HAGUE · LAW",
    headline: "World Court rules on Rohingya genocide",
    body: "The UN's top court rules on Gambia's genocide case against Myanmar. The judgment is final.",
    draw: drawCourtPanel,
  },
  {
    kicker: "3 · NASDAQ · MARKETS",
    headline: "Anthropic debuts in the biggest IPO on record",
    body: "Priced at $83, above its $70-78 range; $81.3bn raised, near $1.5tn value.",
    draw: drawChartPanel,
  },
];

const GRID = [
  {
    kicker: "4 · ANTALYA · CLIMATE",
    headline: "COP31 enters final 48 hours",
    body: "Ministers take over the text; 'phase out' and the $120bn fund are still open.",
    draw: iconCOP31,
  },
  {
    kicker: "5 · KYIV · WAR",
    headline: "Ukraine hits Crimean Bridge",
    body: "A third attack in a week; traffic is suspended after the new strike, Russian officials say.",
    draw: iconBridge,
  },
  {
    kicker: "6 · HORMUZ · ENERGY",
    headline: "Mideast crisis threatens energy",
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
    headline: "Van Gogh sells for $190.4m",
    body: "'Chataigniers en fleurs', painted in 1890, is auctioned at Sotheby's in New York.",
    draw: iconSunflower,
  },
  {
    kicker: "9 · WASHINGTON · IRAN",
    headline: "Netanyahu urges Iran strike",
    body: "Netanyahu urges a 4- to 7-day campaign; Trump says Iran seeks chemical and biological arms.",
    draw: iconCapitol,
  },
  {
    kicker: "10 · GAZA · WAR",
    headline: "Israel crosses Yellow Line",
    body: "Israeli forces launch a rare ground operation in central Gaza, beyond the Yellow Line.",
    draw: iconTank,
  },
  {
    kicker: "11 · VIENNA · NUCLEAR",
    headline: "N. Korea expands uranium work",
    body: "The IAEA reports further expansion at Yongbyon; Seoul's president calls for renewed dialogue.",
    draw: iconAtom,
  },
  {
    kicker: "12 · BRUSSELS · EUROPE",
    headline: "EU proposes €45bn loan to Kyiv",
    body: "The European Commission proposes a new 45 billion euro loan to Kyiv.",
    draw: iconEU,
  },
];

const BRIEFS = [
  "CARACAS — US, Venezuela sign military deal.",
  "WASHINGTON — IMF: global inflation hits 4.7%.",
  "SHENZHEN — Trump: US opposes global AI rules.",
  "SEOUL — Lee calls for talks with Pyongyang.",
  "JAKARTA — Indonesia passes asset-seizure bill.",
  "SUVA — Fiji declares disaster over drought.",
  "LONDON — 589m children lived in war zones.",
  "MARKETS — CAC -0.85, DAX -1.19, FTSE -1.30, S&P -0.23%.",
  "KUWAIT CITY — Kuwait repels Iranian attack.",
  "WASHINGTON — US seeks stay on Venezuelan TPS.",
  "KUALA LUMPUR — UNHCR halts new asylum cases.",
  "MANILA — US pursues $2bn loan for Philippines.",
  "SANA'A — Missile threat reported near Riyadh.",
  "PANAMA CITY — Second arrest in reporter attack.",
  "CAPE CANAVERAL — NASA sets CRS-25 launch cover.",
  "NADI — Cyclone Xavier winds hit 100 knots.",
  "KHASAB — Tanker hit in Hormuz; crew safe.",
  "JERUSALEM — E1 delayed; settler kills woman.",
  "SHENZHEN — APEC opens before trilateral talks.",
  "WASHINGTON — New START expiry raises arms fears.",
  "SHENZHEN — Trump meets Putin, Xi separately.",
  "RIYADH — Danger passed after new warning.",
];

const STATS = [
  ["$81.3bn", "raised by Anthropic — the largest IPO on record"],
  ["3", "first three-way summit in Shenzhen"],
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
drawTextCentered(512, 20, "THE WORLD IN ONE DAY", FONT_SERIF_B, 20, RED);
{
  const t = "THURSDAY'S NEWS · ONE PAGE · 34 STORIES";
  drawText(1008 - textWidth(FONT_SANS_B, 11, t), 22, t, FONT_SANS_B, 11, INK);
}
drawTextCentered(512, 44, "Thursday 19 November 2026", FONT_SERIF_B, 56, INK);
drawTextCentered(
  512, 102,
  "Three leaders meet in Shenzhen · A court rules on Myanmar · The biggest IPO ever",
  FONT_SERIF_B, 15, RED
);
hline(16, 122, 992, INK, 2);

// Region strip
{
  const tabW = 992 / 6;
  for (let i = 0; i < REGIONS.length; i++) {
    const x = 16 + Math.floor(i * tabW);
    const w = Math.floor((i + 1) * tabW) - Math.floor(i * tabW);
    fillRect(x, 128, w, 26, REGIONS[i][1]);
    drawTextCentered(x + Math.floor(w / 2), 135, REGIONS[i][0], FONT_SANS_B, 12, WHITE);
  }
}

// Stat strip
{
  const colW = 992 / 6;
  for (let i = 0; i < STATS.length; i++) {
    const x = 16 + Math.floor(i * colW);
    if (i > 0) vline(x, 164, 56, GREY, 1);
    drawText(x + 8, 162, STATS[i][0], FONT_SANS_B, 26, RED);
    drawWrapped(x + 8, 192, Math.floor(colW) - 16, STATS[i][1], FONT_SANS, 10, INK, 13);
  }
}
hline(16, 224, 992, INK, 2);

// Heroes
for (let i = 0; i < HEROES.length; i++) {
  const x = 16 + i * 328;
  const h = HEROES[i];
  h.draw(x, 232, 320, 100);
  drawText(x, 338, h.kicker, FONT_SANS_B, 11, RED);
  drawWrapped(x, 354, 320, h.headline, FONT_SERIF_B, 22, INK, 27);
  drawWrapped(x, 416, 320, h.body, FONT_SANS, 11, INK, 14);
}
hline(16, 452, 992, INK, 2);

// Grid (3 rows x 3 cols)
for (let i = 0; i < GRID.length; i++) {
  const row = Math.floor(i / 3);
  const col = i % 3;
  const x = 16 + col * 328;
  const y = 460 + row * 104;
  const g = GRID[i];
  g.draw(x, y, 320, 28);
  drawText(x, y + 32, g.kicker, FONT_SANS_B, 10, RED);
  drawWrapped(x, y + 46, 320, g.headline, FONT_SERIF_B, 17, INK, 21);
  drawWrapped(x, y + 70, 320, g.body, FONT_SANS, 11, INK, 13);
  if (col < 2) vline(x + 324, y, 96, GREY_LT, 1);
}
hline(16, 780, 992, INK, 2);

// Bottom: map (left) + briefs (right, two columns)
drawText(16, 788, "WHERE IT HAPPENED", FONT_SANS_B, 16, RED);
drawMap(16, 806, 6);
drawText(16, 966, "Red numbers mark stories 1-12.", FONT_SANS, 10, INK);
drawText(16, 977, "Positions are approximate.", FONT_SANS, 10, INK);

drawText(360, 788, "ALSO ON THURSDAY 19 NOVEMBER — 22 MORE STORIES", FONT_SANS_B, 15, RED);
for (let i = 0; i < BRIEFS.length; i++) {
  const col = i < 11 ? 0 : 1;
  const row = i % 11;
  drawText(360 + col * 326, 810 + row * 13, BRIEFS[i], FONT_SANS, 10, INK);
}

// Footer
hline(16, 988, 992, INK, 1);
drawTextCentered(
  512, 991,
  "Every story happened, or was first reported, on Thursday 19 November 2026.",
  FONT_SANS, 10, INK
);
drawTextCentered(
  512, 1002,
  "Sources: Reuters, AP, AFP, BBC, The Hindu, IMD, NASA, ICJ. Original drawings.",
  FONT_SANS, 10, INK
);
// ---------------------------------------------------------------- write
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
mkdirSync(outDir, { recursive: true });
const png = encodePNG();
writeFileSync(outDir + "/entry.png", png);

