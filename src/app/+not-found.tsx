import { Link, Stack } from 'expo-router';

import { Screen, Text } from '@/components/ui';

/**
 * Fallback for a URL that matches no route.
 *
 * The default Expo Router 404 is unstyled and reads as a crash, so this at least
 * looks like the rest of the app and offers a way out.
 */
export default function NotFound() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Text variant="display" accessibilityRole="header">
        Not found
      </Text>
      <Text variant="body" tone="muted">
        That screen does not exist.
      </Text>
      <Link href="/" asChild>
        <Text variant="label" tone="accent">
          Go back home
        </Text>
      </Link>
    </Screen>
  );
}
