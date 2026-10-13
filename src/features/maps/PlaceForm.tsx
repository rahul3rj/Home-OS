/**
 * Save-a-place form, rendered inside a bottom sheet.
 *
 * A pin is always the member's current spot — typing coordinates by hand is
 * how wrong pins happen. The screen captures the fix via expo-location and
 * hands it here as `coords`; this form only shows whether one is held.
 */

import { View } from 'react-native';

import { Button, Input, Text } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

export type PlaceDraft = {
  name: string;
  note: string;
};

export const emptyPlaceDraft: PlaceDraft = {
  name: '',
  note: '',
};

export type PlaceCoords = {
  lat: number;
  lng: number;
};

export function PlaceForm({
  draft,
  onChange,
  onSubmit,
  coords,
  locating,
  onUseMyLocation,
  showErrors,
}: {
  draft: PlaceDraft;
  onChange: (draft: PlaceDraft) => void;
  onSubmit: () => void;
  coords: PlaceCoords | null;
  locating: boolean;
  onUseMyLocation: () => void;
  /** True once a save was attempted — empty names error only from then on. */
  showErrors: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Input
        label="Place name"
        placeholder="e.g. Home, School, Dadi's house"
        value={draft.name}
        onChangeText={(name) => onChange({ ...draft, name })}
        autoFocus
        autoCapitalize="words"
        returnKeyType="next"
        error={showErrors && !draft.name.trim() ? 'Give the place a name first.' : null}
      />
      <Input
        label="Note (optional)"
        placeholder="e.g. Gate 2, near the park"
        value={draft.note}
        onChangeText={(note) => onChange({ ...draft, note })}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />
      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label={coords ? 'Pinned — update to my current spot' : 'Pin my current spot'}
          variant="secondary"
          fullWidth
          loading={locating}
          onPress={onUseMyLocation}
        />
        {coords ? (
          <Text variant="caption" tone="muted">
            {`Pinned at ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`}
          </Text>
        ) : (
          <Text variant="caption" tone="faint">
            Stand where you want the pin — the map uses your live position.
          </Text>
        )}
      </View>
    </View>
  );
}
