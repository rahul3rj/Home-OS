/**
 * Maps tab: saved family pins plus opt-in live locations, on an embedded
 * OpenStreetMap view that keeps working inside Expo Go.
 *
 * Workflow (Life360-style):
 * - Opening the tab reads your GPS into a LOCAL pin (avatar, battery) — the
 *   map shows where you are without telling anyone.
 * - Tapping Check in / Share publishes that fix to the household (live row).
 *   Stopping deletes your row again. No row means "not sharing".
 * - A pin is always the member's current spot — captured via expo-location,
 *   never typed by hand. Tapping a saved place flies the map to it.
 * - SOS raises a household flag every member sees and calls the head.
 */

import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  initialsOf,
  ListSection,
  LoadingState,
  Row,
  Screen,
  ScreenHeader,
  SectionHeader,
  Sheet,
  Stack as StackLayout,
  successFeedback,
  tapFeedback,
  Text,
} from '@/components/ui';
import { useHousehold } from '@/lib/household';
import { useMutation, useQuery } from '@/lib/hooks';
import { useAuth } from '@/lib/session';
import type { Place } from '@/lib/types';
import { avatarTints } from '@/theme/tokens';
import { notifyNow } from '@/lib/notifications';
import { useTheme } from '@/theme/useTheme';
import {
  addPlace,
  deletePlace,
  fetchActiveSos,
  fetchMemberLocations,
  fetchPlaces,
  normaliseBattery,
  resolveSos,
  shareMyLocation,
  stopSharing,
  timeAgo,
  triggerSos,
} from '@/features/maps/api';
import { FamilyMap, type MapFocus } from '@/features/maps/FamilyMap';
import {
  emptyPlaceDraft,
  PlaceForm,
  type PlaceCoords,
  type PlaceDraft,
} from '@/features/maps/PlaceForm';

async function readBattery(): Promise<number | null> {
  try {
    return normaliseBattery(await Battery.getBatteryLevelAsync());
  } catch {
    return null;
  }
}

/** Per-member face fill for map pins. Stable per device, like avatars. */
function tintOf(index: number | null | undefined): string {
  const i = typeof index === 'number' && Number.isFinite(index) ? index : 0;
  return avatarTints[((i % avatarTints.length) + avatarTints.length) % avatarTints.length];
}

