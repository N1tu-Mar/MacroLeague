import React from 'react';
import { MacroRing, Colors } from 'macroleague';

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', width: 'fit-content', background: Colors.background, padding: 16, borderRadius: 12 }}>
    {children}
  </div>
);

export const DailyMacros = () => (
  <Row>
    <MacroRing label="Protein" current={128} goal={150} />
    <MacroRing label="Carbs" current={96} goal={220} />
    <MacroRing label="Fat" current={54} goal={70} />
  </Row>
);

export const CustomColors = () => (
  <Row>
    <MacroRing label="Calories" current={1840} goal={2400} color={Colors.accent} />
    <MacroRing label="Fiber" current={22} goal={30} color={Colors.success} />
    <MacroRing label="Sugar" current={31} goal={40} color={Colors.gold} />
  </Row>
);

export const Sizes = () => (
  <Row>
    <MacroRing label="Protein" current={142} goal={150} size={56} strokeWidth={5} />
    <MacroRing label="Protein" current={142} goal={150} />
    <MacroRing label="Protein" current={142} goal={150} size={96} strokeWidth={8} />
  </Row>
);

export const GoalStates = () => (
  <Row>
    <MacroRing label="Starting" current={32} goal={150} />
    <MacroRing label="On track" current={112} goal={150} />
    <MacroRing label="Over goal" current={168} goal={150} />
    <MacroRing label="No goal" current={0} goal={0} />
  </Row>
);
