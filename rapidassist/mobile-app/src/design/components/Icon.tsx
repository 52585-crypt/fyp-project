import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { tokens, type ColorToken } from "../tokens";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Icon({ name, size = tokens.sizes.icon, color = "text" }: { name: IconName; size?: number; color?: ColorToken }) {
  return <Ionicons name={name} size={size} color={tokens.color[color]} accessibilityElementsHidden importantForAccessibility="no" />;
}
