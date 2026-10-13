/**
 * One earning row: source, optional note and date, tabular amount.
 *
 * Tapping the row opens the editor — edit and delete both live there, and
 * delete confirms with a dialog because money records cannot be undone.
 */

import { StyleSheet, View } from 'react-native';

import { MoneyText, Row, Text } from '@/components/ui';
import { formatDate, formatINR } from '@/lib/format';
import type { Earning } from '@/lib/types';

export function EarningRow({ earning, onPress }: { earning: Earning; onPress: () => void }) {
  const day = earning.created_at.slice(0, 10);
  const caption = [earning.note?.trim() || null, formatDate(day)].filter(Boolean).join(' · ');

  return (
    <Row
      onPress={onPress}
      accessibilityLabel={`Edit ${earning.source} earning of ${formatINR(earning.amount)}`}
      accessibilityHint="Opens the editor"
    >
      <View style={styles.main}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {earning.source}
        </Text>
        {caption ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
      <MoneyText amount={earning.amount} variant="bodyStrong" />
    </Row>
  );
}

const styles = StyleSheet.create({
  main: { flex: 1, gap: 2 },
});
