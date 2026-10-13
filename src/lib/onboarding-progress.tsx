import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import { getStored, setStored } from '@/lib/storage';

const INVITE_KEY = 'home-os.onboarding.invite';

type OnboardingProgressValue = {
  /** False only between joining a household and seeing the invite step. */
  inviteSeen: boolean;
  markInvitePending: () => void;
  markInviteSeen: () => void;
};

const OnboardingProgressContext = createContext<OnboardingProgressValue>({
  inviteSeen: true,
  markInvitePending: () => {},
  markInviteSeen: () => {},
});

/**
 * A missing value means an account from before the invite step existed — those
 * people go straight to the app and never see it. Only a fresh sign-up that
 * explicitly marks the step pending has to pass through it.
 */
function readInitialInviteSeen(): boolean {
  return getStored(INVITE_KEY) !== 'pending';
}

export function OnboardingProgressProvider({ children }: { children: ReactNode }) {
  // Lazy initialiser so the very first render — and therefore the first
  // redirect decision — already carries the right value.
  const [inviteSeen, setInviteSeen] = useState<boolean>(readInitialInviteSeen);

  const markInvitePending = useCallback(() => {
    setStored(INVITE_KEY, 'pending');
    setInviteSeen(false);
  }, []);

  const markInviteSeen = useCallback(() => {
    setStored(INVITE_KEY, 'seen');
    setInviteSeen(true);
  }, []);

  return (
    <OnboardingProgressContext.Provider value={{ inviteSeen, markInvitePending, markInviteSeen }}>
      {children}
    </OnboardingProgressContext.Provider>
  );
}

export function useOnboardingProgress(): OnboardingProgressValue {
  return useContext(OnboardingProgressContext);
}
