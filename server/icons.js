const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function renderIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const cx = size / 2, cy = size / 2, R = size * 0.46;
  const bg = [11, 13, 20, 255];
  const ring = [109, 94, 245, 255];
  const ringDark = [79, 70, 229, 255];
  const white = [255, 255, 255, 255];
  const set = (x, y, c) => {
    const i = (y * size + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3];
  };

  const inB = (x, y) => {
    const bx = cx - size * 0.17;
    const bw = size * 0.075;
    const byTop = cy - size * 0.235;
    const byBot = cy + size * 0.235;
    if (x >= bx && x <= bx + bw && y >= byTop && y <= byBot) return true;
    const r1 = size * 0.125, r2 = size * 0.155;
    const ax = bx + bw + size * 0.01;
    const y1 = byTop + r1, y2 = byBot - r2;
    const d1 = Math.hypot(x - ax, y - y1), d2 = Math.hypot(x - ax, y - y2);
    const t = bw * 0.62;
    if (d1 <= r1 && x >= bx + bw * 0.7) {
      if (d1 >= r1 - t && (y <= y1 - t * 0.2 || x >= ax - t * 0.2 || d1 <= r1 - t * 0.6)) {
        if (!(d1 < r1 - t && y > y1 + t * 0.1 && x < ax - t * 0.1)) return true;
      }
    }
    if (d2 <= r2 && x >= bx + bw * 0.7) {
      if (d2 >= r2 - t && (y >= y2 + t * 0.2 || x >= ax - t * 0.2 || d2 <= r2 - t * 0.6)) {
        if (!(d2 < r2 - t && y < y2 - t * 0.1 && x < ax - t * 0.1)) return true;
      }
    }
    return false;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let c = bg;
      if (d <= R) {
        const grad = (dx + dy) / (2 * R);
        c = grad > 0.15 ? ring : ringDark;
      }
      if (d > R - size * 0.03 && d <= R) c = [34, 211, 238, 255];
      if (c !== bg && inB(x, y)) c = white;
      set(x, y, c);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const dir = path.join(__dirname, '..', 'public', 'icons');

function ensureIcons() {
  fs.mkdirSync(dir, { recursive: true });
  for (const size of [192, 512, 180]) {
    const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
    const target = path.join(dir, name);
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, renderIcon(size));
      console.log('[icons] généré:', name);
    }
  }
}

module.exports = { ensureIcons, renderIcon };

if (require.main === module) {
  ensureIcons();
}
