import { createContext, useContext } from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/useTheme';

export type TextVariant =
  'display' | 'title' | 'subtitle' | 'body' | 'bodyStrong' | 'label' | 'caption';
export type TextTone =
  'default' | 'muted' | 'faint' | 'accent' | 'positive' | 'negative' | 'onPrimary' | 'onInverse';

/**
 * Per-surface ink override.
 *
 * Set by filled containers whose background is not the page — a dark or negative
 * card, a lime CTA. Text inside one of those reads off this instead of the theme,
 * so the call site never has to repeat a tone prop just to stay legible.
 */
export const InkContext = createContext<{ fg: string; muted: string; faint: string } | null>(null);

type Props = TextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  style?: TextStyle | TextStyle[];
};

/**
 * The only text primitive.
 *
 * Font scaling is never disabled here — that is the single most damaging
 * accessibility anti-pattern, and the layout is expected to cope with larger
 * text rather than the other way round.
 */
export function Text({ variant = 'body', tone = 'default', style, ...rest }: Props) {
  const theme = useTheme();
  const ink = useContext(InkContext);

  // There is no lime text tone on purpose: the brand accent is a fill, and at
  // body sizes it fails contrast on both the sage canvas and white cards.
  const toneColor: Record<TextTone, string> = {
    default: ink?.fg ?? theme.colors.text,
    muted: ink?.muted ?? theme.colors.textMuted,
    faint: ink?.faint ?? theme.colors.textFaint,
    accent: theme.colors.textAccent,
    positive: theme.colors.positiveDeep,
    negative: theme.colors.negative,
    onPrimary: theme.colors.onPrimary,
    onInverse: theme.colors.onInverse,
  };

  return <RNText {...rest} style={[theme.type[variant], { color: toneColor[tone] }, style]} />;
}
