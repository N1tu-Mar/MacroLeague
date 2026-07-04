// Runtime theme provider — flips the whole app between the light-first design
// and its dark variant. The active palette is exposed through `useTheme()`;
// the chosen mode is persisted to AsyncStorage so it survives restarts.
//
// Usage in a screen/component:
//   const { colors } = useTheme();
//   const styles = useMemo(() => makeStyles(colors), [colors]);
//
// `makeStyles(colors)` keeps StyleSheet creation cheap (memoized per palette)
// while letting every color come from the active theme.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors, lightColors, darkColors } from './palettes';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ml_theme_mode';

type ThemeContextValue = {
  /** The resolved palette for the active appearance. */
  colors: ThemeColors;
  /** Whether the resolved appearance is dark. */
  isDark: boolean;
  /** The user's chosen preference ('system' follows the OS). */
  mode: ThemeMode;
  /** Persist a new preference. */
  setMode: (mode: ThemeMode) => void;
  /** Convenience: flip between explicit light and dark. */
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  isDark: false,
  mode: 'light',
  setMode: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  // Default the app to the light-first design; users can opt into dark/system.
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const isDark =
    mode === 'dark' || (mode === 'system' && systemScheme === 'dark');

  const toggleTheme = useCallback(() => {
    setMode(isDark ? 'light' : 'dark');
  }, [isDark, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      isDark,
      mode,
      setMode,
      toggleTheme,
    }),
    [isDark, mode, setMode, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
