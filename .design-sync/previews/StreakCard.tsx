import React from 'react';
import { StreakCard, Colors } from 'macroleague';

const Stack = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 360, background: Colors.background, padding: 16, borderRadius: 12 }}>
    {children}
  </div>
);

export const ApproachingMilestone = () => (
  <Stack>
    <StreakCard streakCount={9} nextMilestone={14} />
  </Stack>
);

export const MilestoneReached = () => (
  <Stack>
    <StreakCard streakCount={14} nextMilestone={14} />
  </Stack>
);

export const LongStreakNoMilestone = () => (
  <Stack>
    <StreakCard streakCount={32} />
  </Stack>
);
