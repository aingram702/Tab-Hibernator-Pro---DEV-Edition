#!/usr/bin/env node
// Generates branded PNG icons for Tab Hibernator Pro — DEV Edition.
// Pure Node (zlib only). Renders a high-res master and box-downsamples
// to each target size for clean anti-aliasing.
//
//   node tools/gen-icons.mjs
//
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'icons');

// ---- tiny PNG encoder (RGBA, 8-bit) --------------------------------------
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- vector-ish rendering helpers ----------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
// distance from point p to segment ab
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const t = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy || 1), 0, 1);
  const cx = ax + t * vx, cy = ay + t * vy;
  return Math.hypot(px - cx, py - cy);
}
// rounded-box signed distance (half-extent 1, corner radius r), point in [-1,1]
function roundedBoxSD(px, py, r) {
  const qx = Math.abs(px) - (1 - r);
  const qy = Math.abs(py) - (1 - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

// palette
const BG_TOP = [17, 24, 39];     // #111827
const BG_BOT = [8, 11, 18];      // #080b12
const NEON   = [10, 255, 156];   // #0aff9c
const NEON_D = [0, 200, 120];

// snowflake geometry (freeze / hibernate motif) in normalized space
const R = 0.66;
const spokes = [];
for (let k = 0; k < 6; k++) {
  const a = (Math.PI / 3) * k - Math.PI / 2;
  spokes.push([Math.cos(a), Math.sin(a)]);
}

function snowflakeDist(px, py) {
  let d = 1e9;
  for (const [dx, dy] of spokes) {
    // main spoke
    d = Math.min(d, segDist(px, py, 0, 0, dx * R, dy * R));
    // two pairs of branches
    for (const at of [0.42, 0.72]) {
      const bx = dx * R * at, by = dy * R * at;
      const bl = R * 0.26;
      // perpendicular-ish branches at ±60°
      for (const sign of [1, -1]) {
        const ang = Math.atan2(dy, dx) + sign * (Math.PI / 3);
        const ex = bx + Math.cos(ang) * bl;
        const ey = by + Math.sin(ang) * bl;
        d = Math.min(d, segDist(px, py, bx, by, ex, ey));
      }
    }
  }
  return d;
}

function renderMaster(N) {
  const buf = Buffer.alloc(N * N * 4);
  const strokeW = 0.052;
  const glowW = 0.16;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // map to [-1,1] with slight padding
      const px = ((x + 0.5) / N) * 2 - 1;
      const py = ((y + 0.5) / N) * 2 - 1;
      const pad = 1.06;
      const bx = px * pad, by = py * pad;

      const sd = roundedBoxSD(bx, by, 0.42);
      const inside = smoothstep(0.02, -0.02, sd); // 1 inside
      if (inside <= 0) { continue; } // transparent

      // background vertical gradient
      const gt = clamp((py + 1) / 2, 0, 1);
      let r = mix(BG_TOP[0], BG_BOT[0], gt);
      let g = mix(BG_TOP[1], BG_BOT[1], gt);
      let b = mix(BG_TOP[2], BG_BOT[2], gt);

      // subtle inner neon border
      const border = smoothstep(0.09, 0.03, Math.abs(sd + 0.06));
      if (border > 0) {
        const bt = border * 0.5;
        r = mix(r, NEON_D[0], bt);
        g = mix(g, NEON_D[1], bt);
        b = mix(b, NEON_D[2], bt);
      }

      // snowflake glyph
      const fd = snowflakeDist(px, py);
      const glow = smoothstep(glowW, 0.0, fd) * 0.55;
      if (glow > 0) {
        r = mix(r, NEON[0], glow * 0.6);
        g = mix(g, NEON[1], glow * 0.6);
        b = mix(b, NEON[2], glow * 0.6);
      }
      const line = smoothstep(strokeW, strokeW - 0.03, fd);
      if (line > 0) {
        r = mix(r, NEON[0], line);
        g = mix(g, NEON[1], line);
        b = mix(b, NEON[2], line);
      }
      // center node
      const cd = Math.hypot(px, py);
      const node = smoothstep(0.11, 0.07, cd);
      if (node > 0) {
        r = mix(r, NEON[0], node);
        g = mix(g, NEON[1], node);
        b = mix(b, NEON[2], node);
      }

      const a = clamp(inside, 0, 1) * 255;
      const i = (y * N + x) * 4;
      buf[i] = clamp(Math.round(r), 0, 255);
      buf[i + 1] = clamp(Math.round(g), 0, 255);
      buf[i + 2] = clamp(Math.round(b), 0, 255);
      buf[i + 3] = clamp(Math.round(a), 0, 255);
    }
  }
  return buf;
}

function downsample(master, M, N) {
  // box filter M(master) -> N(target), M multiple of N ideally
  const out = Buffer.alloc(N * N * 4);
  const s = M / N;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let r = 0, g = 0, b = 0, a = 0, cnt = 0;
      const y0 = Math.floor(y * s), y1 = Math.floor((y + 1) * s);
      const x0 = Math.floor(x * s), x1 = Math.floor((x + 1) * s);
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * M + xx) * 4;
          const al = master[i + 3] / 255;
          r += master[i] * al; g += master[i + 1] * al; b += master[i + 2] * al;
          a += master[i + 3]; cnt++;
        }
      }
      const o = (y * N + x) * 4;
      const asum = a / (cnt || 1);
      const anorm = asum / 255 || 1;
      out[o] = Math.round(r / (cnt || 1) / anorm);
      out[o + 1] = Math.round(g / (cnt || 1) / anorm);
      out[o + 2] = Math.round(b / (cnt || 1) / anorm);
      out[o + 3] = Math.round(asum);
    }
  }
  return out;
}

mkdirSync(OUT, { recursive: true });
const MASTER = 1024;
const master = renderMaster(MASTER);
for (const size of [16, 32, 48, 128]) {
  const px = downsample(master, MASTER, size);
  const png = encodePNG(size, size, px);
  writeFileSync(join(OUT, `icon${size}.png`), png);
  console.log(`wrote icons/icon${size}.png (${png.length} bytes)`);
}
console.log('done.');
