import React from 'react';
import { ActivityFeedItem, Colors } from 'macroleague';

const Stack = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 360, background: Colors.background, padding: 16, borderRadius: 12 }}>
    {children}
  </div>
);

export const StreakMilestone = () => (
  <Stack>
    <ActivityFeedItem
      name="Sarah M."
      icon="streak"
      text="Sarah M. hit a 12-day logging streak"
      minutesAgo={14}
      reactions={5}
    />
  </Stack>
);

export const MealLoggedNoReactions = () => (
  <Stack>
    <ActivityFeedItem
      name="Devon K."
      icon="meal"
      text="Devon K. logged a Grilled Chicken Bowl at Busch Dining Hall"
      minutesAgo={42}
    />
  </Stack>
);

export const ChallengeWonHoursAgo = () => (
  <Stack>
    <ActivityFeedItem
      name="Priya R."
      icon="trophy"
      text="Priya R. won the Protein Week challenge with 2,140 pts"
      minutesAgo={310}
      reactions={12}
    />
  </Stack>
);

export const RankJumpDaysAgo = () => (
  <Stack>
    <ActivityFeedItem
      name="Marcus T."
      icon="trend-up"
      text="Marcus T. climbed 3 spots into the promotion zone of Silver League"
      minutesAgo={2980}
      reactions={2}
    />
  </Stack>
);
