// Design-system entry point. Not imported by the app runtime (Expo boots from
// the root index.ts) — this is the export surface for the web design-system
// build (.design-sync/build-web-dist.mjs), which bundles these components via
// react-native-web for claude.ai/design.

export { default as ActivityFeedItem } from './components/ActivityFeedItem';
export { default as ChallengeCard } from './components/ChallengeCard';
export { default as FloatingXP } from './components/FloatingXP';
export { default as FoodLogItem } from './components/FoodLogItem';
export { default as LeaderboardRow } from './components/LeaderboardRow';
export { default as MacroProgressBar } from './components/MacroProgressBar';
export { default as MacroRing } from './components/MacroRing';
export { default as NutritionScoreCard } from './components/NutritionScoreCard';
export { default as PixelFlame } from './components/PixelFlame';
export { default as RivalCard } from './components/RivalCard';
export { default as StreakCard } from './components/StreakCard';
export { default as StreakFlame } from './components/StreakFlame';

export { default as AppIcon } from './components/ui/AppIcon';
export { default as Avatar } from './components/ui/Avatar';
export { default as Card } from './components/ui/Card';
export { default as Countdown } from './components/ui/Countdown';
export { default as Pill } from './components/ui/Pill';
export { default as ProgressBar } from './components/ui/ProgressBar';
export { default as RankMovement } from './components/ui/RankMovement';

export { default as ClashingUtensils } from './components/animations/ClashingUtensils';
export { default as ElectricBolt } from './components/animations/ElectricBolt';
export { default as RotatingTrophy } from './components/animations/RotatingTrophy';

// Theme tokens — exported so design-time glue code can use the exact values.
export { Colors, alpha, FontFamily, FontSize, Spacing, Radius, Shadow, Motion } from './theme';
