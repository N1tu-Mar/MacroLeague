import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontFamily, FontSize, Spacing, Radius, Shadow, alpha } from '../../theme';
import AppIcon from '../../components/ui/AppIcon';
import { sendChatMessage, ChatMessage } from '../../services/chatService';
import { useUserStore } from '../../store/userStore';

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

function TypingDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % 4), 400);
    return () => clearInterval(id);
  }, []);
  const dots = '.'.repeat(frame);
  return (
    <Text style={styles.typingText}>
      {dots || ' '}
    </Text>
  );
}

export default function CoachScreen() {
  const user = useUserStore((s) => s.user);
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        const msg = err instanceof Error ? err.message : 'Something went wrong. Try again.';
        setError(msg);
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
        <View style={styles.headerIconWrap}>
          <AppIcon name="bolt" size={18} color={Colors.primary} strokeWidth={2.5} />
        </View>
        <View>
          <Text style={styles.headerTitle}>MacroCoach</Text>
          <Text style={styles.headerSub}>AI nutrition guide</Text>
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
                  <AppIcon name="bolt" size={12} color={Colors.primary} strokeWidth={2.5} />
                </View>
              )}
              <View
                style={[
                  styles.bubble,
                  isUser ? styles.bubbleUser : styles.bubbleAI,
                  { maxWidth: isUser ? '78%' : '86%' },
                ]}
              >
                <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextAI}>
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
              <AppIcon name="bolt" size={12} color={Colors.primary} strokeWidth={2.5} />
            </View>
            <View style={[styles.bubble, styles.bubbleAI, styles.bubbleTyping]}>
              <TypingDots />
            </View>
          </View>
        )}

        {/* Error banner */}
        {error && (
          <View style={styles.errorBanner}>
            <AppIcon name="warning" size={13} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}>
              <Text style={styles.errorDismiss}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Suggestion chips — shown only on the welcome screen */}
        {showSuggestions && (
          <View style={styles.suggestions}>
            <Text style={styles.suggestionsLabel}>Try asking:</Text>
            <View style={styles.chipsWrap}>
              {SUGGESTED_QUESTIONS.map((q) => (
                <TouchableOpacity
                  key={q}
                  style={styles.chip}
                  onPress={() => sendMessage(q)}
                  activeOpacity={0.72}
                >
                  <Text style={styles.chipText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      {/* ── Input bar ── */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about nutrition..."
          placeholderTextColor={Colors.textTertiary}
          multiline
          maxLength={500}
          editable={!isLoading}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || isLoading) && styles.sendBtnDisabled]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.textPrimary} />
          ) : (
            <AppIcon name="send" size={18} color={Colors.textPrimary} strokeWidth={2} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: alpha(Colors.primary, 0.15),
    borderWidth: 1,
    borderColor: alpha(Colors.primary, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.subhead,
    color: Colors.textPrimary,
  },
  headerSub: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.meta,
    color: Colors.textSecondary,
    marginTop: 1,
  },

  messageList: { flex: 1 },
  messageContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.lg },

  bubbleRow: { flexDirection: 'row', marginBottom: Spacing.md, alignItems: 'flex-end', gap: Spacing.sm },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAI: { justifyContent: 'flex-start' },

  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: alpha(Colors.primary, 0.12),
    borderWidth: 1,
    borderColor: alpha(Colors.primary, 0.25),
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
    backgroundColor: Colors.primary,
    borderBottomRightRadius: Radius.sm,
  },
  bubbleAI: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomLeftRadius: Radius.sm,
  },
  bubbleTyping: {
    paddingVertical: Spacing.sm,
    minWidth: 52,
    alignItems: 'center',
  },
  bubbleTextUser: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.body,
    color: Colors.textPrimary,
    lineHeight: FontSize.body * 1.5,
  },
  bubbleTextAI: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.body,
    color: Colors.textPrimary,
    lineHeight: FontSize.body * 1.55,
  },
  typingText: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.subhead,
    color: Colors.textSecondary,
    letterSpacing: 3,
    minWidth: 24,
    textAlign: 'center',
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: alpha(Colors.error, 0.1),
    borderWidth: 1,
    borderColor: alpha(Colors.error, 0.3),
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
  },
  errorText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.label,
    color: Colors.error,
    flex: 1,
  },
  errorDismiss: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.label,
    color: Colors.textSecondary,
  },

  suggestions: { marginTop: Spacing.base, marginBottom: Spacing.sm },
  suggestionsLabel: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.label,
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    marginBottom: Spacing.md,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  chipText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.label,
    color: Colors.textSecondary,
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    fontFamily: FontFamily.body,
    fontSize: FontSize.body,
    color: Colors.textPrimary,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...Shadow.floating,
  },
  sendBtnDisabled: {
    backgroundColor: Colors.track,
    shadowOpacity: 0,
    elevation: 0,
  },
});
