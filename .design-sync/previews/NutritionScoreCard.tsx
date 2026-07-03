import React from 'react';
import { NutritionScoreCard, Colors } from 'macroleague';

const Panel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 340, background: Colors.surface, border: `1px solid ${Colors.border}`, borderRadius: 18, padding: 16 }}>
    {children}
  </div>
);

export const StrongDay = () => (
  <Panel>
    <NutritionScoreCard score={87} delta={6} status="Strong day" />
  </Panel>
);

export const SolidDay = () => (
  <Panel>
    <NutritionScoreCard score={68} delta={3} status="Solid pace" />
  </Panel>
);

export const NeedsWork = () => (
  <Panel>
    <NutritionScoreCard score={45} delta={-8} status="Falling behind" />
  </Panel>
);

export const RoughDay = () => (
  <Panel>
    <NutritionScoreCard score={28} delta={-15} status="Rough day" size={110} />
  </Panel>
);
