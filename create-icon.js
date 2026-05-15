// Essence 아이콘 생성 — 설치 시 자동 실행됨
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

function makePngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const crcInput  = Buffer.concat([typeBytes, data]);
  let crc = 0xFFFFFFFF;
  for (const b of crcInput) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  crc ^= 0xFFFFFFFF;
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc >>> 0);
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

function buildPng(size) {
  const BG_R = 13, BG_G = 13, BG_B = 30;
  const CN_R = 0,  CN_G = 180, CN_B = 216;
  const cx = size / 2, cy = size / 2;
  const r  = size / 2 - size * 0.04;
  const borderW = Math.max(2, size * 0.06);

  // Simple 5x7 "A" glyph
  const glyph = [
    [0,1,1,0,0],
    [1,0,0,1,0],
    [1,0,0,1,0],
    [1,1,1,1,0],
    [1,0,0,1,0],
    [1,0,0,1,0],
    [1,0,0,1,0],
  ];
  const fScale = size * 0.48 / 7;
  const gW = Math.round(5 * fScale), gH = Math.round(7 * fScale);
  const gX = Math.round((size - gW) / 2), gY = Math.round((size - gH) / 2) - Math.round(size * 0.04);

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const base = 1 + x * 4;
      if (dist > r + 0.5) {
        // transparent
      } else if (dist > r - borderW) {
        const alpha = dist > r - 0.5 ? Math.round(255 * (r + 0.5 - dist)) : 255;
        row[base]=CN_R; row[base+1]=CN_G; row[base+2]=CN_B; row[base+3]=alpha;
      } else {
        row[base]=BG_R; row[base+1]=BG_G; row[base+2]=BG_B; row[base+3]=255;
      }
    }
    // Draw "A" glyph
    const ly = y - gY;
    if (ly >= 0 && ly < gH) {
      const glyphRow = glyph[Math.floor(ly / fScale)];
      if (glyphRow) {
        for (let gx = 0; gx < gW; gx++) {
          if (!glyphRow[Math.floor(gx / fScale)]) continue;
          const ix = gX + gx;
          if (ix < 0 || ix >= size) continue;
          const dx2 = ix - cx + 0.5, dy2 = y - cy + 0.5;
          if (Math.sqrt(dx2*dx2+dy2*dy2) > r - borderW) continue;
          const b2 = 1 + ix * 4;
          row[b2]=CN_R; row[b2+1]=CN_G; row[b2+2]=CN_B; row[b2+3]=255;
        }
      }
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8]=8; ihdr[9]=6; // RGBA
  const idat = zlib.deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildIco(sizes) {
  const pngs = sizes.map(s => buildPng(s));
  const dirs = [];
  let offset = 6 + 16 * pngs.length;
  for (let i = 0; i < pngs.length; i++) {
    const dim = sizes[i] === 256 ? 0 : sizes[i];
    const d = Buffer.alloc(16);
    d[0]=dim; d[1]=dim; d.writeUInt16LE(1,4); d.writeUInt16LE(32,6);
    d.writeUInt32LE(pngs[i].length, 8); d.writeUInt32LE(offset, 12);
    dirs.push(d); offset += pngs[i].length;
  }
  const hdr = Buffer.alloc(6);
  hdr.writeUInt16LE(1, 2); hdr.writeUInt16LE(pngs.length, 4);
  return Buffer.concat([hdr, ...dirs, ...pngs]);
}

const dir     = __dirname;
const png32   = buildPng(32);
const icoData = buildIco([256, 48, 32, 16]);

fs.writeFileSync(path.join(dir, 'icon.png'), png32);
fs.writeFileSync(path.join(dir, 'icon.ico'), icoData);
console.log('아이콘 생성 완료 — icon.png:', png32.length, 'bytes / icon.ico:', icoData.length, 'bytes');
