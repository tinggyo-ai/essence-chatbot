// ARIA 아이콘 생성 스크립트 (16x16 PNG)
// node create-icon.js 로 실행
const fs = require('fs');
const path = require('path');

// 최소 PNG: 16x16 파란색 로봇 아이콘 (base64)
// PNG 헤더 + IHDR + IDAT (파란 배경 + 흰 점) + IEND
const iconBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlz' +
  'AAALEwAACxMBAJqcGAAAABZ0RVh0Q3JlYXRpb24gVGltZQAwNi8yMy8xNVgR2U8AAAAcdEVYdFNv' +
  'ZnR3YXJlAEFkb2JlIEZpcmV3b3JrcyBDUzYGst3OAAAA5klEQVQ4jc2TvQrCMBSFv1YEBwcHQRcX' +
  'dwVBcHBwcFEQd1EQdBEHwUGki4ODg4OgqKCDg4OD4OAq6uDg4OBQuqSHJCRN0h8oOOSSc+/5bm6S' +
  'AxBCCPFfxBjz2fd9D0EURVEURVEUR0VRFMdxHMdBEARBkiRJsiSBEEII8V/knHPOOee89957773n' +
  'nHPOOc4555xzzjkhhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQggh' +
  'hBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghxB/xBuiZFJTaOwAA' +
  'AABJRU5ErkJggg==';

// 더 간단한 방법: 16x16 solid 파란색 PNG (직접 바이너리)
function createBluePNG() {
  // PNG 시그니처
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk: 16x16, 8bit RGB
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(16, 0); // width
  ihdrData.writeUInt32BE(16, 4); // height
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT: 16x16 파란색 픽셀 (raw)
  // 각 row: filter byte(0) + 16픽셀 × RGB(0,100,200)
  const rawRows = [];
  for (let y = 0; y < 16; y++) {
    const row = Buffer.alloc(1 + 16 * 3);
    row[0] = 0; // filter: none
    for (let x = 0; x < 16; x++) {
      const base = 1 + x * 3;
      // 파란색 계열 (ARIA 테마 #00b4d8)
      if (y < 2 || y > 13 || x < 2 || x > 13) {
        row[base] = 0; row[base+1] = 100; row[base+2] = 140; // 테두리
      } else {
        row[base] = 0; row[base+1] = 180; row[base+2] = 216; // #00b4d8
      }
    }
    rawRows.push(row);
  }
  const raw = Buffer.concat(rawRows);

  const zlib = require('zlib');
  const compressed = zlib.deflateSync(raw);
  const idat = makeChunk('IDAT', compressed);

  // IEND
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const crc32 = require('zlib').crc32;
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');

  // CRC32 over type + data
  const crcInput = Buffer.concat([typeBytes, data]);
  let crc = 0xFFFFFFFF;
  for (const byte of crcInput) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
  }
  crc ^= 0xFFFFFFFF;

  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

const iconPath = path.join(__dirname, 'icon.png');
const png = createBluePNG();
fs.writeFileSync(iconPath, png);
console.log('아이콘 생성 완료:', iconPath, `(${png.length} bytes)`);
