import React from 'react';
import { Text } from './ui';
import { FontFamily, useTheme } from '../theme';
import { openPrivacyPolicy, openTerms } from '../lib/legal';

/**
 * The "By continuing, you agree to the Terms and Privacy Policy" line shown on the
 * Welcome and Sign-up screens. The Terms and Privacy Policy words are tappable and
 * open the published legal pages (see src/lib/legal.ts). Apple/Google expect these
 * links to be reachable from within the app, not just the store listing.
 */
export default function LegalNotice() {
  const { colors } = useTheme();
  const link = { color: colors.scarlet, fontFamily: FontFamily.semibold } as const;

  return (
    <Text center variant="labelSm" color={colors.textTertiary}>
      By continuing, you agree to the{' '}
      <Text variant="labelSm" style={link} onPress={openTerms}>
        Terms
      </Text>
      {' and '}
      <Text variant="labelSm" style={link} onPress={openPrivacyPolicy}>
        Privacy Policy
      </Text>
      .
    </Text>
  );
}
