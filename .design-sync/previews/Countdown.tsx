import React from 'react';
import { Countdown, Colors, FontFamily } from 'macroleague';

// The capture harness freezes the clock, so targets are computed relative to
// Date.now() to always show a plausible remaining time.
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

const Chip = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: Colors.surfaceElevated,
      border: `1px solid ${Colors.border}`,
      borderRadius: 10,
      padding: '8px 12px',
    }}
  >
    <span style={{ fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary }}>{label}</span>
    {children}
  </div>
);

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start', width: 'fit-content', background: Colors.background, padding: 16, borderRadius: 12 }}>
    {children}
  </div>
);

const countdownStyle = { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: Colors.textPrimary } as const;

export const TimeScales = () => (
  <Row>
    <Chip label="Gameweek ends">
      <Countdown to={iso(3 * DAY + 7 * HOUR)} style={countdownStyle} />
    </Chip>
    <Chip label="Daily log closes">
      <Countdown to={iso(5 * HOUR + 24 * 60 * 1000)} style={countdownStyle} />
    </Chip>
    <Chip label="Challenge">
      <Countdown to={iso(42 * 60 * 1000)} style={countdownStyle} />
    </Chip>
  </Row>
);

export const Urgent = () => (
  <Row>
    <Chip label="Protein sprint">
      <Countdown to={iso(90 * 60 * 1000)} style={{ ...countdownStyle, color: Colors.accent }} />
    </Chip>
  </Row>
);

export const Ended = () => (
  <Row>
    <Chip label="Gameweek 8">
      <Countdown to={iso(-2 * HOUR)} style={{ ...countdownStyle, color: Colors.textSecondary }} />
    </Chip>
    <Chip label="Dining hall bonus">
      <Countdown to={iso(-1 * DAY)} endedLabel="Challenge ended" style={{ ...countdownStyle, color: Colors.textSecondary }} />
    </Chip>
  </Row>
);
