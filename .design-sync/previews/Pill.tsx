import React from 'react';
import { Pill, Colors } from 'macroleague';

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', background: Colors.background, padding: 16, borderRadius: 12 }}>
    {children}
  </div>
);

export const Default = () => (
  <Row>
    <Pill label="7 DAY STREAK" />
  </Row>
);

export const SemanticColors = () => (
  <Row>
    <Pill label="GOAL MET" color={Colors.success} />
    <Pill label="1ST PLACE" color={Colors.gold} />
    <Pill label="ON FIRE" color={Colors.accent} />
    <Pill label="MISSED GOAL" color={Colors.error} />
    <Pill label="LEAGUE" color={Colors.primary} />
  </Row>
);

export const Filled = () => (
  <Row>
    <Pill label="PROMOTION ZONE" color={Colors.promotion} filled />
    <Pill label="RELEGATION ZONE" color={Colors.relegation} filled />
    <Pill label="CHAMPION" color={Colors.gold} filled />
  </Row>
);

export const WithIcon = () => (
  <Row>
    <Pill label="12 DAY STREAK" color={Colors.accent} icon="🔥" />
    <Pill label="RIVAL" color={Colors.error} icon="⚔️" />
  </Row>
);
