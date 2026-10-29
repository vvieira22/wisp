"use strict";

// ponytail: minimal zero-dep ISO/IEC 18004 QR Code generator (Byte mode, ECC-L, versions 1-6, up to 134 bytes).
const VERSIONS = [
  null,
  { size: 21, dataBytes: 19, ecBytes: 7, blocks: 1, align: [] },
  { size: 25, dataBytes: 34, ecBytes: 10, blocks: 1, align: [6, 18] },
  { size: 29, dataBytes: 55, ecBytes: 15, blocks: 1, align: [6, 22] },
  { size: 33, dataBytes: 80, ecBytes: 20, blocks: 1, align: [6, 26] },
  { size: 37, dataBytes: 108, ecBytes: 26, blocks: 1, align: [6, 30] },
  { size: 41, dataBytes: 136, ecBytes: 18, blocks: 2, align: [6, 34] },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree) {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

function pickVersion(byteLen) {
  for (let v = 1; v < VERSIONS.length; v++) {
    if (byteLen + 2 <= VERSIONS[v].dataBytes) return v;
  }
  throw new Error(`QR payload too long (${byteLen} bytes; max 134)`);
}

function encodeCodewords(bytes, spec) {
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  // Mode 0100 (Byte) + 8-bit length (versions 1-9)
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);
  const maxBits = spec.dataBytes * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const data = new Uint8Array(spec.dataBytes);
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    data[i] = b;
  }
  const padBytes = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < spec.dataBytes; i++, p ^= 1) {
    data[i] = padBytes[p];
  }

  if (spec.blocks === 1) {
    const ec = rsEncode(data, spec.ecBytes);
    const out = new Uint8Array(data.length + ec.length);
    out.set(data, 0);
    out.set(ec, data.length);
    return out;
  }

  const blockSize = spec.dataBytes / spec.blocks;
  const dataBlocks = [];
  const ecBlocks = [];
  for (let b = 0; b < spec.blocks; b++) {
    const slice = data.subarray(b * blockSize, (b + 1) * blockSize);
    dataBlocks.push(slice);
    ecBlocks.push(rsEncode(slice, spec.ecBytes));
  }
  const out = [];
  for (let i = 0; i < blockSize; i++) {
    for (let b = 0; b < spec.blocks; b++) out.push(dataBlocks[b][i]);
  }
  for (let i = 0; i < spec.ecBytes; i++) {
    for (let b = 0; b < spec.blocks; b++) out.push(ecBlocks[b][i]);
  }
  return Uint8Array.from(out);
}

function qrMatrix(text) {
  const bytes = Buffer.from(String(text || ""), "utf8");
  const ver = pickVersion(bytes.length);
  const spec = VERSIONS[ver];
  const size = spec.size;
  const grid = Array.from({ length: size }, () => new Array(size).fill(0));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  const setModule = (r, c, val) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    grid[r][c] = val ? 1 : 0;
    reserved[r][c] = true;
  };

  const placeFinder = (row, col) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const ring = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setModule(row + dr, col + dc, inside && (ring || core));
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Alignment patterns
  if (spec.align.length) {
    for (const r of spec.align) {
      for (const c of spec.align) {
        if (reserved[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            setModule(r + dr, c + dc, dark);
          }
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) setModule(6, i, i % 2 === 0);
    if (!reserved[i][6]) setModule(i, 6, i % 2 === 0);
  }

  // Reserve format info areas & dark module
  for (let i = 0; i < 9; i++) {
    if (!reserved[8][i]) reserved[8][i] = true;
    if (!reserved[i][8]) reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  setModule(size - 8, 8, 1);

  const codewords = encodeCodewords(bytes, spec);
  const bitLen = codewords.length * 8;
  let bitIdx = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (reserved[r][c]) continue;
        let bit = 0;
        if (bitIdx < bitLen) {
          bit = (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
          bitIdx++;
        }
        // Mask 0: (r + c) % 2 === 0
        if ((r + c) % 2 === 0) bit ^= 1;
        grid[r][c] = bit;
      }
    }
    upward = !upward;
  }

  // Format bits for ECC Level L (01) + Mask 0 (000) -> 0x77c4 (111011111000100)
  const formatBits = 0x77c4;
  const fBit = (i) => (formatBits >> (14 - i)) & 1;
  const tlCols = [0, 1, 2, 3, 4, 5, 7, 8];
  for (let i = 0; i < 8; i++) grid[8][tlCols[i]] = fBit(i);
  const tlRows = [7, 5, 4, 3, 2, 1, 0];
  for (let i = 0; i < 7; i++) grid[tlRows[i]][8] = fBit(8 + i);
  for (let i = 0; i < 7; i++) grid[size - 1 - i][8] = fBit(i);
  for (let i = 0; i < 8; i++) grid[8][size - 8 + i] = fBit(7 + i);

  return grid;
}

function qrSvg(text, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const pad = Number.isFinite(o.pad) ? Math.max(1, Math.round(o.pad)) : 2;
  const mat = qrMatrix(text);
  const n = mat.length;
  const total = n + pad * 2;
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (mat[r][c]) {
        d += `M${c + pad},${r + pad}h1v1h-1z`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="${total}" height="${total}" fill="#ffffff"/><path d="${d}" fill="#16141c"/></svg>`;
}

const qrApi = { qrMatrix, qrSvg };
if (typeof module === "object" && module.exports) module.exports = qrApi;
if (typeof document === "object") Object.assign(globalThis, qrApi);