export default function Maps() {
  const theme = useTheme();
  const { user } = useAuth();
  const { household, members, profile } = useHousehold();
  const write = useMutation();
  const sosWrite = useMutation();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<PlaceDraft>(emptyPlaceDraft);
  const [coords, setCoords] = useState<PlaceCoords | null>(null);
  const [locating, setLocating] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Place | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  // Bumps every fly-to so re-tapping the same row still moves the map.
  const focusSeq = useRef(0);
  // While fingers are on the map the page must not scroll — Leaflet owns it.
  const [mapLock, setMapLock] = useState(false);
  // Local GPS fix: shown as your pin, published only on Check in.
  const [myPos, setMyPos] = useState<PlaceCoords | null>(null);
  const centredOnMe = useRef(false);
  const [confirmSos, setConfirmSos] = useState(false);

  const householdId = household?.id ?? null;
  const userId = user?.id ?? null;

  const placesQuery = useQuery(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    return fetchPlaces(householdId);
  }, [householdId]);

  const liveQuery = useQuery(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    return fetchMemberLocations(householdId);
  }, [householdId]);

  const sosQuery = useQuery(async () => {
    if (!householdId) return [];
    return fetchActiveSos(householdId);
  }, [householdId]);

  // SOS is a shared flag — poll so a member who missed the moment still
  // sees the banner without pulling to refresh.
  useEffect(() => {
    if (!householdId) return;
    const timer = setInterval(() => {
      void sosQuery.refetch();
    }, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  // Opening the tab fixes YOUR position locally: a pin on the map,
  // nothing written anywhere. Sharing stays an explicit tap.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (permission.status !== 'granted') {
        setLocationNotice('Allow location access to see yourself on the map.');
        return;
      }
      try {
        const position = await Location.getCurrentPositionAsync({
          // Highest: GPS-level fix (~5m). Balanced (cell/wifi) wandered
          // whole streets — that was the "wrong location" report.
          accuracy: Location.Accuracy.Highest,
        });
        if (cancelled) return;
        const fix = { lat: position.coords.latitude, lng: position.coords.longitude };
        setMyPos(fix);
        // First fix centres the map on you, like the reference app.
        if (!centredOnMe.current) {
          centredOnMe.current = true;
          focusSeq.current += 1;
          setFocus({ lat: fix.lat, lng: fix.lng, key: `me-${focusSeq.current}` });
        }
      } catch {
        if (!cancelled)
          setLocationNotice('Could not read your location. Step outside and try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const places = useMemo(() => placesQuery.data ?? [], [placesQuery.data]);
  const locationsByUser = useMemo(
    () => new Map((liveQuery.data ?? []).map((row) => [row.user_id, row])),
    [liveQuery.data],
  );
  const sosAlerts = useMemo(() => sosQuery.data ?? [], [sosQuery.data]);
  const sosIds = useMemo(() => new Set(sosAlerts.map((alert) => alert.triggered_by)), [sosAlerts]);
  const myLocation = userId ? (locationsByUser.get(userId) ?? null) : null;

  const headMember = useMemo(
    () => members.find((member) => member.role === 'owner') ?? null,
    [members],
  );
  const headPhone = headMember?.profile?.phone?.trim() || null;

  const pins = useMemo(
    () => [
      ...places.map((place) => ({
        id: place.id,
        kind: 'place' as const,
        label: place.name,
        lat: place.lat,
        lng: place.lng,
      })),
      ...members
        .filter((member) => locationsByUser.has(member.user_id))
        .map((member) => {
          const row = locationsByUser.get(member.user_id);
          const name = member.profile?.display_name ?? 'Member';
          return {
            id: `member-${member.user_id}`,
            kind: 'member' as const,
            label: name,
            lat: row?.lat ?? 0,
            lng: row?.lng ?? 0,
            avatarUrl: member.profile?.avatar_url ?? null,
            initials: initialsOf(name),
            color: tintOf(member.profile?.avatar_index),
            sos: sosIds.has(member.user_id),
            isMe: member.user_id === userId,
          };
        }),
      // Your GPS before you share: local-only pin, never published.
      ...(myLocation || !myPos || !userId
        ? []
        : [
            {
              id: 'me-local',
              kind: 'member' as const,
              label: `${profile?.display_name ?? 'You'} (you)`,
              lat: myPos.lat,
              lng: myPos.lng,
              avatarUrl: profile?.avatar_url ?? null,
              initials: initialsOf(profile?.display_name ?? 'You'),
              color: tintOf(profile?.avatar_index),
              sos: false,
              isMe: true,
            },
          ]),
    ],
    [places, members, locationsByUser, myLocation, myPos, userId, profile, sosIds],
  );

  const loading = placesQuery.loading || liveQuery.loading;
  const error = placesQuery.error ?? liveQuery.error;
  const refreshing = placesQuery.refreshing || liveQuery.refreshing;

  function refresh() {
    void Promise.all([placesQuery.refetch(), liveQuery.refetch(), sosQuery.refetch()]);
  }

  /** Foreground position, with family-readable failures. Null means "stopped". */
  async function readPosition(): Promise<PlaceCoords | null> {
    setLocationNotice(null);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setLocationNotice('Allow location access to share where you are.');
      return null;
    }
    try {
      const position = await Location.getCurrentPositionAsync({
        // Same GPS-level fix for shares and saved-place pins.
        accuracy: Location.Accuracy.Highest,
      });
      return { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch {
      setLocationNotice('Could not read your location. Step outside and try again.');
      return null;
    }
  }

  async function shareNow() {
    if (!householdId || !userId) return;
    tapFeedback();
    const [pos, battery] = await Promise.all([readPosition(), readBattery()]);
    if (!pos) return;
    const ok = await write.run(() =>
      shareMyLocation({ householdId, userId, lat: pos.lat, lng: pos.lng, batteryLevel: battery }),
    );
    if (!ok) return;
    successFeedback();
    await liveQuery.refetch();
  }

  async function stop() {
    if (!userId) return;
    const ok = await write.run(() => stopSharing(userId));
    if (!ok) return;
    await liveQuery.refetch();
  }

  function callHead() {
    if (!headPhone) {
      setLocationNotice('The head has no phone number yet — add one in Settings → Profile.');
      return;
    }
    const digits = headPhone.replace(/[^+0-9]/g, '');
    if (!digits) {
      setLocationNotice('The head has no phone number yet — add one in Settings → Profile.');
      return;
    }
    void Linking.openURL(`tel:${digits}`);
  }

  async function sendSos() {
    if (!householdId || !userId) return;
    setConfirmSos(false);
    const ok = await sosWrite.run(() => triggerSos({ householdId, userId }));
    if (!ok) return;
    successFeedback();
    await sosQuery.refetch();
    // Status-bar confirmation on this phone (dev builds only — Expo Go has
    // no notification native side at all). Family phones get the in-app flag.
    void notifyNow(
      'SOS sent',
      `${household?.name?.trim() || 'Your home'} was alerted — calling the head now.`,
    );
    // The call is the urgent half; the flag above is the shared half.
    callHead();
  }

  async function resolveAlert(id: string) {
    const ok = await sosWrite.run(() => resolveSos(id));
    if (!ok) return;
    await sosQuery.refetch();
  }

  function openSheet() {
    tapFeedback();
    setDraft(emptyPlaceDraft);
    setCoords(null);
    setShowErrors(false);
    setSheetError(null);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setDraft(emptyPlaceDraft);
    setCoords(null);
    setShowErrors(false);
    setSheetError(null);
    setConfirmDelete(null);
  }

  async function captureForPlace() {
    setLocating(true);
    const pos = await readPosition();
    setLocating(false);
    if (pos) {
      setCoords(pos);
      setSheetError(null);
    } else {
      setSheetError('Pin your current spot first.');
    }
  }

  async function savePlace() {
    if (!householdId || !userId) return;
    if (!draft.name.trim()) {
      setShowErrors(true);
      return;
    }
    if (!coords) {
      setSheetError('Pin your current spot first.');
      return;
    }
    const ok = await write.run(() =>
      addPlace({
        householdId,
        userId,
        name: draft.name,
        note: draft.note.trim() ? draft.note.trim() : null,
        lat: coords.lat,
        lng: coords.lng,
      }),
    );
    if (!ok) return;
    successFeedback();
    closeSheet();
    await placesQuery.refetch();
  }

  async function removePlace() {
    if (!confirmDelete) return;
    const ok = await write.run(() => deletePlace(confirmDelete.id));
    setConfirmDelete(null);
    if (!ok) return;
    if (sheetOpen) closeSheet();
    await placesQuery.refetch();
  }

  function flyTo(place: Place) {
    tapFeedback();
    focusSeq.current += 1;
    setFocus({ lat: place.lat, lng: place.lng, key: `${place.id}-${focusSeq.current}` });
  }

  const latestSos = sosAlerts[0] ?? null;
  const latestSosSender = latestSos
    ? (members.find((member) => member.user_id === latestSos.triggered_by)?.profile?.display_name ??
      'Someone')
    : null;
  const sharingCount = members.filter((member) => locationsByUser.has(member.user_id)).length;

  // The one line that matters under the heading: am I live, and how fresh?
  const myStatus = myLocation
    ? `Sharing${myLocation.battery_level != null ? ` · ${myLocation.battery_level}%` : ''} · updated ${timeAgo(myLocation.updated_at)}`
    : myPos
      ? 'Not sharing'
      : undefined;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} scrollEnabled={!mapLock}>
      <ScreenHeader title="Map" subtitle={myStatus} />

      {loading ? (
        <LoadingState label="Loading the map…" />
      ) : error || !householdId ? (
        <ErrorState message={error ?? 'Join or create a home first.'} onRetry={refresh} />
      ) : (
        <StackLayout gap="lg">
          {latestSos ? (
            <Card tone="negative">
              <View style={styles.sosRow}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong" tone="negative" numberOfLines={1}>
                    {`SOS · ${latestSosSender}`}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {`${timeAgo(latestSos.created_at)}${sosAlerts.length > 1 ? ` · +${sosAlerts.length - 1} more` : ''}`}
                  </Text>
                </View>
                <Button
                  label="All safe"
                  size="sm"
                  variant="tertiary"
                  loading={sosWrite.pending}
                  onPress={() => void resolveAlert(latestSos.id)}
                />
              </View>
            </Card>
          ) : null}

          {/* Clears the stuck settings circle: the one-line header is
              shorter than the button, so the map drops a step. */}
          <Animated.View entering={FadeInUp.duration(350)} style={{ marginTop: theme.spacing.lg }}>
            <FamilyMap
              pins={pins}
              focus={focus}
              onInteractionStart={() => setMapLock(true)}
              onInteractionEnd={() => setMapLock(false)}
              sharing={myLocation !== null}
              sharePending={write.pending}
              sosPending={sosWrite.pending}
              onSharePress={() => (myLocation ? void stop() : void shareNow())}
              onSosPress={() => setConfirmSos(true)}
            />
          </Animated.View>

          {(locationNotice ?? write.error ?? sosWrite.error) ? (
            <Text variant="caption" tone="negative">
              {locationNotice ?? write.error ?? sosWrite.error}
            </Text>
          ) : null}

          <View>
            <SectionHeader label={`Family · ${sharingCount} sharing`} />
            <ListSection>
              {members.map((member) => {
                const live = locationsByUser.get(member.user_id) ?? null;
                const own = member.user_id === userId;
                const inSos = sosIds.has(member.user_id);
                return (
                  <Row
                    key={member.user_id}
                    accessibilityLabel={`${member.profile?.display_name ?? 'Member'}, ${
                      live ? `sharing, battery ${live.battery_level ?? 'unknown'}` : 'not sharing'
                    }`}
                  >
                    <Avatar
                      name={member.profile?.display_name}
                      tintIndex={member.profile?.avatar_index ?? 0}
                      uri={member.profile?.avatar_url}
                      size={44}
                    />
                    <View style={styles.flex}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {`${member.profile?.display_name ?? 'Member'}${own ? ' · you' : ''}`}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {live ? `Updated ${timeAgo(live.updated_at)}` : 'Not sharing'}
                      </Text>
                    </View>
                    {live?.battery_level != null ? (
                      <View style={styles.batteryPill}>
                        <Icon name="BatteryMedium" size={16} tone="muted" />
                        <Text variant="label" numberOfLines={1}>
                          {`${live.battery_level}%`}
                        </Text>
                      </View>
                    ) : null}
                    {inSos ? <Badge label="SOS" tone="negative" /> : null}
                  </Row>
                );
              })}
            </ListSection>
          </View>

          <View>
            <SectionHeader
              label="Saved places"
              action={
                <Button label="Save a place" size="sm" variant="tertiary" onPress={openSheet} />
              }
            />
            {places.length === 0 ? (
              <Card>
                <EmptyState
                  icon="House"
                  title="No saved places"
                  message="Pin Home or School at your current spot so everyone finds it."
                  actionLabel="Save a place"
                  onAction={openSheet}
                />
              </Card>
            ) : (
              <ListSection>
                {places.map((place) => (
                  <Row
                    key={place.id}
                    onPress={() => flyTo(place)}
                    accessibilityLabel={`Show ${place.name} on the map`}
                    accessibilityHint="Centres the map on this place"
                  >
                    <View style={styles.flex}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {place.name}
                      </Text>
                      {place.note?.trim() ? (
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {place.note.trim()}
                        </Text>
                      ) : null}
                    </View>
                    <IconButton
                      icon={<Icon name="X" size={20} tone="faint" />}
                      label={`Delete ${place.name}`}
                      onPress={() => setConfirmDelete(place)}
                    />
                  </Row>
                ))}
              </ListSection>
            )}
          </View>
        </StackLayout>
      )}

      <Sheet
        visible={sheetOpen}
        onClose={closeSheet}
        title="Save a place"
        footer={
          <View style={styles.footer}>
            <Button
              label="Save place"
              fullWidth
              loading={write.pending}
              onPress={() => void savePlace()}
            />
            {(sheetError ?? write.error) ? (
              <Text variant="caption" tone="negative" style={styles.center}>
                {sheetError ?? write.error}
              </Text>
            ) : null}
          </View>
        }
      >
        <PlaceForm
          draft={draft}
          onChange={setDraft}
          onSubmit={() => void savePlace()}
          coords={coords}
          locating={locating}
          onUseMyLocation={() => void captureForPlace()}
          showErrors={showErrors}
        />
      </Sheet>

      <ConfirmDialog
        visible={confirmDelete !== null}
        title={`Delete ${confirmDelete?.name ?? 'place'}?`}
        message="Everyone in the home loses this pin."
        confirmLabel="Delete"
        destructive
        pending={write.pending}
        onConfirm={() => void removePlace()}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        visible={confirmSos}
        title="Send SOS?"
        message={
          headPhone
            ? 'Every member sees the flag and the head gets called now.'
            : 'Every member sees the flag. Add the head’s number in Settings so the call goes through.'
        }
        confirmLabel="Send SOS + call head"
        destructive
        pending={sosWrite.pending}
        onConfirm={() => void sendSos()}
        onCancel={() => setConfirmSos(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  footer: { gap: 8 },
  center: { textAlign: 'center' },
  sosRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  batteryPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
