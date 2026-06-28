import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  FlatList,
  ViewToken,
} from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Colors, FontFamily } from '../../theme';
import AppIcon, { AppIconName } from '../../components/ui/AppIcon';

const { width, height } = Dimensions.get('window');

interface Slide {
  id: string;
  icon: AppIconName;
  iconColor: string;
  iconBg: string;
  headline: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    id: 'welcome',
    icon: 'sparkles',
    iconColor: Colors.gold,
    iconBg: `${Colors.gold}20`,
    headline: 'Welcome to MacroLeague',
    body: "You're joining a league of athletes who take their nutrition seriously. Track your meals, earn rewards, and compete with friends — all in one place.",
  },
  {
    id: 'log',
    icon: 'meal',
    iconColor: Colors.success,
    iconBg: `${Colors.success}20`,
    headline: 'Log What You Eat',
    body: 'Just describe your meal in plain English — "chicken, rice, and broccoli" — and we\'ll instantly calculate your calories, protein, carbs, fat, and micronutrients using the USDA nutrition database.',
  },
  {
    id: 'xp',
    icon: 'bolt',
    iconColor: Colors.accent,
    iconBg: `${Colors.accent}20`,
    headline: 'Every Meal Earns XP',
    body: 'Each meal you log earns XP and League Points. Build a daily logging streak to multiply your score. The more consistent you are, the faster you level up.',
  },
  {
    id: 'compete',
    icon: 'challenges',
    iconColor: Colors.primary,
    iconBg: `${Colors.primary}20`,
    headline: 'Compete in Challenges',
    body: 'Join weekly challenges with teammates. Your nutrition consistency determines your score — the best eaters climb the leaderboard and earn league status.',
  },
  {
    id: 'rewards',
    icon: 'gift',
    iconColor: Colors.gold,
    iconBg: `${Colors.gold}20`,
    headline: 'Win Real Rewards',
    body: 'Redeem your League Points for food discounts, merch, and exclusive perks. Eat well, score points, and unlock rewards that actually matter.',
  },
];

// ─── Individual slide ─────────────────────────────────────────────────────────

function SlideView({ slide }: { slide: Slide }) {
  return (
    <View style={slide_s.container}>
      <Animated.View entering={FadeIn.duration(400)} style={[slide_s.iconCircle, { backgroundColor: slide.iconBg }]}>
        <AppIcon name={slide.icon} size={52} color={slide.iconColor} />
      </Animated.View>
      <Text style={slide_s.headline}>{slide.headline}</Text>
      <Text style={slide_s.body}>{slide.body}</Text>
    </View>
  );
}

const slide_s = StyleSheet.create({
  container: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 24,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  headline: {
    fontFamily: FontFamily.displayBold,
    fontSize: 30,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.3,
    lineHeight: 36,
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
  },
});

// ─── Page dots ────────────────────────────────────────────────────────────────

function PageDots({ count, active }: { count: number; active: number }) {
  return (
    <View style={pd.row}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            pd.dot,
            i === active ? pd.active : pd.inactive,
          ]}
        />
      ))}
    </View>
  );
}
const pd = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot: { height: 6, borderRadius: 3 },
  active: { width: 24, backgroundColor: Colors.primary },
  inactive: { width: 8, backgroundColor: Colors.border },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

interface Props {
  onDone: () => void;
}

export default function TutorialScreen({ onDone }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef<FlatList<Slide>>(null);
  const btnScale = useSharedValue(1);

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]?.index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  function goNext() {
    if (activeIndex < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      btnScale.value = withSpring(0.95, { damping: 8 }, () => {
        btnScale.value = withSpring(1);
      });
      onDone();
    }
  }

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0A0A0F', '#0D0D18', '#0A0A0F']} style={StyleSheet.absoluteFill} />

      {/* Skip button */}
      <TouchableOpacity style={s.skipButton} onPress={onDone} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <Text style={s.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slide list */}
      <FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SlideView slide={item} />}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        style={s.list}
        bounces={false}
      />

      {/* Bottom controls */}
      <View style={s.bottom}>
        <PageDots count={SLIDES.length} active={activeIndex} />

        <Animated.View style={[s.ctaWrapper, btnStyle]}>
          <TouchableOpacity style={s.cta} onPress={goNext} activeOpacity={0.85}>
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDeep]}
              style={s.ctaGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={s.ctaText}>{isLast ? "Let's Eat" : 'Next'}</Text>
              {isLast ? (
                <AppIcon name="meal" size={18} color="#FFFFFF" />
              ) : (
                <AppIcon name="chevron-right" size={18} color="#FFFFFF" />
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  skipButton: {
    position: 'absolute',
    top: 56,
    right: 24,
    zIndex: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  skipText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    color: Colors.textSecondary,
  },

  list: { flex: 1 },

  bottom: {
    paddingHorizontal: 28,
    paddingBottom: 48,
    gap: 24,
    alignItems: 'center',
  },

  ctaWrapper: { width: '100%' },
  cta: {
    borderRadius: 50,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaGradient: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
