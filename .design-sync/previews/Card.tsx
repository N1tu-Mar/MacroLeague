import React from 'react';
import { Card, Colors, FontFamily, FontSize, Spacing } from 'macroleague';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      background: Colors.background,
      padding: 16,
      borderRadius: 12,
      width: 340,
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}
  >
    {children}
  </div>
);

const title: React.CSSProperties = {
  fontFamily: FontFamily.displayBold,
  color: Colors.textPrimary,
  fontSize: FontSize.subhead,
};
const body: React.CSSProperties = {
  fontFamily: FontFamily.body,
  color: Colors.textSecondary,
  fontSize: FontSize.body,
  marginTop: 4,
};
const meta: React.CSSProperties = {
  fontFamily: FontFamily.bodySemiBold,
  color: Colors.textTertiary,
  fontSize: FontSize.meta,
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
};

export const Default = () => (
  <Frame>
    <Card>
      <div style={meta}>Today</div>
      <div style={title}>Lunch logged at Bruff Commons</div>
      <div style={body}>Grilled chicken bowl — 42g protein, 610 kcal. Nice hit on your protein goal.</div>
    </Card>
  </Frame>
);

export const Elevated = () => (
  <Frame>
    <Card variant="elevated">
      <div style={meta}>Weekly recap</div>
      <div style={title}>You out-logged 8 of 11 league rivals</div>
      <div style={body}>5 of 7 days on target. One more clean day locks in a promotion-zone finish.</div>
    </Card>
  </Frame>
);

export const Hero = () => (
  <Frame>
    <Card variant="hero">
      <div style={meta}>Nutrition score</div>
      <div style={{ fontFamily: FontFamily.displayBold, color: Colors.textPrimary, fontSize: FontSize.display }}>
        87
      </div>
      <div style={body}>Top of Dorm League West this week. Keep the streak alive through finals.</div>
    </Card>
  </Frame>
);

export const AccentBorder = () => (
  <Frame>
    <Card accent={Colors.gold}>
      <div style={{ ...meta, color: Colors.gold }}>1st place</div>
      <div style={title}>Maya took the crown</div>
      <div style={body}>Gold-accent border marks the league leader's card.</div>
    </Card>
    <Card accent={Colors.success}>
      <div style={{ ...meta, color: Colors.success }}>Promotion zone</div>
      <div style={title}>2 days to hold your spot</div>
      <div style={body}>Green accent for promotion-zone standing.</div>
    </Card>
  </Frame>
);

export const Unpadded = () => (
  <Frame>
    <Card padded={false}>
      <div
        style={{
          padding: Spacing.base,
          borderBottom: `1px solid ${Colors.border}`,
        }}
      >
        <div style={title}>Dining hall hours</div>
      </div>
      <div style={{ padding: Spacing.base }}>
        <div style={body}>padded=false lets list-style content own its edges — header row above sits flush.</div>
      </div>
    </Card>
  </Frame>
);
