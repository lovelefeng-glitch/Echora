// 生成 Echora 16x16 托盘图标 (PNG)
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const W = 16, H = 16;

// 构建原始像素数据（RGBA，每行一个 filter byte）
const rawSize = H * (1 + W * 4);
const raw = Buffer.alloc(rawSize);
let offset = 0;
for (let y = 0; y < H; y++) {
  raw[offset++] = 0; // filter: none
  for (let x = 0; x < W; x++) {
    const cx = 8, cy = 8, r = 6;
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    if (dist <= r) {
      raw[offset++] = 31;   // R
      raw[offset++] = 111;  // G
      raw[offset++] = 235;  // B
      raw[offset++] = 255;  // A
    } else {
      raw[offset++] = 0;
      raw[offset++] = 0;
      raw[offset++] = 0;
      raw[offset++] = 0;
    }
  }
}

// 压缩
const deflated = zlib.deflateSync(raw);

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function mkChunk(type, data) {
  const d = data || Buffer.alloc(0);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(d.length, 0);
  const head = Buffer.concat([len, Buffer.from(type)]);
  const body = Buffer.concat([head, d]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([body, crc]);
}

// PNG 头
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([sig, mkChunk('IHDR', ihdr), mkChunk('IDAT', deflated), mkChunk('IEND')]);

const outPath = path.join(__dirname, '..', 'assets', 'icon.png');
fs.writeFileSync(outPath, png);
console.log('Generated icon: ' + outPath + ' (' + png.length + ' bytes, ' + W + 'x' + H + ')');