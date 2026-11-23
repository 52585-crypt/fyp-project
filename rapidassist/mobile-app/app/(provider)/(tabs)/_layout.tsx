import { Tabs } from "expo-router";
import { tabIcon, tabScreenOptions } from "../../../src/design/tabBar";
import { useNotifications } from "../../../src/notifications/NotificationProvider";

export default function ProviderTabs() {
  const { unread } = useNotifications();
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarIcon: tabIcon("home-outline", "home") }} />
      <Tabs.Screen name="jobs" options={{ title: "Jobs", tabBarIcon: tabIcon("briefcase-outline", "briefcase") }} />
      <Tabs.Screen name="earnings" options={{ title: "Earnings", tabBarIcon: tabIcon("wallet-outline", "wallet") }} />
      <Tabs.Screen
        name="inbox"
        options={{ title: "Inbox", tabBarIcon: tabIcon("mail-outline", "mail"), tabBarBadge: unread > 0 ? (unread > 9 ? "9+" : unread) : undefined }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: tabIcon("person-outline", "person") }} />
    </Tabs>
  );
}
