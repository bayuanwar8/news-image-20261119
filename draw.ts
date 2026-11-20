// draw.ts — RGB canvas, shapes, text (via font.ts). Fresh code.
import { rasterize, measure, type Font } from "./font.ts";

export type RGB = [number, number, number];

export class Canvas {
  readonly W: number;
  readonly H: number;
  readonly buf: Uint8Array;
  constructor(w: number, h: number, bg: RGB) {
    this.W = w; this.H = h;
    this.buf = new Uint8Array(w * h * 3);
    this.fill(bg);
  }
  fill(c: RGB): void {
    for (let i = 0; i < this.buf.length; i += 3) {
      this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2];
    }
  }
  px(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = (y * this.W + x) * 3;
    this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2];
  }
  blend(x: number, y: number, c: RGB, a: number): void {
    if (a <= 0 || x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = (y * this.W + x) * 3;
    const ia = 1 - a;
    this.buf[i] = Math.round(c[0] * a + this.buf[i] * ia);
    this.buf[i + 1] = Math.round(c[1] * a + this.buf[i + 1] * ia);
    this.buf[i + 2] = Math.round(c[2] * a + this.buf[i + 2] * ia);
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.W, Math.round(x + w)), y1 = Math.min(this.H, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      let i = (yy * this.W + x0) * 3;
      for (let xx = x0; xx < x1; xx++) {
        this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2]; i += 3;
      }
    }
  }
  hline(x: number, y: number, w: number, c: RGB): void { this.rect(x, y, w, 1, c); }
  vline(x: number, y: number, h: number, c: RGB): void { this.rect(x, y, 1, h, c); }
  strokeRect(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, w = 1): void {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.max(Math.abs(dx), Math.abs(dy));
    const steps = Math.max(1, Math.ceil(len * 2));
    const r = w / 2;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = x0 + dx * t, cy = y0 + dy * t;
      this.rect(cx - r, cy - r, w, w, c);
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.H - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      const hw = Math.sqrt(Math.max(0, r * r - dy * dy));
      const xa = Math.max(x0, Math.ceil(cx - hw)), xb = Math.min(x1, Math.floor(cx + hw));
      for (let x = xa; x <= xb; x++) this.px(x, y, c);
    }
  }
  ring(cx: number, cy: number, r: number, c: RGB, t = 2): void {
    for (let k = 0; k < t; k++) {
      const rr = r - k;
      const steps = Math.max(24, Math.floor(2 * Math.PI * rr));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        this.px(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), c);
      }
    }
  }
  poly(pts: [number, number][], c: RGB): void {
    if (pts.length < 3) return;
    let yMin = Infinity, yMax = -Infinity;
    for (const [, y] of pts) { if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
    const xs: number[] = [];
    for (let y = Math.max(0, Math.floor(yMin)); y <= Math.min(this.H - 1, Math.ceil(yMax)); y++) {
      const yc = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= yc && yc < y1) || (y1 <= yc && yc < y0)) {
          xs.push(x0 + (yc - y0) * (x1 - x0) / (y1 - y0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k])), xb = Math.min(this.W - 1, Math.floor(xs[k + 1]));
        for (let x = xa; x <= xb; x++) this.px(x, y, c);
      }
    }
  }
  // ---- text ----
  textWidth(font: Font, size: number, text: string): number {
    return measure(font, size, text);
  }
  text(font: Font, size: number, x: number, baselineY: number, text: string, c: RGB, align: "l" | "c" | "r" = "l"): void {
    let pen = x;
    if (align === "c") pen = x - measure(font, size, text) / 2;
    else if (align === "r") pen = x - measure(font, size, text);
    for (const ch of text) {
      const cp = ch.codePointAt(0) as number;
      const g = rasterize(font, size, cp);
      if (g && g.w > 0) {
        const gx = Math.round(pen) + g.dx;
        const gy = Math.round(baselineY) + g.dy;
        for (let py = 0; py < g.h; py++) {
          for (let px = 0; px < g.w; px++) {
            const a = g.alpha[py * g.w + px];
            if (a) this.blend(gx + px, gy + py, c, a / 255);
          }
        }
      }
      pen += g ? g.adv : 0;
    }
  }
  wrap(font: Font, size: number, text: string, maxW: number): string[] {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const trial = cur ? cur + " " + w : w;
      if (measure(font, size, trial) <= maxW) { cur = trial; continue; }
      if (cur) lines.push(cur);
      // long word: split by characters
      let piece = "";
      for (const ch of w) {
        if (measure(font, size, piece + ch) <= maxW) piece += ch;
        else { if (piece) lines.push(piece); piece = ch; }
      }
      cur = piece;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }
  para(font: Font, size: number, x: number, y: number, text: string, maxW: number, lh: number, c: RGB, maxLines = 99): number {
    const lines = this.wrap(font, size, text, maxW).slice(0, maxLines);
    for (let i = 0; i < lines.length; i++) {
      this.text(font, size, x, y + Math.round(size * 0.8) + i * lh, lines[i], c);
    }
    return lines.length * lh;
  }
}
