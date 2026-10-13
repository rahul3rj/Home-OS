/**
 * Edit profile: name, colour and SOS number.
 *
 * Pushed from Settings — it is not a tab, so it keeps its own back chevron.
 * Name and colour save through the same `finish_profile` step as sign-up;
 * the number saves beside it. Empty clears the number.
 */

import { Stack as RouterStack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Avatar,
  Button,
  Card,
  Icon,
  IconButton,
  Input,
  Screen,
  ScreenHeader,
  SectionHeader,
  Stack as StackLayout,
  Text,
} from '@/components/ui';
import { useHousehold } from '@/lib/household';
import { useMutation } from '@/lib/hooks';
import { avatarTints } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function EditProfile() {
  const theme = useTheme();
  const router = useRouter();
  const { profile, updateProfile, updateProfilePhone } = useHousehold();
  const save = useMutation();

  const [name, setName] = useState(profile?.display_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [tint, setTint] = useState(profile?.avatar_index ?? 0);

  const nameChanged = name.trim() !== (profile?.display_name ?? '');
  const phoneChanged = phone.trim() !== (profile?.phone ?? '');
  const tintChanged = tint !== (profile?.avatar_index ?? 0);
  const dirty = nameChanged || phoneChanged || tintChanged;
  const nameValid = name.trim().length > 0;

  function submit() {
    if (!dirty || !nameValid) return;
    void save
      .run(async () => {
        if (nameChanged || tintChanged) await updateProfile(name, tint);
        if (phoneChanged) await updateProfilePhone(phone);
      })
      .then((ok) => {
        if (ok) router.back();
      });
  }

  return (
    <Screen>
      <RouterStack.Screen options={{ title: 'Edit profile' }} />
      <ScreenHeader
        title="Edit profile"
        left={
          <IconButton
            icon={<Icon name="ChevronLeft" size={24} />}
            label="Go back"
            onPress={() => router.back()}
          />
        }
      />

      <StackLayout gap="lg">
        <Card>
          <View style={styles.preview}>
            <Avatar
              name={name.trim() || profile?.display_name}
              tintIndex={tint}
              size={64}
              uri={profile?.avatar_url ?? null}
            />
            <Text variant="caption" tone="faint">
              Your photo stays — change it with the pencil on Settings.
            </Text>
          </View>

          <Input
            label="What the family sees"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="Your name"
            returnKeyType="next"
            error={!nameValid ? 'Tell your family your name.' : null}
          />

          <Input
            label="Phone for SOS calls"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="e.g. +91 98765 43210"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </Card>

        <View>
          <SectionHeader label="Colour" />
          <Card>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Avatar colour"
              style={styles.tints}
            >
              {avatarTints.map((colour, index) => {
                const selected = tint === index;
                return (
                  <Pressable
                    key={colour}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Colour ${index + 1}`}
                    onPress={() => setTint(index)}
                    style={[
                      styles.tint,
                      {
                        backgroundColor: colour,
                        borderColor: selected ? theme.colors.text : 'transparent',
                      },
                    ]}
                  />
                );
              })}
            </View>
          </Card>
        </View>

        {save.error ? (
          <Text variant="caption" tone="negative">
            {save.error}
          </Text>
        ) : null}

        <Button
          label="Save changes"
          fullWidth
          loading={save.pending}
          disabled={!dirty || !nameValid}
          onPress={submit}
        />
      </StackLayout>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', gap: 8 },
  tints: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tint: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
  },
});
