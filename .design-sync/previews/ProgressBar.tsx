import React from 'react';
import { ProgressBar, Colors } from 'macroleague';

const Stack = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 280, background: Colors.background, padding: 16, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
    {children}
  </div>
);

export const FillLevels = () => (
  <Stack>
    <ProgressBar progress={0.15} />
    <ProgressBar progress={0.55} />
    <ProgressBar progress={0.85} />
    <ProgressBar progress={1} />
  </Stack>
);

export const SemanticColors = () => (
  <Stack>
    <ProgressBar progress={0.92} color={Colors.success} />
    <ProgressBar progress={0.6} color={Colors.accent} />
    <ProgressBar progress={0.35} color={Colors.error} />
    <ProgressBar progress={0.75} color={Colors.gold} />
  </Stack>
);

export const Heights = () => (
  <Stack>
    <ProgressBar progress={0.7} height={4} />
    <ProgressBar progress={0.7} height={10} />
    <ProgressBar progress={0.7} height={16} />
  </Stack>
);

export const StaticNoAnimation = () => (
  <Stack>
    <ProgressBar progress={0.45} animated={false} />
  </Stack>
);
