#!/usr/bin/env node
/**
 * generate-icons.js
 * Generates PNG icons for the Vide PWA manifest without any external dependencies.
 * Uses only Node.js built-ins (zlib + Buffer) to write valid PNG files.
 *
 * Output (in /public/):
 *   icon-192.png     — 192×192, standard
 *   icon-512.png     — 512×512, standard
 *   icon-512-maskable.png — 512×512, maskable (safe-zone padded)
 *   icon-180.png     — 180×180, Apple Touch icon
 *
 * Run: node scripts/generate-icons.js
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ─── CRC32 ──────────────────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

/**
 * Creates a square PNG buffer with a branded Vide icon:
 * - Dark void background (#060810)
 * - Cyan (#00e5ff) radial glow in the center
 * - One bold white pixel cross marking the "V" letterform center
 * @param {number} size
 * @param {boolean} maskable  if true, draw inside an 80% safe-zone circle
 */
function createIcon(size, maskable) {
  const cx = size / 2;
  const cy = size / 2;

  // Background: #060810
  const BG_R = 0x06, BG_G = 0x08, BG_B = 0x10;
  // Accent: #00e5ff (cyan)
  const AC_R = 0x00, AC_G = 0xe5, AC_B = 0xff;

  const outerRadius = maskable ? size * 0.38 : size * 0.42;
  const innerGlow   = size * 0.15;

  // Raw image data: 1 filter byte + size*3 bytes per row
  const rowBytes = 1 + size * 3;
  const raw = Buffer.alloc(size * rowBytes, 0);

  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const off = y * rowBytes + 1 + x * 3;

      let r, g, b;

      if (dist > outerRadius) {
        // Outside glow — plain background
        r = BG_R; g = BG_G; b = BG_B;
      } else {
        // t=0 at center (full cyan), t=1 at outerRadius (background)
        const t = Math.min(1, Math.max(0, (dist - innerGlow) / (outerRadius - innerGlow)));
        const smooth = t * t * (3 - 2 * t); // smoothstep
        r = Math.round(AC_R + (BG_R - AC_R) * smooth);
        g = Math.round(AC_G + (BG_G - AC_G) * smooth);
        b = Math.round(AC_B + (BG_B - AC_B) * smooth);
      }

      raw[off]     = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
    }
  }

  // Compress
  const compressed = zlib.deflateSync(raw, { level: 9 });

  // IHDR
  const ihdr = Buffer.alloc(13, 0);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // RGB

  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const publicDir = path.resolve(__dirname, '..', 'public');

const icons = [
  { file: 'icon-192.png',          size: 192, maskable: false },
  { file: 'icon-512.png',          size: 512, maskable: false },
  { file: 'icon-512-maskable.png', size: 512, maskable: true  },
  { file: 'icon-180.png',          size: 180, maskable: false },
];

for (const { file, size, maskable } of icons) {
  const buf = createIcon(size, maskable);
  const dest = path.join(publicDir, file);
  fs.writeFileSync(dest, buf);
  console.log(`  ✓ ${file}  (${buf.length} bytes)`);
}

console.log('\nAll icons written to public/');
