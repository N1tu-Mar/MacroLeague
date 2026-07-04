import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleProp,
  ViewStyle,
  KeyboardTypeOptions,
  ReturnKeyTypeOptions,
} from 'react-native';
import { Type, Radius, Spacing, useTheme } from '../../theme';
import AppIcon, { AppIconName } from './AppIcon';
import Text from './Text';

interface TextFieldProps {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secure?: boolean;
  error?: string | null;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: React.ComponentProps<typeof TextInput>['autoComplete'];
  autoCorrect?: boolean;
  textContentType?: React.ComponentProps<typeof TextInput>['textContentType'];
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  editable?: boolean;
  rightIcon?: AppIconName;
  onRightIconPress?: () => void;
  style?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
}

/**
 * Labeled text field (spec F4). Label sits above the value inside the box.
 * Focus draws an ink border + soft ring; error draws a red border + message
 * below. Secure fields get an eye/eye-off toggle automatically.
 */
export default function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secure = false,
  error,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  autoCorrect = false,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  editable = true,
  rightIcon,
  onRightIconPress,
  style,
  autoFocus,
}: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);

  const hasError = !!error;
  const borderColor = hasError
    ? colors.error
    : focused
    ? colors.ink
    : colors.borderInput;
  const labelColor = hasError
    ? colors.error
    : focused
    ? colors.ink
    : colors.textSecondary;

  const trailingIcon: AppIconName | undefined = secure
    ? reveal
      ? 'eye-off'
      : 'eye'
    : rightIcon;

  return (
    <View style={style}>
      <View
        style={{
          backgroundColor: colors.card,
          borderWidth: 1.5,
          borderColor,
          borderRadius: Radius.input,
          paddingVertical: 9,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          ...(focused && !hasError
            ? {
                shadowColor: colors.ink,
                shadowOpacity: 0.06,
                shadowRadius: 0,
                shadowOffset: { width: 0, height: 0 },
              }
            : {}),
        }}
      >
        <View style={{ flex: 1 }}>
          {label ? (
            <Text variant="labelSm" color={labelColor}>
              {label}
            </Text>
          ) : null}
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textTertiary}
            secureTextEntry={secure && !reveal}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoComplete={autoComplete}
            autoCorrect={autoCorrect}
            textContentType={textContentType}
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            editable={editable}
            autoFocus={autoFocus}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[
              Type.subhead,
              {
                color: colors.ink,
                fontFamily: Type.body.fontFamily,
                fontSize: 15.5,
                padding: 0,
                marginTop: label ? 2 : 0,
              },
            ]}
          />
        </View>
        {trailingIcon ? (
          <Pressable
            hitSlop={12}
            onPress={secure ? () => setReveal((r) => !r) : onRightIconPress}
            style={{ paddingLeft: Spacing.md, alignSelf: 'center' }}
          >
            <AppIcon name={trailingIcon} size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {hasError ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            marginTop: 6,
            paddingHorizontal: 2,
          }}
        >
          <AppIcon name="circle-alert" size={14} color={colors.error} />
          <Text variant="label" color={colors.error} style={{ flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
