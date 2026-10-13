/**
 * Maps data layer: saved family pins plus opt-in live locations.
 *
 * Both tables are household-visible by design (see schema.sql): places are
 * shared pins anyone may add or remove, while a live row belongs to its
 * owner — no row means "not sharing". Reads never name another member's id
 * beyond the household scope RLS already guards.
 */

import { readableError, supabase } from '@/lib/supabase';
import type { MemberLocation, Place, SosAlert } from '@/lib/types';

/** Clamp to 0-100 or drop to null when the OS gives nothing usable. */
export function normaliseBattery(level: number | null): number | null {
  if (level == null || Number.isNaN(level)) return null;
  const pct = level <= 1 ? Math.round(level * 100) : Math.round(level);
  if (pct < 0 || pct > 100) return null;
  return pct;
}

function fail(error: unknown, fallback: string): never {
  throw new Error(readableError(error) ?? fallback);
}

/** Newest first — the list reads like a log of pinned spots. */
export async function fetchPlaces(householdId: string): Promise<Place[]> {
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });
  if (error) fail(error, 'Could not load saved places.');
  return (data ?? []) as Place[];
}

export async function addPlace(args: {
  householdId: string;
  userId: string;
  name: string;
  note: string | null;
  lat: number;
  lng: number;
}): Promise<void> {
  const name = args.name.trim();
  if (!name) throw new Error('Give the place a name first.');
  const { error } = await supabase.from('places').insert({
    household_id: args.householdId,
    name,
    note: args.note,
    lat: args.lat,
    lng: args.lng,
    created_by: args.userId,
  });
  if (error) fail(error, 'Could not save that place.');
}

export async function deletePlace(id: string): Promise<void> {
  const { error } = await supabase.from('places').delete().eq('id', id);
  if (error) fail(error, 'Could not delete that place.');
}

/** Every published live row in the home. Members with no row are not sharing. */
export async function fetchMemberLocations(householdId: string): Promise<MemberLocation[]> {
  const { data, error } = await supabase
    .from('member_locations')
    .select('*')
    .eq('household_id', householdId);
  if (error) fail(error, 'Could not load family locations.');
  return (data ?? []) as MemberLocation[];
}

/**
 * Publish (or refresh) the signed-in member's own live row.
 *
 * `batteryLevel` is 0-100 or null. Homes whose table predates the
 * battery_level column get a retry without it, so sharing never breaks
 * because a migration was skipped.
 */
export async function shareMyLocation(args: {
  householdId: string;
  userId: string;
  lat: number;
  lng: number;
  batteryLevel?: number | null;
}): Promise<void> {
  const row = {
    user_id: args.userId,
    household_id: args.householdId,
    lat: args.lat,
    lng: args.lng,
    battery_level: args.batteryLevel ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('member_locations').upsert(row, { onConflict: 'user_id' });
  if (error) {
    // Column missing on older databases — share the position anyway.
    if (row.battery_level != null && /battery_level/i.test(error.message ?? '')) {
      const { battery_level: _dropped, ...withoutBattery } = row;
      const { error: retryError } = await supabase
        .from('member_locations')
        .upsert(withoutBattery, { onConflict: 'user_id' });
      if (retryError) fail(retryError, 'Could not share your location.');
      return;
    }
    fail(error, 'Could not share your location.');
  }
}

/** Remove the signed-in member's live row. Deleting is leaving, not hiding. */
export async function stopSharing(userId: string): Promise<void> {
  const { error } = await supabase.from('member_locations').delete().eq('user_id', userId);
  if (error) fail(error, 'Could not stop sharing.');
}

/** Newest active SOS first — the banner reads the first row. */
export async function fetchActiveSos(householdId: string): Promise<SosAlert[]> {
  const { data, error } = await supabase
    .from('sos_alerts')
    .select('*')
    .eq('household_id', householdId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) {
    // Table missing (migration not run yet) means "no SOS" — not a crash.
    if (/sos_alerts|relation .* does not exist/i.test(error.message ?? '')) return [];
    fail(error, 'Could not load SOS alerts.');
  }
  return (data ?? []) as SosAlert[];
}

/** Raise the household flag. The phone call itself is a tel: link. */
export async function triggerSos(args: {
  householdId: string;
  userId: string;
  message?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('sos_alerts').insert({
    household_id: args.householdId,
    triggered_by: args.userId,
    message: args.message?.trim() ? args.message.trim() : null,
  });
  if (error) fail(error, 'Could not send the SOS.');
}

/** Stand the flag down once everyone is safe. Any member may resolve. */
export async function resolveSos(id: string): Promise<void> {
  const { error } = await supabase.from('sos_alerts').update({ is_active: false }).eq('id', id);
  if (error) fail(error, 'Could not resolve the SOS.');
}

/** Latest alerts, active or stood down — the notification history. */
export async function fetchRecentSos(householdId: string, limit = 20): Promise<SosAlert[]> {
  const { data, error } = await supabase
    .from('sos_alerts')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    // Table missing (migration not run yet) means "no alerts" — not a crash.
    if (/sos_alerts|relation .* does not exist/i.test(error.message ?? '')) return [];
    fail(error, 'Could not load notifications.');
  }
  return (data ?? []) as SosAlert[];
}

/** "5m ago" / "3h ago" / "2d ago" for the family list. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
