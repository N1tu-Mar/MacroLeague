import React from 'react';
import { StreakFlame, Colors, FontFamily, FontSize } from 'macroleague';

const Row = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      background: Colors.background,
      padding: 20,
      borderRadius: 12,
      display: 'flex',
      gap: 28,
      alignItems: 'center',
      flexWrap: 'wrap',
    }}
  >
    {children}
  </div>
);

const Labeled = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
    {children}
    <div
      style={{
        fontFamily: FontFamily.bodySemiBold,
        color: Colors.textTertiary,
        fontSize: FontSize.meta,
      }}
    >
      {label}
    </div>
  </div>
);

export const Small = () => (
  <Row>
    <Labeled label="Day 1">
      <StreakFlame count={1} />
    </Labeled>
    <Labeled label="Building">
      <StreakFlame count={4} />
    </Labeled>
    {/* count >= 7 switches the number to the orange accent */}
    <Labeled label="On fire (7+)">
      <StreakFlame count={7} />
    </Labeled>
    <Labeled label="Semester-long">
      <StreakFlame count={32} />
    </Labeled>
  </Row>
);

export const Large = () => (
  <Row>
    <Labeled label="Profile hero — 12-day streak">
      <StreakFlame count={12} size="large" />
    </Labeled>
    <Labeled label="Below accent threshold">
      <StreakFlame count={5} size="large" />
    </Labeled>
  </Row>
);
