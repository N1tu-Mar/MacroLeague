import React from 'react';
import { ChallengeCard, Colors } from 'macroleague';

const Stack = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 360, background: Colors.background, padding: 16, borderRadius: 12 }}>
    {children}
  </div>
);

// Relative to the viewer's clock so the active card always reads like a real
// week-long challenge ("6d 11h left") instead of drifting stale.
const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

export const ActiveSolo = () => (
  <Stack>
    <ChallengeCard
      name="Protein Week"
      type="solo"
      stakesText="Loser buys smoothies"
      endDate={inDays(6)}
      status="active"
      participantCount={6}
      joined
    />
  </Stack>
);

export const UpcomingTeam = () => (
  <Stack>
    <ChallengeCard
      name="Dorm vs Dorm: Clean Bulk"
      type="team"
      stakesText="Bragging rights"
      endDate={inDays(14)}
      status="upcoming"
      participantCount={12}
      joined={false}
    />
  </Stack>
);

export const CompletedJoined = () => (
  <Stack>
    <ChallengeCard
      name="30-Day Consistency"
      type="solo"
      stakesText="Winner picks the dining hall"
      endDate="2020-01-01"
      status="completed"
      participantCount={4}
      joined
    />
  </Stack>
);
