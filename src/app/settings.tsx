import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Icon,
  ListSection,
  Row,
  Screen,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  Sheet,
  Stack as StackLayout,
  Text,
} from '@/components/ui';
import { useAuth } from '@/lib/session';
import { useHousehold } from '@/lib/household';
import { useMutation } from '@/lib/hooks';
import type { Member } from '@/lib/types';
import {
  COUNTRIES,
  countryName,
  readCountryId,
  readStoreId,
  storeName,
  storesForCountry,
  writeCountryId,
  writeStoreId,
  type StoreAppId,
  type StoreCountryId,
} from '@/features/groceries/stores';
import { useTheme, useThemePreference } from '@/theme/useTheme';

/**
 * Settings: you, appearance, and your home.
 *
 * A tab now, so there is no heading and no back chevron — the tab bar says
 * where you are. The hero is the person: a big centred photo with a pencil
 * badge, then name, email, number and house. Anything editable lives behind
 * "Edit profile"; everything here is view-only.
 */
export default function Settings() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { household, members, profile, transferHeadship, updateProfilePhoto } = useHousehold();
  const { preference, setPreference } = useThemePreference();

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'country' | 'store'>(null);
  // Country and quick-order store. Per device, not per account — each phone
  // keeps its own preference.
  const [countryId, setCountryId] = useState<StoreCountryId>(() => readCountryId());
  const [storeId, setStoreId] = useState<StoreAppId | null>(() => readStoreId());
  const availableStores = storesForCountry(countryId);
  const currentStoreName = storeId ? storeName(storeId) : null;

  function pickCountry(id: StoreCountryId) {
    setCountryId(id);
    writeCountryId(id);
    // A saved app from another country must not survive the switch.
    if (storeId && !storesForCountry(id).includes(storeId)) {
      setStoreId(null);
      writeStoreId(null);
    }
    setSheet(null);
  }

  function pickStore(id: StoreAppId | null) {
    setStoreId(id);
    writeStoreId(id);
    setSheet(null);
  }

  const transfer = useMutation();
  const photo = useMutation();

  // `owner` in the database is the Head of the House: exactly one per home.
  const isHead = members.some((member) => member.user_id === user?.id && member.role === 'owner');

  function confirmTransfer() {
    const target = transferTarget;
    setTransferTarget(null);
    if (!target) return;
    void transfer.run(() => transferHeadship(target.user_id));
  }

  async function changePhoto() {
    setPhotoNotice(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoNotice('Allow photo access to change your picture.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (picked.canceled || !picked.assets[0]) return;

    await photo.run(() => updateProfilePhoto(picked.assets[0].uri));
  }

  async function shareCode() {
    if (!household) return;
    try {
      await Share.share({
        message: `Join ${household.name} on Home Os with code ${household.invite_code}`,
      });
    } catch {
      // The user dismissed the share sheet. Nothing to report.
    }
  }

  const phone = profile?.phone?.trim() || null;

  return (
    <Screen>
      <ScreenHeader title="Settings" subtitle={household?.name?.trim() || undefined} />
      <StackLayout gap="lg">
        {/* The person. Photo, then the details worth knowing at a glance. */}
        <Animated.View entering={FadeInUp.duration(350)}>
          <Card>
            <View style={styles.hero}>
              <View>
                <Avatar
                  name={profile?.display_name}
                  tintIndex={profile?.avatar_index ?? 0}
                  size={112}
                  uri={profile?.avatar_url ?? null}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change profile photo"
                  accessibilityHint="Opens your photo library"
                  accessibilityState={{ busy: photo.pending }}
                  disabled={photo.pending}
                  onPress={changePhoto}
                  style={({ pressed }) => [
                    styles.pencil,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.hairline,
                      opacity: photo.pending ? 0.6 : pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Icon name="Pencil" size={16} />
                </Pressable>
              </View>

              <Text variant="title" numberOfLines={1} style={styles.center}>
                {profile?.display_name ?? 'Member'}
              </Text>
              {user?.email ? (
                <Text variant="caption" tone="muted" numberOfLines={1} style={styles.center}>
                  {user.email}
                </Text>
              ) : null}
              <Text
                variant="caption"
                tone={phone ? 'muted' : 'faint'}
                numberOfLines={1}
                style={styles.center}
              >
                {phone ?? 'No number yet — add one in Edit profile'}
              </Text>
              <View style={styles.houseRow}>
                <Icon name="House" size={16} tone="muted" />
                <Text variant="body" numberOfLines={1}>
                  {household?.name ?? '—'}
                </Text>
              </View>

              {(photoNotice ?? photo.error) ? (
                <Text variant="caption" tone="negative" style={styles.center}>
                  {photoNotice ?? photo.error}
                </Text>
              ) : null}

              <Button
                label="Edit profile"
                variant="secondary"
                fullWidth
                icon={<Icon name="User" size={18} tone="muted" />}
                onPress={() => router.push('/edit-profile')}
              />
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(350).delay(90)}>
          <View>
            <SectionHeader label="Appearance" />
            <Card>
              <SegmentedControl
                accessibilityLabel="Choose light or dark theme"
                value={preference}
                onChange={setPreference}
                options={[
                  { value: 'light', label: 'Light', icon: 'Sun' },
                  { value: 'dark', label: 'Dark', icon: 'Moon' },
                ]}
              />
            </Card>
          </View>
        </Animated.View>

        <View>
          <SectionHeader label="Groceries" />
          <Card>
            <View style={styles.pickerGroup}>
              <Text variant="caption" tone="muted">
                Country
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Country, ${countryName(countryId)}`}
                accessibilityHint="Opens the country list"
                onPress={() => setSheet('country')}
                style={[
                  styles.storeBar,
                  {
                    backgroundColor: theme.colors.surfaceMuted,
                    borderRadius: theme.radius.md,
                  },
                ]}
              >
                <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                  {countryName(countryId)}
                </Text>
                <Icon name="ChevronDown" size={20} tone="muted" />
              </Pressable>
              <Text variant="caption" tone="muted">
                Quick order app
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Order from, ${currentStoreName ?? 'not chosen'}`}
                accessibilityHint="Opens the store list"
                onPress={() => setSheet('store')}
                style={[
                  styles.storeBar,
                  {
                    backgroundColor: theme.colors.surfaceMuted,
                    borderRadius: theme.radius.md,
                  },
                ]}
              >
                <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                  {currentStoreName ?? 'Choose an app'}
                </Text>
                <Icon name="ChevronDown" size={20} tone="muted" />
              </Pressable>
            </View>
          </Card>
        </View>

        <View>
          <SectionHeader label="Your home" />
          <Card>
            <View style={styles.between}>
              <Text variant="title" style={styles.flex} numberOfLines={1}>
                {household?.name ?? '—'}
              </Text>
              <Badge
                label={`${members.length} ${members.length === 1 ? 'member' : 'members'}`}
                tone="neutral"
              />
            </View>

            <View
              style={[
                styles.codeBox,
                // The invite code is the one thing on this screen worth
                // displaying large, so it gets the weight-900 display step.
                { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.xl },
              ]}
            >
              <Text variant="caption" tone="muted">
                Invite code
              </Text>
              <Text
                variant="display"
                accessibilityLabel={`Invite code ${household?.invite_code ?? ''}`}
              >
                {household?.invite_code ?? '——————'}
              </Text>
            </View>

            <Button
              label="Share the code"
              variant="secondary"
              icon={<Icon name="Share" size={18} tone="muted" />}
              onPress={shareCode}
            />
          </Card>
        </View>

        <View>
          <SectionHeader label="Members" />
          <ListSection>
            {members.map((member, index) => (
              <Row key={member.user_id} separator={index < members.length - 1}>
                <Avatar
                  name={member.profile?.display_name}
                  tintIndex={member.profile?.avatar_index ?? 0}
                  size={32}
                  uri={member.profile?.avatar_url ?? null}
                />
                <Text variant="body" style={styles.flex} numberOfLines={1}>
                  {member.profile?.display_name ?? 'Member'}
                  {member.user_id === user?.id ? ' (you)' : ''}
                </Text>
                {member.role === 'owner' ? (
                  <Badge label="Head" tone="primary" />
                ) : isHead ? (
                  <Button
                    label="Make head"
                    variant="ghost"
                    size="sm"
                    loading={transfer.pending}
                    onPress={() => setTransferTarget(member)}
                  />
                ) : null}
              </Row>
            ))}
          </ListSection>
          {transfer.error ? (
            <Text variant="caption" tone="negative">
              {transfer.error}
            </Text>
          ) : null}
        </View>

        <Button
          label="Sign out"
          variant="danger"
          fullWidth
          onPress={() => setConfirmSignOut(true)}
        />
      </StackLayout>

      <Sheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet === 'country' ? 'Country' : 'Order from'}
      >
        {sheet === 'country' ? (
          <View style={styles.pickerGroup}>
            {COUNTRIES.map((country) => {
              const selected = countryId === country.id;
              return (
                <Pressable
                  key={country.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Country ${country.name}`}
                  onPress={() => pickCountry(country.id)}
                  style={styles.storeRow}
                >
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.hairline,
                      },
                    ]}
                  >
                    {selected ? (
                      <View style={[styles.radioDot, { backgroundColor: theme.colors.primary }]} />
                    ) : null}
                  </View>
                  <Text variant="body" style={styles.flex}>
                    {country.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.pickerGroup}>
            {availableStores.map((id) => {
              const selected = storeId === id;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Order from ${storeName(id)}`}
                  onPress={() => pickStore(id)}
                  style={styles.storeRow}
                >
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.hairline,
                      },
                    ]}
                  >
                    {selected ? (
                      <View style={[styles.radioDot, { backgroundColor: theme.colors.primary }]} />
                    ) : null}
                  </View>
                  <Text variant="body" style={styles.flex}>
                    {storeName(id)}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: storeId === null }}
              accessibilityLabel="No quick ordering"
              onPress={() => pickStore(null)}
              style={styles.storeRow}
            >
              <View
                style={[
                  styles.radio,
                  {
                    borderColor: storeId === null ? theme.colors.primary : theme.colors.hairline,
                  },
                ]}
              >
                {storeId === null ? (
                  <View style={[styles.radioDot, { backgroundColor: theme.colors.primary }]} />
                ) : null}
              </View>
              <Text variant="body" tone="muted" style={styles.flex}>
                None
              </Text>
            </Pressable>
          </View>
        )}
      </Sheet>

      <ConfirmDialog
        visible={confirmSignOut}
        title="Sign out?"
        message="You will need your email and password to get back in."
        confirmLabel="Sign out"
        destructive
        onConfirm={() => {
          setConfirmSignOut(false);
          void signOut();
        }}
        onCancel={() => setConfirmSignOut(false)}
      />

      <ConfirmDialog
        visible={transferTarget !== null}
        title={`Make ${transferTarget?.profile?.display_name ?? 'them'} head?`}
        message="They become Head of the House and you become a member. There is always exactly one head."
        confirmLabel="Make head"
        onConfirm={confirmTransfer}
        onCancel={() => setTransferTarget(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  hero: { alignItems: 'center', gap: 8 },
  center: { textAlign: 'center' },
  // Pencil badge rides the photo's bottom-right corner.
  pencil: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  houseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickerGroup: { gap: 8 },
  storeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 12, height: 12, borderRadius: 999 },
  codeBox: { alignItems: 'center', paddingVertical: 16, gap: 4 },
});
