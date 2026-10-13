/**
 * Shared bits for the two-step setup flow.
 *
 * Step 1 (account) runs before step 2 (home choice), and by the time the home
 * choice is made the user is already signed in — so the choice is applied
 * immediately. Nothing needs to be carried across screens or restarts.
 */

/** Normalise a code the way the database does: uppercase, no spaces. */
export function normaliseCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 6);
}

export const CODE_LENGTH = 6;

/** The three screens of sign-up, in order. Shared by each step's stepper. */
export const ONBOARDING_STEPS = ['Account', 'Home', 'Invite'] as const;
