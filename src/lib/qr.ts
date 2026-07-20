/**
 * A minimal, dependency-free QR Code encoder.
 *
 * WHY this exists rather than an npm package: the reward pass needs a REAL
 * scannable code (the screen previously drew a decorative glyph), the repo
 * already ships react-native-svg to render one, and adding a QR dependency for
 * ~200 lines of well-specified arithmetic is not a trade worth making. The
 * output here is a plain boolean matrix — no rendering, no React, no native
 * modules — so it is pure, testable under jest's 'node' environment, and the
 * SVG component is a thin map over it.
 *
 * SCOPE (deliberately narrow, sized to the payload it serves):
 *   * Byte mode only. A redemption code is 12 chars from a 32-symbol alphabet;
 *     alphanumeric mode would pack it tighter but byte mode also handles a URL
 *     payload if passes ever become deep links, for one branch instead of two.
 *   * Error-correction level M (~15% recovery). L would fit more data, but a
 *     pass is scanned off a phone screen that may be smudged, dim, or angled;
 *     M is the usual choice for that and still leaves ample room.
 *   * Versions 1-10 (up to 213 data bytes at level M). Beyond that the module
 *     size on a phone-sized pass gets too small to scan reliably anyway, so
 *     exceeding it throws rather than silently producing an unscannable code.
 *
 * Implements ISO/IEC 18004: GF(256) Reed-Solomon with primitive polynomial
 * 0x11D, the eight standard data masks scored by the four penalty rules, and
 * BCH-computed format/version information.
 */

// ---------------------------------------------------------------------------
// Capacity tables (error-correction level M only).
// ---------------------------------------------------------------------------

/**
 * Per version (index = version - 1): EC codewords per block, then the block
 * layout as [count, dataCodewordsPerBlock] groups. Versions 8+ use two groups
 * whose block lengths differ by one, which is why the second group exists.
 */
const EC_BLOCKS_M: { ecPerBlock: number; groups: [number, number][] }[] = [
  { ecPerBlock: 10, groups: [[1, 16]] }, // v1
  { ecPerBlock: 16, groups: [[1, 28]] }, // v2
  { ecPerBlock: 26, groups: [[1, 44]] }, // v3
  { ecPerBlock: 18, groups: [[2, 32]] }, // v4
  { ecPerBlock: 24, groups: [[2, 43]] }, // v5
  { ecPerBlock: 16, groups: [[4, 27]] }, // v6
  { ecPerBlock: 18, groups: [[4, 31]] }, // v7
  { ecPerBlock: 22, groups: [[2, 38], [2, 39]] }, // v8
  { ecPerBlock: 22, groups: [[3, 36], [2, 37]] }, // v9
  { ecPerBlock: 26, groups: [[4, 43], [1, 44]] }, // v10
];

/** Alignment-pattern centre coordinates per version (index = version - 1). */
const ALIGNMENT_CENTERS: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

const MAX_VERSION = EC_BLOCKS_M.length;

/** Total data codewords available at level M for a version. */
function dataCapacity(version: number): number {
  const { groups } = EC_BLOCKS_M[version - 1];
  return groups.reduce((sum, [count, len]) => sum + count * len, 0);
}

// ---------------------------------------------------------------------------
// GF(256) arithmetic for Reed-Solomon.
// ---------------------------------------------------------------------------

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function buildGaloisTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    // Multiply by the generator (2), reducing modulo the primitive polynomial.
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  // Duplicate the table so multiplication can index without a modulo.
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** Reed-Solomon generator polynomial of the given degree. */
function generatorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** The EC codewords for one data block. */
export function reedSolomonEncode(data: number[], ecLength: number): number[] {
  const gen = generatorPoly(ecLength);
  const remainder = new Array<number>(ecLength).fill(0);

  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let i = 0; i < ecLength; i++) {
      remainder[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return remainder;
}

// ---------------------------------------------------------------------------
// Bit stream -> interleaved codewords.
// ---------------------------------------------------------------------------

/** Smallest version whose level-M capacity holds the payload, or throw. */
function chooseVersion(byteLength: number): number {
  for (let version = 1; version <= MAX_VERSION; version++) {
    // 4 bits mode + 8 bits length (versions 1-9) or 16 bits (10+) + payload.
    const headerBits = 4 + (version >= 10 ? 16 : 8);
    if (dataCapacity(version) * 8 >= headerBits + byteLength * 8) return version;
  }
  throw new Error(
    `QR payload of ${byteLength} bytes exceeds version ${MAX_VERSION} capacity at EC level M`,
  );
}

/** UTF-8 encodes a string without depending on TextEncoder availability. */
function toUtf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) as number;
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return bytes;
}

