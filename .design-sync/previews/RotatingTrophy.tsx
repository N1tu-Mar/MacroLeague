import React from 'react';
import { RotatingTrophy, Colors } from 'macroleague';

const Chip = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      background: Colors.surface,
      border: `1px solid ${Colors.border}`,
      borderRadius: 18,
      padding: 24,
      display: 'flex',
      gap: 24,
      alignItems: 'center',
    }}
  >
    {children}
  </div>
);

/** Size sweep — frozen capture clock shows the front-facing (0deg) frame. */
export const Sizes = () => (
  <Chip>
    <RotatingTrophy size={48} />
    <RotatingTrophy size={64} />
    <RotatingTrophy size={96} />
  </Chip>
);

/** Color prop variants: gold (default), silver, accent orange, success green. */
export const ColorVariants = () => (
  <Chip>
    <RotatingTrophy size={64} />
    <RotatingTrophy size={64} color="#C9D0D8" />
    <RotatingTrophy size={64} color={Colors.accent} />
    <RotatingTrophy size={64} color={Colors.success} />
  </Chip>
);
