import React from 'react';
import { ClashingUtensils, Colors } from 'macroleague';

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

/** Default 26px rendering as used inline in the app. */
export const Default = () => (
  <Chip>
    <ClashingUtensils />
  </Chip>
);

/** Size sweep — capture clock is frozen, so blades show the rest pose (slightly crossed). */
export const Sizes = () => (
  <Chip>
    <ClashingUtensils size={48} />
    <ClashingUtensils size={64} />
    <ClashingUtensils size={96} />
  </Chip>
);
