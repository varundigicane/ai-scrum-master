/**
 * Generates the two PNG icons the Teams app package requires, at the exact sizes Teams
 * validates: color.png 192x192 and outline.png 32x32 (transparent, white only).
 *
 * Dependency-free so it can run anywhere: node teams/make-icons.mjs
 * Replace the generated files with real brand artwork whenever you have it.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = dirname(fileURLToPath(import.meta.url));

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** pixels: (x, y) => [r, g, b, a] */
function writePng(path, size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const raw = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0; // filter type: none
    offset += 1;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixels(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
      offset += 4;
    }
  }

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  writeFileSync(path, png);
  console.log(`wrote ${path} (${size}x${size}, ${png.length} bytes)`);
}

const TEAL = [20, 184, 166];
const WHITE = [255, 255, 255];

function insideRoundedSquare(x, y, size, radius) {
  const min = radius;
  const max = size - 1 - radius;
  const cx = Math.min(Math.max(x, min), max);
  const cy = Math.min(Math.max(y, min), max);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

/** Three descending bars: a backlog burning down. */
function onBars(x, y, size) {
  const unit = size / 16;
  const bars = [
    { top: 4, height: 1.4, width: 8 },
    { top: 7, height: 1.4, width: 6 },
    { top: 10, height: 1.4, width: 4 },
  ];
  return bars.some(
    (bar) =>
      y >= bar.top * unit &&
      y < (bar.top + bar.height) * unit &&
      x >= 4 * unit &&
      x < (4 + bar.width) * unit,
  );
}

writePng(join(OUT_DIR, "color.png"), 192, (x, y) => {
  if (!insideRoundedSquare(x, y, 192, 34)) return [0, 0, 0, 0];
  if (onBars(x, y, 192)) return [...WHITE, 255];
  return [...TEAL, 255];
});

// Outline icons must be transparent with white content only.
writePng(join(OUT_DIR, "outline.png"), 32, (x, y) =>
  onBars(x, y, 32) ? [...WHITE, 255] : [0, 0, 0, 0],
);
