import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withDelay,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { Type, Radius, Spacing, useTheme } from '../../theme';
import type { ThemeColors } from '../../theme';
import { Text, AppIcon } from '../../components/ui';
import Chip from '../../components/ui/Chip';
import { sendChatMessage, ChatMessage } from '../../services/chatService';
import { toUserFacingMessage } from '../../lib/errors';

const SUGGESTED_QUESTIONS = [
  'What do trans fats actually do to my body?',
  'How much protein do I really need?',
  'Why does fiber matter for athletes?',
  'Should I eat carbs before a workout?',
  'What are the best unsaturated fat sources?',
  'How does sodium affect my performance?',
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hey! I'm MacroCoach — your personal nutrition guide. Ask me anything about macros, nutrients, and how to fuel better performance. What's on your mind?",
};

// ── Typing indicator (spec: `typing` 1.2s, dots staggered 0 / .2s / .4s,
//    opacity .25↔1 + translateY 0↔-3). One triangle-wave cycle per dot.
function TypingDot({ delay, color }: { delay: number; color: string }) {
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
  }, [delay, progress]);

  const style = useAnimatedStyle(
    () => ({
      opacity: interpolate(progress.value, [0, 1], [0.25, 1]),
      transform: [{ translateY: interpolate(progress.value, [0, 1], [0, -3]) }],
    }),
    [],
  );

  return (
    <Animated.View
      style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, style]}
    />
  );
}

