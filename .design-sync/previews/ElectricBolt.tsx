import React from 'react';
import { ElectricBolt, Colors } from 'macroleague';

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

/** Default 24px XP bolt as used inline in the app. */
export const Default = () => (
  <Chip>
    <ElectricBolt />
  </Chip>
);

/** Size sweep — frozen capture clock shows the resting frame (solid accent bolt, faint outline). */
export const Sizes = () => (
  <Chip>
    <ElectricBolt size={48} />
    <ElectricBolt size={64} />
    <ElectricBolt size={96} />
  </Chip>
);
