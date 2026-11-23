import { Ionicons } from "@expo/vector-icons";
import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import type { IconName } from "./components/Icon";
import { tokens } from "./tokens";

/** Shared expo-router <Tabs> styling for customer and provider tab bars. */
export const tabScreenOptions: BottomTabNavigationOptions = {
  headerShown: false,
  tabBarActiveTintColor: tokens.color.primary,
  tabBarInactiveTintColor: tokens.color.subtle,
  tabBarLabelStyle: { fontFamily: tokens.font.medium, fontSize: tokens.size.micro },
  tabBarStyle: {
    backgroundColor: tokens.color.surface,
    borderTopColor: tokens.color.border,
    minHeight: tokens.sizes.tabBar,
    paddingTop: tokens.space.xs
  },
  tabBarBadgeStyle: { backgroundColor: tokens.color.danger, fontFamily: tokens.font.semibold, fontSize: tokens.size.micro }
};

/** Outline icon when idle, filled when focused. */
export function tabIcon(idle: IconName, active: IconName) {
  return ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
    <Ionicons name={focused ? active : idle} color={color} size={size} />
  );
}