export default function CoachScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedText, setFailedText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);
      setError(null);
      setFailedText('');
      scrollToBottom();

      // Build history excluding the static welcome message.
      const history: ChatMessage[] = [...messages, userMsg]
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const reply = await sendChatMessage(history);
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', content: reply },
        ]);
        scrollToBottom();
      } catch (err: unknown) {
        const msg = toUserFacingMessage(err, 'Something went wrong. Try again.');
        setError(msg);
        setFailedText(trimmed);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, scrollToBottom],
  );

  const showSuggestions = messages.length === 1;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <View style={styles.headerIconTile}>
          <AppIcon name="coach" size={18} color={colors.scarlet} strokeWidth={2.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="heading" color={colors.ink}>
            MacroCoach
          </Text>
          <Text variant="label" color={colors.textSecondary}>
            Your nutrition assistant
          </Text>
        </View>
      </View>

      {/* ── Messages ── */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
        onContentSizeChange={scrollToBottom}
      >
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <View
              key={msg.id}
              style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAI]}
            >
              {!isUser && (
                <View style={styles.aiAvatar}>
                  <AppIcon name="coach" size={13} color={colors.scarlet} strokeWidth={2.5} />
                </View>
              )}
              <View
                style={[
                  styles.bubble,
                  isUser ? styles.bubbleUser : styles.bubbleAI,
                  { maxWidth: isUser ? '80%' : '84%' },
                ]}
              >
                <Text
                  variant="body"
                  color={isUser ? colors.onPrimary : colors.ink}
                  style={styles.bubbleText}
                >
                  {msg.content}
                </Text>
              </View>
            </View>
          );
        })}

        {/* Typing indicator */}
        {isLoading && (
          <View style={[styles.bubbleRow, styles.bubbleRowAI]}>
            <View style={styles.aiAvatar}>
              <AppIcon name="coach" size={13} color={colors.scarlet} strokeWidth={2.5} />
            </View>
            <View style={[styles.bubble, styles.bubbleAI, styles.bubbleTyping]}>
              <TypingDot delay={0} color={colors.textTertiary} />
              <TypingDot delay={200} color={colors.textTertiary} />
              <TypingDot delay={400} color={colors.textTertiary} />
            </View>
          </View>
        )}

        {/* Error banner */}
        {error && (
          <View style={styles.errorBanner}>
            <AppIcon name="circle-alert" size={16} color={colors.scarlet} strokeWidth={2.25} />
            <View style={{ flex: 1 }}>
              <Text variant="cardTitle" color={colors.ink}>
                That didn&apos;t send.
              </Text>
              <Text variant="label" color={colors.textSecondary}>
                {error}
              </Text>
            </View>
            {failedText ? (
              <Pressable
                style={styles.retryBtn}
                onPress={() => {
                  const text = failedText;
                  setError(null);
                  sendMessage(text);
                }}
                hitSlop={8}
              >
                <AppIcon name="repeat" size={14} color={colors.onPrimary} strokeWidth={2.25} />
                <Text variant="labelSm" color={colors.onPrimary}>
                  Retry
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* Suggestion chips — shown only on the welcome screen */}
        {showSuggestions && (
          <View style={styles.suggestions}>
            <Text variant="overline" color={colors.textSecondary}>
              Try asking
            </Text>
            <View style={styles.chipsWrap}>
              {SUGGESTED_QUESTIONS.map((q) => (
                <Chip key={q} label={q} onPress={() => sendMessage(q)} />
              ))}
            </View>
            <Text variant="labelSm" color={colors.textTertiary} style={styles.privacyNote}>
              Coach never sees your private meal details.
            </Text>
          </View>
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      {/* ── Input bar ── */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <View style={styles.inputField}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your nutrition…"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
            editable={!isLoading}
            returnKeyType="default"
          />
        </View>
        <Pressable
          style={[styles.sendBtn, (!input.trim() || isLoading) && styles.sendBtnDisabled]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || isLoading}
        >
          <AppIcon
            name="send"
            size={18}
            color={!input.trim() || isLoading ? colors.textDisabled : colors.onPrimary}
            strokeWidth={2.25}
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingHorizontal: Spacing.screen,
      paddingBottom: Spacing.md,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderCard,
    },
    headerIconTile: {
      width: 40,
      height: 40,
      borderRadius: Radius.sm,
      backgroundColor: colors.brandTint,
      borderWidth: 1,
      borderColor: colors.brandTintBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },

    messageList: { flex: 1 },
    messageContent: { paddingHorizontal: Spacing.screen, paddingTop: Spacing.lg },

    bubbleRow: {
      flexDirection: 'row',
      marginBottom: Spacing.md,
      alignItems: 'flex-end',
      gap: Spacing.sm,
    },
    bubbleRowUser: { justifyContent: 'flex-end' },
    bubbleRowAI: { justifyContent: 'flex-start' },

    aiAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.brandTint,
      borderWidth: 1,
      borderColor: colors.brandTintBorder,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginBottom: 2,
    },

    bubble: {
      borderRadius: Radius.lg,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
    },
    bubbleUser: {
      backgroundColor: colors.scarlet,
      borderBottomRightRadius: Radius.sm - 5,
    },
    bubbleAI: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderCard,
      borderBottomLeftRadius: Radius.sm - 5,
    },
    bubbleTyping: {
      flexDirection: 'row',
      gap: 5,
      paddingVertical: Spacing.md,
      alignItems: 'center',
    },
    bubbleText: {
      lineHeight: Type.body.fontSize * 1.5,
    },

    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      backgroundColor: colors.brandTint,
      borderWidth: 1,
      borderColor: colors.brandTintBorder,
      borderRadius: Radius.card,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      marginBottom: Spacing.md,
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.scarlet,
      borderRadius: Radius.pill,
      paddingHorizontal: Spacing.md,
      paddingVertical: 7,
    },

    suggestions: { marginTop: Spacing.base, marginBottom: Spacing.sm },
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
      marginTop: Spacing.md,
    },
    privacyNote: { marginTop: Spacing.base },

    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.screen,
      paddingTop: Spacing.md,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.borderCard,
    },
    inputField: {
      flex: 1,
      backgroundColor: colors.canvas,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      borderRadius: Radius.lg,
      paddingHorizontal: Spacing.base,
      paddingVertical: Platform.OS === 'ios' ? Spacing.md : Spacing.sm,
      justifyContent: 'center',
    },
    input: {
      ...Type.body,
      color: colors.ink,
      padding: 0,
      maxHeight: 120,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.scarlet,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    sendBtnDisabled: {
      backgroundColor: colors.track,
    },
  });
}
