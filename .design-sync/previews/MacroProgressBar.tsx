import React from 'react';
import { MacroProgressBar, Colors } from 'macroleague';

const Panel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 340, background: Colors.surface, border: `1px solid ${Colors.border}`, borderRadius: 18, padding: 16 }}>
    {children}
  </div>
);

export const DailyMacros = () => (
  <Panel>
    <MacroProgressBar label="Protein" current={96} target={150} />
    <MacroProgressBar label="Carbs" current={180} target={220} />
    <MacroProgressBar label="Fat" current={38} target={70} />
  </Panel>
);

export const GoalMet = () => (
  <Panel>
    <MacroProgressBar label="Protein" current={152} target={150} />
  </Panel>
);

export const CaloriesCustomColor = () => (
  <Panel>
    <MacroProgressBar label="Calories" current={1830} target={2400} unit=" kcal" color={Colors.accent} />
  </Panel>
);

export const WithNote = () => (
  <Panel>
    <MacroProgressBar label="Fiber" current={0} target={30} note="Not tracked yet" />
  </Panel>
);
