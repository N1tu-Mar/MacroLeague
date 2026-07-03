import React from 'react';
import { PixelFlame, Colors } from 'macroleague';

const Chip = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      background: Colors.surface,
      border: `1px solid ${Colors.border}`,
      borderRadius: 18,
      padding: 24,
      display: 'flex',
      gap: 24,
      alignItems: 'flex-end',
    }}
  >
    {children}
  </div>
);

/** Static frame (animated defaults to false) across a size sweep. */
export const Sizes = () => (
  <Chip>
    <PixelFlame size={32} />
    <PixelFlame size={48} />
    <PixelFlame size={72} />
    <PixelFlame size={96} />
  </Chip>
);

/** Animated variant — the capture clock is frozen, so this shows frame 0 of the loop. */
export const Animated = () => (
  <Chip>
    <PixelFlame size={64} animated />
    <PixelFlame size={96} animated />
  </Chip>
);
