import React from 'react';
import { RankMovement, Colors, FontFamily } from 'macroleague';

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
    <span style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: Colors.textPrimary }}>{label}</span>
    {children}
  </div>
);

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center', width: 'fit-content', background: Colors.background, padding: 16, borderRadius: 12 }}>
    {children}
  </div>
);

export const Movements = () => (
  <Row>
    <Chip label="Climbed">
      <RankMovement movement={3} />
    </Chip>
    <Chip label="Dropped">
      <RankMovement movement={-2} />
    </Chip>
    <Chip label="Held">
      <RankMovement movement={0} />
    </Chip>
  </Row>
);

export const LeaderboardRows = () => (
  <div style={{ width: 280, background: Colors.surface, border: `1px solid ${Colors.border}`, borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
    {[
      { rank: 1, name: 'Priya S.', pts: 412, move: 2 },
      { rank: 2, name: 'Marcus T.', pts: 398, move: -1 },
      { rank: 3, name: 'Jordan K.', pts: 371, move: 0 },
      { rank: 4, name: 'Aiden R.', pts: 344, move: 5 },
    ].map((r) => (
      <div key={r.rank} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: FontFamily.displayBold, fontSize: 13, color: Colors.textSecondary, width: 16 }}>{r.rank}</span>
        <span style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: Colors.textPrimary, flex: 1 }}>{r.name}</span>
        <span style={{ fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary }}>{r.pts} pts</span>
        <RankMovement movement={r.move} />
      </div>
    ))}
  </div>
);

export const Sizes = () => (
  <Row>
    <Chip label="Small">
      <RankMovement movement={4} size={11} />
    </Chip>
    <Chip label="Default">
      <RankMovement movement={4} />
    </Chip>
    <Chip label="Large">
      <RankMovement movement={-4} size={18} />
    </Chip>
  </Row>
);
