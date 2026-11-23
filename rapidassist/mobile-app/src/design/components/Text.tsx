import type { ReactNode } from "react";
import { Text as RNText, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { tokens, type ColorToken, type TextToken } from "../tokens";

type Props = Omit<TextProps, "style"> & {
  variant?: TextToken;
  color?: ColorToken;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
};

/** Typography primitive: every piece of copy goes through a token preset. */
export function Text({ variant = "body", color = "text", align, style, ...rest }: Props) {
  return <RNText {...rest} style={[tokens.text[variant], { color: tokens.color[color] }, align ? { textAlign: align } : null, style]} />;
}
