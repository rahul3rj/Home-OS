import { Text } from '@/components/ui/Text';
import { formatINR } from '@/lib/format';

/**
 * Money, always through the INR formatter.
 *
 * `variant="display"` is for the single most important figure on a screen —
 * exactly one per screen, per DESIGN.md.
 */
export function MoneyText({
  amount,
  variant = 'body',
  tone = 'default',
  paise,
  signed,
  style,
}: {
  amount: number;
  variant?: 'display' | 'title' | 'body' | 'bodyStrong' | 'label';
  tone?: 'default' | 'muted' | 'accent' | 'positive' | 'negative';
  /** Show two decimals. Off by default — whole rupees are easier to scan. */
  paise?: boolean;
  /** Prefix with + or −, for deltas like month-on-month change. */
  signed?: boolean;
  style?: object;
}) {
  const magnitude = formatINR(Math.abs(amount), { paise });
  const sign = signed ? (amount < 0 ? '−' : '+') : amount < 0 ? '−' : '';

  return (
    <Text variant={variant} tone={tone} style={style} numberOfLines={1}>
      {`${sign}${magnitude}`}
    </Text>
  );
}