/** Builds the padded data codewords for a payload at a chosen version. */
function buildDataCodewords(payload: number[], version: number): number[] {
  const capacityBits = dataCapacity(version) * 8;
  const lengthBits = version >= 10 ? 16 : 8;

  const bits: number[] = [];
  const push = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(payload.length, lengthBits);
  for (const byte of payload) push(byte, 8);

  // Terminator: up to four zero bits, truncated if capacity is nearly full.
  const terminator = Math.min(4, capacityBits - bits.length);
  push(0, terminator);
  // Pad to a byte boundary, then alternate the two spec-defined pad bytes.
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  const padBytes = [0xec, 0x11];
  for (let i = 0; codewords.length < dataCapacity(version); i++) {
    codewords.push(padBytes[i % 2]);
  }
  return codewords;
}

/** Splits into blocks, computes EC per block, and interleaves both halves. */
function interleaveCodewords(dataCodewords: number[], version: number): number[] {
  const { ecPerBlock, groups } = EC_BLOCKS_M[version - 1];

  const dataBlocks: number[][] = [];
  let offset = 0;
  for (const [count, len] of groups) {
    for (let i = 0; i < count; i++) {
      dataBlocks.push(dataCodewords.slice(offset, offset + len));
      offset += len;
    }
  }
  const ecBlocks = dataBlocks.map((block) => reedSolomonEncode(block, ecPerBlock));

  const result: number[] = [];
  // Data is interleaved column-wise; the final group's blocks are one longer,
  // so shorter blocks simply contribute nothing at the last index.
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) if (i < block.length) result.push(block[i]);
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of ecBlocks) result.push(block[i]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Matrix construction.
// ---------------------------------------------------------------------------

type Grid = { modules: boolean[][]; reserved: boolean[][]; size: number };

function newGrid(size: number): Grid {
  return {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

/** Sets a function-pattern module (col, row), marking it off-limits to data. */
function setFunction(grid: Grid, col: number, row: number, dark: boolean) {
  if (row < 0 || row >= grid.size || col < 0 || col >= grid.size) return;
  grid.modules[row][col] = dark;
  grid.reserved[row][col] = true;
}

function drawFinder(grid: Grid, col: number, row: number) {
  // 7x7 finder plus its one-module separator, drawn as a 9x9 sweep whose
  // out-of-bounds edge is discarded by setFunction.
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const dist = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      setFunction(grid, col + dx, row + dy, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignment(grid: Grid, col: number, row: number) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFunction(grid, col + dx, row + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function drawFunctionPatterns(grid: Grid, version: number) {
  const { size } = grid;

  // Timing patterns run the full width/height; finders overwrite their ends.
  for (let i = 0; i < size; i++) {
    setFunction(grid, 6, i, i % 2 === 0);
    setFunction(grid, i, 6, i % 2 === 0);
  }

  drawFinder(grid, 0, 0);
  drawFinder(grid, size - 7, 0);
  drawFinder(grid, 0, size - 7);

  // Alignment patterns at every centre pair except the three that would
  // collide with a finder.
  const centers = ALIGNMENT_CENTERS[version - 1];
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      const skip =
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0);
      if (!skip) drawAlignment(grid, centers[i], centers[j]);
    }
  }

  // Reserve the format-information strips (filled in after masking). Index 6
  // is skipped in both: (8,6) and (6,8) belong to the timing patterns drawn
  // above, and the format placement below routes around them for that reason.
  // Blanking them here would erase two timing modules and break alignment.
  for (let i = 0; i <= 8; i++) {
    if (i === 6) continue;
    setFunction(grid, 8, i, false);
    setFunction(grid, i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    setFunction(grid, size - 1 - i, 8, false);
    setFunction(grid, 8, size - 1 - i, false);
  }

  // Version information (versions 7+ only), then the always-dark module.
  if (version >= 7) {
    const bits = versionInformationBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(grid, a, b, bit);
      setFunction(grid, b, a, bit);
    }
  }
  setFunction(grid, 8, size - 8, true);
}

/** BCH(18,6) version information. */
function versionInformationBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

/** BCH(15,5) format information for EC level M (0b00) and a mask index. */
function formatInformationBits(mask: number): number {
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function drawFormatInformation(grid: Grid, mask: number) {
  const bits = formatInformationBits(mask);
  const { size } = grid;
  const bit = (i: number) => ((bits >> i) & 1) === 1;

  // First copy: around the top-left finder.
  for (let i = 0; i <= 5; i++) setFunction(grid, 8, i, bit(i));
  setFunction(grid, 8, 7, bit(6));
  setFunction(grid, 8, 8, bit(7));
  setFunction(grid, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFunction(grid, 14 - i, 8, bit(i));

  // Second copy: split between the other two finders, for redundancy.
  for (let i = 0; i < 8; i++) setFunction(grid, size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFunction(grid, 8, size - 15 + i, bit(i));
}

/** Lays codewords into the zigzag data region, skipping function modules. */
function drawCodewords(grid: Grid, codewords: number[]) {
  const { size } = grid;
  let bitIndex = 0;
  const totalBits = codewords.length * 8;

  for (let right = size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern; the pairing shifts past it.
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (!grid.reserved[row][col] && bitIndex < totalBits) {
          grid.modules[row][col] = ((codewords[bitIndex >>> 3] >> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex++;
        }
      }
    }
  }
}

/** The eight standard data-mask predicates. */
function maskPredicate(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return ((((row + col) % 2) + ((row * col) % 3)) % 2) === 0;
  }
}

function applyMask(grid: Grid, mask: number) {
  for (let row = 0; row < grid.size; row++) {
    for (let col = 0; col < grid.size; col++) {
      if (!grid.reserved[row][col] && maskPredicate(mask, row, col)) {
        grid.modules[row][col] = !grid.modules[row][col];
      }
    }
  }
}

/**
 * The four penalty rules. The mask with the lowest total wins — this is what
 * keeps a code free of large same-colour blobs and of patterns a scanner would
 * mistake for a finder.
 */
function penaltyScore(grid: Grid): number {
  const { size, modules } = grid;
  let score = 0;

  // Rule 1: runs of five or more same-colour modules in a row or column.
  const scoreLine = (get: (i: number) => boolean) => {
    let runColor = get(0);
    let runLength = 1;
    for (let i = 1; i < size; i++) {
      const c = get(i);
      if (c === runColor) {
        runLength++;
        if (runLength === 5) score += 3;
        else if (runLength > 5) score += 1;
      } else {
        runColor = c;
        runLength = 1;
      }
    }
  };
  for (let i = 0; i < size; i++) {
    scoreLine((j) => modules[i][j]);
    scoreLine((j) => modules[j][i]);
  }

  // Rule 2: every 2x2 block of a single colour.
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const c = modules[row][col];
      if (c === modules[row][col + 1] && c === modules[row + 1][col] && c === modules[row + 1][col + 1]) {
        score += 3;
      }
    }
  }

  // Rule 3: the 1:1:3:1:1 finder-like pattern with four light modules beside it.
  const pattern = [true, false, true, true, true, false, true];
  const matchesAt = (get: (i: number) => boolean, start: number): boolean => {
    for (let i = 0; i < 7; i++) if (get(start + i) !== pattern[i]) return false;
    return true;
  };
  const clearRun = (get: (i: number) => boolean, start: number, len: number): boolean => {
    for (let i = 0; i < len; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= size) continue; // the quiet zone counts as light
      if (get(idx)) return false;
    }
    return true;
  };
  for (let i = 0; i < size; i++) {
    const rowGet = (j: number) => modules[i][j];
    const colGet = (j: number) => modules[j][i];
    for (const get of [rowGet, colGet]) {
      for (let start = 0; start <= size - 7; start++) {
        if (matchesAt(get, start) && (clearRun(get, start - 4, 4) || clearRun(get, start + 7, 4))) {
          score += 40;
        }
      }
    }
  }

  // Rule 4: deviation of the dark-module ratio from 50%.
  let dark = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) if (modules[row][col]) dark++;
  }
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

export interface QrMatrix {
  /** Row-major modules; true = dark. Square, `size` on a side. */
  modules: boolean[][];
  size: number;
  version: number;
  /** The mask index chosen by penalty scoring, useful in tests. */
  mask: number;
}

/**
 * Encodes text as a QR Code at EC level M, choosing the smallest version that
 * fits and the lowest-penalty mask. Throws if the payload exceeds version 10.
 */
export function encodeQr(text: string): QrMatrix {
  const payload = toUtf8Bytes(text);
  const version = chooseVersion(payload.length);
  const size = 17 + 4 * version;
  const codewords = interleaveCodewords(buildDataCodewords(payload, version), version);

  let best: { grid: Grid; mask: number; score: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const grid = newGrid(size);
    drawFunctionPatterns(grid, version);
    drawCodewords(grid, codewords);
    applyMask(grid, mask);
    drawFormatInformation(grid, mask);

    const score = penaltyScore(grid);
    if (best === null || score < best.score) best = { grid, mask, score };
  }

  const chosen = best as { grid: Grid; mask: number; score: number };
  return { modules: chosen.grid.modules, size, version, mask: chosen.mask };
}

/**
 * Collapses a matrix into a single SVG path `d` string of filled squares — one
 * path renders far more cheaply in react-native-svg than hundreds of <Rect>
 * elements, which matters on the pass sheet where the code animates in.
 */
export function qrToSvgPath(matrix: QrMatrix, moduleSize = 1): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (matrix.modules[row][col]) {
        parts.push(`M${col * moduleSize} ${row * moduleSize}h${moduleSize}v${moduleSize}h-${moduleSize}z`);
      }
    }
  }
  return parts.join('');
}
