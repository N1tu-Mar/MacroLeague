import React from 'react';
import { RivalCard, Colors } from 'macroleague';

const Stack = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 360, background: Colors.background, padding: 16, borderRadius: 12 }}>
    {children}
  </div>
);

export const CloseChaseWithAction = () => (
  <Stack>
    <RivalCard
      myName="Nityanth"
      myPoints={2210}
      rivalName="Marcus T."
      rivalPoints={2295}
      gap={85}
      suggestedAction="Log dinner tonight and hit your protein goal to close the gap — that's worth up to 120 pts."
    />
  </Stack>
);

export const FarBehind = () => (
  <Stack>
    <RivalCard
      myName="Nityanth"
      myPoints={1480}
      rivalName="Sarah M."
      rivalPoints={2840}
      gap={1360}
      suggestedAction="A 7-day logging streak plus daily macro goals would earn ~1,400 pts this week."
    />
  </Stack>
);

export const NearlyTiedNoAction = () => (
  <Stack>
    <RivalCard
      myName="Nityanth"
      myPoints={2288}
      rivalName="Priya R."
      rivalPoints={2295}
      gap={7}
    />
  </Stack>
);
