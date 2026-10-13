import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { File } from 'expo-file-system';

import { readableError, supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/session';
import type { Household, Member, Profile } from '@/lib/types';

/**
 * The signed-in member's household, plus the roster.
 *
 * Onboarding is a three-state journey:
 *   signed out        -> login
 *   in, no household  -> create or join
 *   in, in a household-> tabs
 *
 * `status` collapses that so screens do not each re-derive it.
 */

export type HouseholdStatus = 'loading' | 'none' | 'ready' | 'error';

type HouseholdValue = {
  status: HouseholdStatus;
  household: Household | null;
  members: Member[];
  profile: Profile | null;
  error: string | null;
  createHousehold: (name: string) => Promise<boolean>;
  joinHousehold: (code: string) => Promise<boolean>;
  /** Pass the Head title to another member. Head-only; single transaction. */
  transferHeadship: (newHeadId: string) => Promise<boolean>;
  /** Upload a profile photo from a local file URI and save its public URL. */
  updateProfilePhoto: (localUri: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  updateProfileName: (name: string) => Promise<boolean>;
  /** Save the SOS / call-me number (digits, +, spaces — whatever dials). */
  updateProfilePhone: (phone: string | null) => Promise<boolean>;
  /** Save name + colour and mark the profile complete. */
  updateProfile: (name: string, avatarIndex: number) => Promise<boolean>;
};

const HouseholdContext = createContext<HouseholdValue>({
  status: 'loading',
  household: null,
  members: [],
  profile: null,
  error: null,
  createHousehold: async () => false,
  joinHousehold: async () => false,
  transferHeadship: async () => false,
  updateProfilePhoto: async () => false,
  refresh: async () => {},
  updateProfileName: async () => false,
  updateProfilePhone: async () => false,
  updateProfile: async () => false,
});

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * `status` is derived rather than stored, so a load never has to push a
   * "loading" value into state from inside an effect. `loadedFor` records which
   * user the current data belongs to; anything else means we are still loading.
   */
  const status: HouseholdStatus = useMemo(() => {
    if (!user) return 'none';
    if (loadedFor !== user.id) return 'loading';
    if (error) return 'error';
    return household ? 'ready' : 'none';
  }, [user, loadedFor, error, household]);

  const load = useCallback(async () => {
    // The session is the source of truth, not the context `user` captured in
    // this closure. Immediately after sign-up/sign-in the closure still holds
    // the old (null) user while Supabase already has a session — early-returning
    // on that would leave the household as `none` even though the RPC just
    // succeeded, and the invite screen would bounce back to onboarding.
    let activeId = user?.id ?? null;
    if (!activeId) {
      const { data } = await supabase.auth.getUser();
      activeId = data.user?.id ?? null;
    }
    if (!activeId) return;

    // Profile is independent of membership — load it either way so the login
    // screen can greet someone by name before they join a household.
    const { data: ownProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', activeId)
      .maybeSingle();
    setProfile(ownProfile ?? null);

    // The membership row is the entry point. One row means we are in.
    const { data: membership, error: membershipError } = await supabase
      .from('household_members')
      .select('household_id, role, joined_at')
      .eq('user_id', activeId)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      setError(readableError(membershipError));
      setLoadedFor(activeId);
      return;
    }

    if (!membership) {
      setHousehold(null);
      setMembers([]);
      setError(null);
      setLoadedFor(activeId);
      return;
    }

    const householdId = membership.household_id;

    const { data: householdRow, error: householdError } = await supabase
      .from('households')
      .select('*')
      .eq('id', householdId)
      .maybeSingle();

    if (householdError) {
      setError(readableError(householdError));
      setLoadedFor(activeId);
      return;
    }

    // Roster. `household_members` gives the user ids; `profiles` gives the names.
    // Two small queries beat one hand-rolled join through PostgREST.
    const { data: roster } = await supabase
      .from('household_members')
      .select('user_id, role, joined_at')
      .eq('household_id', householdId);

    const ids = (roster ?? []).map((row) => row.user_id);
    const { data: profiles } =
      ids.length > 0
        ? await supabase.from('profiles').select('*').in('id', ids)
        : { data: [] as Profile[] };

    const profilesById = new Map((profiles ?? []).map((row) => [row.id, row]));

    setHousehold(householdRow ?? null);
    setMembers(
      (roster ?? []).map((row) => ({
        user_id: row.user_id,
        role: row.role,
        joined_at: row.joined_at,
        profile: profilesById.get(row.user_id) ?? null,
      })),
    );
    setError(null);
    setLoadedFor(activeId);
  }, [user]);

  useEffect(() => {
    // Fetching on mount is the case this rule cannot see: `load` awaits the very
    // first statement that touches state, so nothing is set synchronously here.
    // The alternative — Suspense plus a promise cache — means a data library,
    // which plan.md §4.4 rules out.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // NOTE on errors here: mutations throw WITHOUT touching context `error`.
  // That field drives the global `status` gate (error -> onboarding screen),
  // so a failed save/upload/transfer must surface only through the caller's
  // useMutation — never by poisoning global state. Only load() sets it.

  const createHousehold = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Give your home a name first.');

      const { error: createError } = await supabase.rpc('create_household', {
        p_name: trimmed,
      });

      if (createError) {
        // Throw as well as storing: callers wrap this in useMutation.run().
        // (run() now also catches `{ ok: false }` / `false` returns, but
        // throwing keeps the failure explicit at the call site — otherwise the
        // app would navigate to /invite with no household, which then bounces
        // straight back to /onboarding.)
        throw new Error(readableError(createError) ?? 'Could not create your home.');
      }

      setError(null);
      await load();
      return true;
    },
    [load],
  );

  const joinHousehold = useCallback(
    async (code: string) => {
      // Codes are 6 alphanumeric chars (e.g. K7M2QP) — see schema.sql
      // `^[0-9A-HJ-NP-Z]{6}$`. The old `.replace(/\D/g, '')` stripped every
      // letter, so joining with a real code always failed validation.
      const normalised = code.toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (normalised.length !== 6) {
        throw new Error('A Home Os code is 6 letters and numbers.');
      }

      const { error: joinError } = await supabase.rpc('join_household', {
        p_code: normalised,
      });

      if (joinError) {
        throw new Error(readableError(joinError) ?? 'We could not find a home with that code.');
      }

      setError(null);
      await load();
      return true;
    },
    [load],
  );

  const updateProfileName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Give yourself a name first.');

      let activeId = user?.id ?? null;
      if (!activeId) {
        const { data } = await supabase.auth.getUser();
        activeId = data.user?.id ?? null;
      }
      if (!activeId) throw new Error('You need to sign in first.');

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ display_name: trimmed })
        .eq('id', activeId);

      if (updateError) {
        throw new Error(readableError(updateError) ?? 'Could not save your name.');
      }

      await load();
      return true;
    },
    [load, user],
  );

  const updateProfilePhone = useCallback(
    async (phone: string | null) => {
      const trimmed = (phone ?? '').trim();
      // Empty clears the number — SOS then falls back to "no number" text.

      let activeId = user?.id ?? null;
      if (!activeId) {
        const { data } = await supabase.auth.getUser();
        activeId = data.user?.id ?? null;
      }
      if (!activeId) throw new Error('You need to sign in first.');

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ phone: trimmed ? trimmed : null })
        .eq('id', activeId);

      if (updateError) {
        throw new Error(readableError(updateError) ?? 'Could not save your number.');
      }

      await load();
      return true;
    },
    [load, user],
  );

  /**
   * Pass the Head of the House title to another member.
   *
   * The database enforces the rules (caller must be head, target must be a
   * member, exactly one head survives) inside one transaction — this just
   * forwards and reloads the roster so the badges update.
   */
  const transferHeadship = useCallback(
    async (newHeadId: string) => {
      if (!household) throw new Error('Join or create a home first.');

      const { error: transferError } = await supabase.rpc('transfer_headship', {
        p_household: household.id,
        p_new_head: newHeadId,
      });

      if (transferError) {
        throw new Error(readableError(transferError) ?? 'Could not pass on the title.');
      }

      setError(null);
      await load();
      return true;
    },
    [load, household],
  );

  /**
   * Upload a profile photo and point the profile at it.
   *
   * Storage path is `<user-id>/<timestamp>.<ext>` — unguessable and covered by
   * the avatars bucket's own-folder policies, so no RLS change was needed: the
   * URL is just a text column under the existing profiles policies. The
   * previous photo is removed best-effort so the bucket does not fill with
   * abandoned uploads.
   *
   * The file is read with the current expo-file-system `File` API (native
   * bytes) — never `fetch().arrayBuffer()` on a local URI (returns an
   * almost-empty body: the 14-byte "photos" incident) and never the deprecated
   * `readAsStringAsync` legacy function.
   */
  const updateProfilePhoto = useCallback(
    async (localUri: string) => {
      let activeId = user?.id ?? null;
      if (!activeId) {
        const { data } = await supabase.auth.getUser();
        activeId = data.user?.id ?? null;
      }
      if (!activeId) throw new Error('You need to sign in first.');

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await new File(localUri).arrayBuffer());
        // A real cropped photo is tens of KB at minimum. Anything smaller
        // means the read produced garbage — fail loudly instead of uploading it.
        if (bytes.length < 1024) throw new Error('too-small');
      } catch {
        throw new Error('Could not read that photo. Try another one.');
      }

      const path = `${activeId}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

      if (uploadError) {
        throw new Error(readableError(uploadError) ?? 'Photo upload failed. Try again.');
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(path);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', activeId);

      if (updateError) {
        // Roll back the orphaned file so a DB failure leaves no litter.
        await supabase.storage.from('avatars').remove([path]);
        throw new Error(readableError(updateError) ?? 'Could not save your photo.');
      }

      const previousUrl = profile?.avatar_url ?? null;
      if (previousUrl && previousUrl !== publicUrl) {
        const marker = '/avatars/';
        const at = previousUrl.indexOf(marker);
        if (at >= 0) {
          const oldPath = previousUrl.slice(at + marker.length);
          if (oldPath !== path) {
            await supabase.storage.from('avatars').remove([oldPath]);
          }
        }
      }

      setError(null);
      await load();
      return true;
    },
    [load, user, profile],
  );

  /**
   * Save the person's chosen name and colour, and mark the profile complete.
   *
   * Goes through the `finish_profile` RPC rather than a plain update so
   * `is_set_up` is set in the same statement — otherwise the app cannot tell a
   * finished profile from a placeholder.
   */
  const updateProfile = useCallback(
    async (name: string, avatarIndex: number) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Tell your family your name.');

      // No `!user` guard here on purpose: right after sign-up this closure
      // still holds the old null user while the session already exists. The
      // `finish_profile` RPC is authorised via auth.uid() server-side, so just
      // call it and surface whatever the database says.
      const { error: updateError } = await supabase.rpc('finish_profile', {
        p_display_name: trimmed,
        p_avatar_index: avatarIndex,
      });

      if (updateError) {
        throw new Error(readableError(updateError) ?? 'Could not save your profile.');
      }

      await load();
      return true;
    },
    [load],
  );

  const value = useMemo<HouseholdValue>(
    () => ({
      status,
      household,
      members,
      profile,
      error,
      createHousehold,
      joinHousehold,
      transferHeadship,
      updateProfilePhoto,
      refresh: load,
      updateProfileName,
      updateProfilePhone,
      updateProfile,
    }),
    [
      status,
      household,
      members,
      profile,
      error,
      createHousehold,
      joinHousehold,
      transferHeadship,
      updateProfilePhoto,
      load,
      updateProfileName,
      updateProfilePhone,
      updateProfile,
    ],
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdValue {
  return use(HouseholdContext);
}
