import React from 'react';
import {
  Apple,
  ArrowLeft,
  Bell,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  CircleGauge,
  Coffee,
  CookingPot,
  Crown,
  CupSoda,
  Dumbbell,
  Eye,
  EyeOff,
  Gem,
  Gift,
  Goal,
  GraduationCap,
  HandPlatter,
  Hourglass,
  House,
  Lightbulb,
  Medal,
  MessageCircle,
  Moon,
  PartyPopper,
  Pencil,
  Plus,
  Salad,
  Search,
  Send,
  Soup,
  Sparkles,
  Star,
  Sun,
  Sunrise,
  Swords,
  Target,
  ThumbsUp,
  TriangleAlert,
  Trophy,
  TrendingDown,
  TrendingUp,
  UserRound,
  UsersRound,
  Utensils,
  Zap,
} from 'lucide-react-native';
import { Colors } from '../../theme';

const ICONS = {
  apple: Apple,
  back: ArrowLeft,
  bell: Bell,
  calendar: CalendarDays,
  chart: ChartNoAxesColumnIncreasing,
  checkmark: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  check: CircleCheck,
  century: CircleGauge,
  coffee: Coffee,
  'meal-goal': CookingPot,
  crown: Crown,
  drink: CupSoda,
  protein: Dumbbell,
  eye: Eye,
  'eye-off': EyeOff,
  gem: Gem,
  gift: Gift,
  solo: Goal,
  school: GraduationCap,
  'meal-plan': HandPlatter,
  hourglass: Hourglass,
  home: House,
  idea: Lightbulb,
  medal: Medal,
  moon: Moon,
  party: PartyPopper,
  edit: Pencil,
  plus: Plus,
  salad: Salad,
  search: Search,
  bowl: Soup,
  sparkles: Sparkles,
  star: Star,
  sun: Sun,
  sunrise: Sunrise,
  challenges: Swords,
  target: Target,
  reaction: ThumbsUp,
  warning: TriangleAlert,
  league: Trophy,
  trophy: Trophy,
  'trend-down': TrendingDown,
  'trend-up': TrendingUp,
  profile: UserRound,
  users: UsersRound,
  coach: MessageCircle,
  meal: Utensils,
  send: Send,
  bolt: Zap,
} as const;

export type AppIconName = keyof typeof ICONS;

interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  accessibilityLabel?: string;
}

/** The app's single semantic vector-icon layer. PixelFlame is the game-art exception. */
export default function AppIcon({
  name,
  size = 20,
  color = Colors.textSecondary,
  strokeWidth = 2,
  accessibilityLabel,
}: AppIconProps) {
  const Icon = ICONS[name];
  return (
    <Icon
      accessibilityLabel={accessibilityLabel}
      color={color}
      size={size}
      strokeWidth={strokeWidth}
    />
  );
}
