import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

type Props = {
  name: string;
  subtitle?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  plate?: string | null;
  onCall?: () => void;
  onChat?: () => void;
  /** "hero" = indigo assigned-provider card. */
  variant?: "plain" | "hero";
  right?: ReactNode;
};

/** Provider / customer identity row with optional call + chat buttons. */
export function PersonCard({ name, subtitle, rating, ratingCount, plate, onCall, onChat, variant = "plain", right }: Props) {
  const hero = variant === "hero";
  return (
    <View style={[styles.row, hero && styles.hero]}>
      <Avatar name={name} size={hero ? tokens.sizes.avatarLarge : tokens.sizes.avatar} inverse={hero} />
      <View style={styles.copy}>
        <Text variant={hero ? "title" : "bodyStrong"} color={hero ? "onPrimary" : "text"} numberOfLines={1}>{name}</Text>
        {rating != null && rating > 0 ? (
          <View style={styles.rating} accessibilityLabel={`Rated ${rating.toFixed(1)}`}>
            <Icon name="star" size={tokens.sizes.iconSmall - 2} color="star" />
            <Text variant="captionStrong" color={hero ? "onPrimary" : "text"}>{rating.toFixed(1)}</Text>
            {ratingCount ? <Text variant="caption" color={hero ? "onPrimaryMuted" : "muted"}>({ratingCount})</Text> : null}
          </View>
        ) : null}
        {subtitle ? <Text variant="caption" color={hero ? "onPrimaryMuted" : "muted"} numberOfLines={2}>{subtitle}</Text> : null}
        {plate ? <Badge label={plate} tone={hero ? "inverse" : "primary"} /> : null}
      </View>
      {right}
      {onCall ? <IconButton icon="call" label={`Call ${name}`} onPress={onCall} tone={hero ? "solid" : "outline"} /> : null}
      {onChat ? <IconButton icon="chatbubble-ellipses" label={`Chat with ${name}`} onPress={onChat} tone={hero ? "solid" : "soft"} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  hero: { backgroundColor: tokens.color.primary, borderRadius: tokens.radius.card, padding: tokens.space.screen, ...tokens.shadow.raised },
  copy: { flex: 1, gap: tokens.space.xxs + 1 },
  rating: { flexDirection: "row", alignItems: "center", gap: tokens.space.xs }
});
