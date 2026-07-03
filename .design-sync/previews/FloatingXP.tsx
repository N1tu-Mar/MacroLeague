import React from 'react';
import { FloatingXP, Colors, FontFamily, FontSize } from 'macroleague';

/**
 * FloatingXP is a position:absolute "+N XP" toast that floats up over the
 * screen after logging a meal. Each stage lives in a relatively-positioned
 * dark frame so the absolute text has an anchor. Note: the animation's
 * resting state fades to opacity 0 (it self-dismisses), so if the capture
 * settles animations at their final state the text may not be visible.
 */
const Stage = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div
    style={{
      position: 'relative',
      width: 220,
      height: 170,
      background: Colors.background,
      border: `1px solid ${Colors.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
    }}
  >
    {children}
    <div
      style={{
        fontFamily: FontFamily.bodySemiBold,
        color: Colors.textTertiary,
        fontSize: FontSize.meta,
        padding: 10,
      }}
    >
      {label}
    </div>
  </div>
);

export const MealLogged = () => (
  <Stage label="Logged lunch → +25 XP">
    <FloatingXP amount={25} visible animated={false} />
  </Stage>
);

export const BigBonus = () => (
  <Stage label="7-day streak bonus → +150 XP">
    <FloatingXP amount={150} visible animated={false} />
  </Stage>
);

export const HiddenState = () => (
  <Stage label="visible=false → renders nothing (frame only)">
    <FloatingXP amount={25} visible={false} />
  </Stage>
);
