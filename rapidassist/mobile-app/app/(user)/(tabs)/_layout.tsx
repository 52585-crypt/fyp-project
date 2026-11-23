import { Tabs } from "expo-router";
import { tabIcon, tabScreenOptions } from "../../../src/design/tabBar";

export default function CustomerTabs() {
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: tabIcon("home-outline", "home") }} />
      <Tabs.Screen name="requests" options={{ title: "Requests", tabBarIcon: tabIcon("receipt-outline", "receipt") }} />
      <Tabs.Screen name="support" options={{ title: "Support", tabBarIcon: tabIcon("headset-outline", "headset") }} />
      <Tabs.Screen name="account" options={{ title: "Profile", tabBarIcon: tabIcon("person-outline", "person") }} />
    </Tabs>
  );
}
