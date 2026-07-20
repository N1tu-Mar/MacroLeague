import { encodeQr, qrToSvgPath, reedSolomonEncode } from '../qr';

describe('reedSolomonEncode', () => {
  /**
   * The canonical worked example from the QR spec tutorials: the version 1-M
   * data codewords for "HELLO WORLD" and their ten error-correction
   * codewords. This is the one test that proves the GF(256) arithmetic and the
   * generator polynomial are right — everything else in the encoder is layout.
   */
  it('matches the known version 1-M vector', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    const expected = [196, 35, 39, 119, 235, 215, 231, 226, 93, 23];
    expect(reedSolomonEncode(data, 10)).toEqual(expected);
  });

  it('returns exactly the requested number of EC codewords', () => {
    expect(reedSolomonEncode([1, 2, 3], 26)).toHaveLength(26);
    expect(reedSolomonEncode([1, 2, 3], 18)).toHaveLength(18);
  });

  it('produces all-zero EC for all-zero data, as GF(256) requires', () => {
    expect(reedSolomonEncode(new Array(16).fill(0), 10)).toEqual(new Array(10).fill(0));
  });

  it('is sensitive to a single-bit change anywhere in the data', () => {
    const a = reedSolomonEncode([1, 2, 3, 4, 5], 10);
    const b = reedSolomonEncode([1, 2, 3, 4, 6], 10);
    expect(a).not.toEqual(b);
  });
});

describe('encodeQr version selection', () => {
  it('uses the smallest version that fits the payload', () => {
    // Version 1 at level M holds 16 data codewords; 12 bits of header leaves
    // room for 14 payload bytes.
    expect(encodeQr('A'.repeat(14)).version).toBe(1);
    expect(encodeQr('A'.repeat(15)).version).toBe(2);
  });

  it('encodes a 12-character redemption code in the smallest version', () => {
    const matrix = encodeQr('ABCDEFGHJKLM');
    expect(matrix.version).toBe(1);
    expect(matrix.size).toBe(21);
  });

  it('sizes the matrix as 17 + 4 * version', () => {
    for (const text of ['A'.repeat(14), 'A'.repeat(15), 'A'.repeat(60)]) {
      const m = encodeQr(text);
      expect(m.size).toBe(17 + 4 * m.version);
    }
  });

  it('throws rather than silently emitting an unscannable code when too large', () => {
    expect(() => encodeQr('A'.repeat(214))).toThrow(/exceeds version 10/);
  });

  it('counts UTF-8 bytes, not characters', () => {
    // Each emoji is four UTF-8 bytes, so four of them will not fit where
    // sixteen ASCII characters would.
    expect(encodeQr('😀'.repeat(4)).version).toBe(2);
  });
});

describe('encodeQr structure', () => {
  const matrix = encodeQr('ABCDEFGHJKLM');
  const { modules, size } = matrix;

  it('draws the finder pattern ring in all three corners', () => {
    const corners: [number, number][] = [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ];
    for (const [r0, c0] of corners) {
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          expect(modules[r0 + dy][c0 + dx]).toBe(ring !== 2);
        }
      }
    }
  });

  it('leaves the separator around each finder light', () => {
    for (let i = 0; i < 8; i++) {
      expect(modules[7][i]).toBe(false);
      expect(modules[i][7]).toBe(false);
    }
  });

  it('alternates the timing patterns between the finders', () => {
    for (let i = 8; i < size - 8; i++) {
      expect(modules[6][i]).toBe(i % 2 === 0);
      expect(modules[i][6]).toBe(i % 2 === 0);
    }
  });

  it('sets the always-dark module', () => {
    expect(modules[size - 8][8]).toBe(true);
  });

  it('chooses a mask in range', () => {
    expect(matrix.mask).toBeGreaterThanOrEqual(0);
    expect(matrix.mask).toBeLessThan(8);
  });

  it('is not blank and not saturated — masking balances the module ratio', () => {
    const dark = modules.flat().filter(Boolean).length;
    const ratio = dark / (size * size);
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.7);
  });
});

describe('encodeQr format information', () => {
  /**
   * The 15-bit format strings for EC level M from the spec's table. Reading
   * them back out of the matrix proves both the BCH computation and that the
   * two redundant copies were placed in the right modules.
   */
  const FORMAT_M: Record<number, string> = {
    0: '101010000010010',
    1: '101000100100101',
    2: '101111001111100',
    3: '101101101001011',
    4: '100010111111001',
    5: '100000011001110',
    6: '100111110010111',
    7: '100101010100000',
  };

  it('writes the spec format string for the chosen mask into both copies', () => {
    const { modules, size, mask } = encodeQr('ABCDEFGHJKLM');
    const expected = FORMAT_M[mask];

    // First copy: bit i of the format string, LSB-first around the top-left.
    const firstCopy: boolean[] = [];
    for (let i = 0; i <= 5; i++) firstCopy.push(modules[i][8]);
    firstCopy.push(modules[7][8], modules[8][8], modules[8][7]);
    for (let i = 9; i < 15; i++) firstCopy.push(modules[8][14 - i]);

    // Second copy: split between the other two finders.
    const secondCopy: boolean[] = [];
    for (let i = 0; i < 8; i++) secondCopy.push(modules[8][size - 1 - i]);
    for (let i = 8; i < 15; i++) secondCopy.push(modules[size - 15 + i][8]);

    // `expected` is written MSB-first; the placement above is LSB-first.
    const asBits = expected.split('').reverse().map((c) => c === '1');
    expect(firstCopy).toEqual(asBits);
    expect(secondCopy).toEqual(asBits);
  });
});

describe('encodeQr determinism', () => {
  it('produces identical output for identical input', () => {
    expect(encodeQr('ABCDEFGHJKLM').modules).toEqual(encodeQr('ABCDEFGHJKLM').modules);
  });

  it('produces different output for different codes', () => {
    expect(encodeQr('ABCDEFGHJKLM').modules).not.toEqual(encodeQr('ABCDEFGHJKLN').modules);
  });
});

describe('qrToSvgPath', () => {
  const matrix = encodeQr('ABCDEFGHJKLM');

  it('emits one subpath per dark module', () => {
    const dark = matrix.modules.flat().filter(Boolean).length;
    expect(qrToSvgPath(matrix).split('M').length - 1).toBe(dark);
  });

  it('scales every subpath by the module size', () => {
    const path = qrToSvgPath(matrix, 4);
    expect(path).toContain('h4v4h-4z');
    expect(path).not.toContain('h1v1h-1z');
  });

  it('places the first dark module at the origin, since the finder starts there', () => {
    expect(qrToSvgPath(matrix)).toMatch(/^M0 0h1v1h-1z/);
  });
});
