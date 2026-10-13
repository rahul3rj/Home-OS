import { Tabs, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppTabBar, CircleButton, tapFeedback, usePageTop } from '@/components/ui';
import { useOverdueDeadlineCount, useUnreadSosCount } from '@/lib/notifications';
import { useTheme } from '@/theme/useTheme';

/**
 * Bottom tab bar.
 *
 * Five tabs — Home, Groceries, Maps, Tasks, Settings — rendered by the
 * custom `AppTabBar`. Money lives on as a route (reached from Home's month
 * card) without a tab; House Expenses is a pushed stack route. Goals lives
 * on Home as a section rather than a sixth tab.
 *
 * A notifications bell sticks top-right over every tab at the same spot, so
 * it is always where the thumb expects it no matter which page is open. It
 * sits in Home's own top gap (status inset + xxl), which every screen shares.
 * Seen-state lives on the device; the bell dots while another member's SOS
 * is unopened or a task deadline sits overdue.
 */
export default function TabsLayout() {
  return (
    <View style={styles.flex}>
      <Tabs
        tabBar={() => <AppTabBar />}
        screenOptions={{
          headerShown: false,
          // The bar floats over the keyboard otherwise, covering what is typed.
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="groceries" options={{ title: 'Groceries' }} />
        <Tabs.Screen name="maps" options={{ title: 'Maps' }} />
        <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs>
      <NotificationsBell />
    </View>
  );
}

/**
 * Home's lime circle, stuck on screen — now a bell. Same component, same
 * corner on every tab; the red dot is unseen SOS plus overdue deadlines.
 */
function NotificationsBell() {
  const theme = useTheme();
  const router = useRouter();
  const pageTop = usePageTop();
  const unread = useUnreadSosCount() + useOverdueDeadlineCount();

  return (
    <View
      style={[
        styles.stuck,
        {
          top: pageTop,
          right: theme.spacing.lg,
        },
      ]}
    >
      <CircleButton
        icon="Bell"
        label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        hint="Opens home alerts"
        fill="lime"
        onPress={() => {
          tapFeedback();
          router.push('/notifications');
        }}
      />
      {unread > 0 ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[
            styles.dot,
            {
              backgroundColor: theme.colors.negative,
              borderColor: theme.colors.surface,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stuck: { position: 'absolute', zIndex: 10 },
  dot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
});
