import type { ReactNode } from "react";
import { Text as RNText, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { hasRightToLeftText } from "../../i18n/translate";
import { tokens, type ColorToken, type TextToken } from "../tokens";

type Props = Omit<TextProps, "style"> & {
  variant?: TextToken;
  color?: ColorToken;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
};

/**
 * Typography primitive: every piece of copy goes through a token preset. Urdu text (Arabic script) runs right to
 * left and is right-aligned unless an explicit `align` is given; English text is unchanged, so labels without a
 * translation still read normally in Urdu mode. The layout itself is not mirrored.
 */
export function Text({ variant = "body", color = "text", align, style, ...rest }: Props) {
  const direction = hasRightToLeftText(rest.children)
    ? { writingDirection: "rtl" as const, textAlign: align ?? ("right" as const) }
    : align ? { textAlign: align } : null;
  return <RNText {...rest} style={[tokens.text[variant], { color: tokens.color[color] }, direction, style]} />;
}
