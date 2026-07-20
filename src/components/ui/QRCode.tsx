import React, { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { encodeQr, qrToSvgPath } from '../../lib/qr';

interface QRCodeProps {
  /** The payload to encode. For a reward pass this is the raw (undashed) code. */
  value: string;
  /** Rendered width/height in points, including the quiet zone. */
  size?: number;
  /** Dark module colour. */
  color?: string;
  /** Light background; also fills the quiet zone. */
  backgroundColor?: string;
  /**
   * Quiet-zone width in MODULES (not points). The spec calls for 4; scanners
   * need the light border to lock onto the finder patterns, so this should not
   * be reduced below 2 even when space is tight.
   */
  quietZone?: number;
}

/**
 * Renders a real, scannable QR Code from the pure encoder in src/lib/qr.ts.
 *
 * The matrix is drawn as ONE <Path> of filled unit squares rather than a grid
 * of <Rect> elements: a version-2 code is 625 modules, and 625 native views is
 * a visible cost on a sheet that animates in, whereas one path is a single
 * node. The viewBox is expressed in module units so the caller's `size` scales
 * everything without any per-module arithmetic here.
 */
export default function QRCode({
  value,
  size = 200,
  color = '#000000',
  backgroundColor = '#FFFFFF',
  quietZone = 4,
}: QRCodeProps) {
  // Encoding is pure and deterministic but not free (eight masks are built and
  // penalty-scored), so it is memoized on the inputs that can change it.
  const encoded = useMemo(() => {
    try {
      return encodeQr(value);
    } catch {
      // A payload too large for version 10 is a programming error, not a user
      // one. Render nothing rather than crashing the pass sheet — the code is
      // always shown as text beside the QR, so the member can still be served.
      return null;
    }
  }, [value]);

  if (!encoded) return null;

  const total = encoded.size + quietZone * 2;
  const path = qrToSvgPath(encoded, 1);

  return (
    // The viewBox origin is offset by -quietZone so the matrix can be drawn at
    // the origin in plain module units and the quiet zone falls out of the
    // coordinate system for free — no transform node, no per-module offset.
    <Svg width={size} height={size} viewBox={`${-quietZone} ${-quietZone} ${total} ${total}`}>
      <Rect
        x={-quietZone}
        y={-quietZone}
        width={total}
        height={total}
        fill={backgroundColor}
      />
      <Path d={path} fill={color} />
    </Svg>
  );
}
