import React from 'react';
import { LeaderboardRow, Colors } from 'macroleague';

const Stack = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 370, background: Colors.background, padding: 16, borderRadius: 12 }}>
    {children}
  </div>
);

export const TopThreePromotion = () => (
  <Stack>
    <LeaderboardRow rank={1} name="Sarah M." points={2840} streak={21} movement={0} zone="promotion" />
    <LeaderboardRow rank={2} name="Devon K." points={2615} streak={9} movement={2} zone="promotion" />
    <LeaderboardRow rank={3} name="Priya R." points={2590} streak={14} movement={-1} zone="promotion" />
  </Stack>
);

export const CurrentUserHighlight = () => (
  <Stack>
    <LeaderboardRow
      rank={5}
      name="Nityanth"
      points={2210}
      streak={11}
      movement={3}
      zone="safe"
      isCurrentUser
    />
  </Stack>
);

export const RivalWithBadge = () => (
  <Stack>
    <LeaderboardRow
      rank={4}
      name="Marcus T."
      points={2295}
      streak={7}
      movement={1}
      zone="safe"
      isRival
      badge="Your rival — 85 pts ahead"
    />
  </Stack>
);

export const RelegationZone = () => (
  <Stack>
    <LeaderboardRow rank={9} name="Jordan L." points={1140} streak={2} movement={-2} zone="relegation" />
    <LeaderboardRow rank={10} name="Emma W." points={980} streak={0} movement={-4} zone="relegation" />
  </Stack>
);

export const PressableRow = () => (
  <Stack>
    <LeaderboardRow
      rank={6}
      name="Aisha B."
      points={2050}
      streak={5}
      movement={0}
      zone="safe"
      onPress={() => {}}
    />
  </Stack>
);
