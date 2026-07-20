import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { reportError } from '../lib/monitoring';
import { SUPPORT_EMAIL, openSupportEmail } from '../lib/legal';

/**
 * Catches render-time crashes anywhere below it.
 *
 * WHY: there was no error boundary anywhere in the app. A single thrown error
 * during render unmounts the whole React tree, which on a native build is a
 * permanent white screen with no way out except force-quitting — and on a
 * gamified daily-habit app, that reads as "the app is broken" and ends the
 * streak that keeps the user coming back.
 *
 * Deliberately NOT themed via useTheme(): this component has to render when the
 * app is already failing, and reaching into a context provider that may itself
 * be part of the failure would defeat the point. Colors are inlined, and the
 * palette is the neutral one that reads acceptably in both light and dark.
 *
 * Errors are reported to Sentry via reportError(). componentDidCatch is one of
 * the few places where reporting is unconditional — by definition we have just
 * lost the UI, so there is nothing to weigh it against.
 */

interface Props {
  children: React.ReactNode;
  /** Shown instead of the default screen, if supplied. */
  fallback?: (reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(error, {
      where: 'ErrorBoundary',
      componentStack: info.componentStack,
    });
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return <>{this.props.fallback(this.reset)}</>;

    return (
      <View style={{ flex: 1, backgroundColor: '#FBFBFD', justifyContent: 'center' }}>
        <ScrollView
          contentContainerStyle={{ padding: 28, gap: 14, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#14141A', textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 20, color: '#5B5B66', textAlign: 'center' }}>
            The screen hit an unexpected error. Your logged meals and points are
            safe — nothing was lost.
          </Text>

          <Pressable
            onPress={this.reset}
            accessibilityRole="button"
            style={{
              marginTop: 6,
              paddingHorizontal: 22,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: '#D9364A',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>
              Try again
            </Text>
          </Pressable>

          <Pressable onPress={openSupportEmail} accessibilityRole="button">
            <Text style={{ fontSize: 13, color: '#5B5B66', textDecorationLine: 'underline' }}>
              Contact {SUPPORT_EMAIL}
            </Text>
          </Pressable>

          {/* The message is developer-facing detail, so it is shown only in dev.
              In production it would be noise to the user and could disclose
              internals; Sentry already has the full stack. */}
          {__DEV__ ? (
            <Text
              style={{
                marginTop: 10,
                fontSize: 11,
                color: '#8A8A96',
                fontFamily: 'Courier',
                textAlign: 'center',
              }}
            >
              {error.message}
            </Text>
          ) : null}
        </ScrollView>
      </View>
    );
  }
}
