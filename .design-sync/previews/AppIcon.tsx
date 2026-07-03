import React from 'react';
import { AppIcon, Colors, FontFamily, FontSize } from 'macroleague';

type IconName = React.ComponentProps<typeof AppIcon>['name'];

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      background: Colors.background,
      padding: 16,
      borderRadius: 12,
      display: 'flex',
      gap: 14,
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      maxWidth: 480,
    }}
  >
    {children}
  </div>
);

const Cell = ({
  name,
  color,
  size = 22,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: 64 }}>
    <AppIcon name={name} size={size} color={color} />
    <div
      style={{
        fontFamily: FontFamily.bodyMedium,
        color: Colors.textTertiary,
        fontSize: FontSize.micro,
      }}
    >
      {name}
    </div>
  </div>
);

export const Navigation = () => (
  <Grid>
    <Cell name="home" />
    <Cell name="chart" />
    <Cell name="challenges" />
    <Cell name="league" />
    <Cell name="profile" />
    <Cell name="coach" />
    <Cell name="back" />
    <Cell name="chevron-right" />
    <Cell name="search" />
    <Cell name="bell" />
    <Cell name="plus" />
    <Cell name="edit" />
  </Grid>
);

export const FoodAndMeals = () => (
  <Grid>
    <Cell name="apple" />
    <Cell name="salad" />
    <Cell name="bowl" />
    <Cell name="meal" />
    <Cell name="meal-plan" />
    <Cell name="meal-goal" />
    <Cell name="coffee" />
    <Cell name="drink" />
    <Cell name="protein" />
    <Cell name="sunrise" />
    <Cell name="sun" />
    <Cell name="moon" />
  </Grid>
);

export const RewardsAndStatus = () => (
  <Grid>
    <Cell name="trophy" color={Colors.gold} />
    <Cell name="crown" color={Colors.gold} />
    <Cell name="medal" color={Colors.gold} />
    <Cell name="gem" color={Colors.primary} />
    <Cell name="star" color={Colors.gold} />
    <Cell name="sparkles" color={Colors.accent} />
    <Cell name="party" color={Colors.accent} />
    <Cell name="gift" />
    <Cell name="bolt" color={Colors.accent} />
    <Cell name="check" color={Colors.success} />
    <Cell name="warning" color={Colors.warning} />
    <Cell name="trend-up" color={Colors.success} />
    <Cell name="trend-down" color={Colors.error} />
    <Cell name="target" />
  </Grid>
);

export const SizesAndStroke = () => (
  <div
    style={{
      background: Colors.background,
      padding: 16,
      borderRadius: 12,
      display: 'flex',
      gap: 20,
      alignItems: 'flex-end',
    }}
  >
    <AppIcon name="league" size={16} color={Colors.textSecondary} />
    <AppIcon name="league" size={24} color={Colors.textPrimary} />
    <AppIcon name="league" size={32} color={Colors.gold} />
    <AppIcon name="league" size={44} color={Colors.gold} strokeWidth={1.5} />
    <AppIcon name="challenges" size={44} color={Colors.primary} strokeWidth={2.5} />
  </div>
);
