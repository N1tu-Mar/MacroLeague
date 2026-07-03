import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!configuredUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Expo configuration: set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY before starting or building MacroLeague.',
  );
}

const supabaseUrl = configuredUrl.replace(/\/$/, '');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Web OAuth returns ?code=... to the page URL; mobile uses a custom redirect.
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});
