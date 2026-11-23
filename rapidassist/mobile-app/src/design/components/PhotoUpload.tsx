import { Image, StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { Badge } from "./Badge";
import { Icon, type IconName } from "./Icon";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

type Props = {
  title: string;
  /** Image URI / data URI once attached. */
  value?: string | null;
  icon?: IconName;
  optional?: boolean;
  onCamera?: () => void;
  onGallery?: () => void;
};

/** Document/photo row: preview, attached state, camera + gallery buttons. */
export function PhotoUpload({ title, value, icon = "image-outline", optional, onCamera, onGallery }: Props) {
  return (
    <View style={[styles.row, value ? styles.done : null]}>
      <View style={styles.preview}>
        {value ? <Image source={{ uri: value }} style={styles.image} accessibilityIgnoresInvertColors /> : <Icon name={icon} color="muted" />}
      </View>
      <View style={styles.copy}>
        <Text variant="bodySmallStrong">{title}</Text>
        <Badge label={value ? "Attached" : optional ? "Optional" : "Required"} tone={value ? "success" : optional ? "neutral" : "warning"} />
      </View>
      {onCamera ? <IconButton icon="camera-outline" label={`Take photo for ${title}`} onPress={onCamera} tone="soft" /> : null}
      {onGallery ? <IconButton icon="image-outline" label={`Choose photo for ${title}`} onPress={onGallery} tone="soft" /> : null}
    </View>
  );
}

const p = tokens.sizes.avatarLarge - tokens.space.sm;
const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: tokens.space.md, padding: tokens.space.md,
    borderRadius: tokens.radius.md, borderWidth: tokens.sizes.hairline, borderColor: tokens.color.border,
    borderStyle: "dashed", backgroundColor: tokens.color.surface
  },
  done: { borderStyle: "solid", borderColor: tokens.color.success },
  preview: {
    width: p, height: p, borderRadius: tokens.radius.sm, backgroundColor: tokens.color.surfaceAlt,
    alignItems: "center", justifyContent: "center", overflow: "hidden"
  },
  image: { width: "100%", height: "100%" },
  copy: { flex: 1, gap: tokens.space.xs }
});
