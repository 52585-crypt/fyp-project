import { StyleSheet, View } from "react-native";
import { tokens, type ColorToken } from "../tokens";
import { t, tp } from "../../i18n/translate";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

type Props = {
  name: string;
  /** Service name shown under the provider's name, e.g. "Car Towing". */
  serviceLabel: string;
  /** Service glyph and colours, matching the provider's map marker. */
  icon: IconName;
  accent: ColorToken;
  onAccent: ColorToken;
  rating?: number | null;
  ratingCount?: number | null;
  completedJobs: number;
  /** Coarse distance, e.g. "2–5 km". */
  distanceLabel: string;
  /** e.g. "about 7 min"; null shows a dash, or "…" while `etaLoading`. */
  etaLabel?: string | null;
  etaLoading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
  testID?: string;
};

/** Nearby-provider summary for a map marker tap or a list row: identity, rating, jobs, distance band, ETA and one action. */
export function ProviderPreviewCard({
  name, serviceLabel, icon, accent, onAccent, rating, ratingCount, completedJobs, distanceLabel, etaLabel, etaLoading,
  actionLabel, onAction, onClose, testID
}: Props) {
  const rated = rating != null && rating > 0 && Boolean(ratingCount);
  const ratingText = rated ? tp("nearby", "ratingValue", { rating: rating!.toFixed(1), count: ratingCount! }) : t("nearby", "newProvider");
  const eta = etaLoading ? "…" : etaLabel ?? "—";
  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: tokens.color[accent] }]}>
          <Icon name={icon} color={onAccent} size={tokens.sizes.icon} />
        </View>
        <View style={styles.copy}>
          <Text variant="bodyStrong" numberOfLines={1}>{name}</Text>
          <Text variant="caption" color="muted" numberOfLines={1}>{serviceLabel}</Text>
        </View>
        {onClose ? <IconButton icon="close" label={t("nearby", "closeDetails")} tone="soft" size={tokens.sizes.buttonSmall} onPress={onClose} /> : null}
      </View>
      <View style={styles.stats}>
        <Stat label={t("nearby", "rating")} accessibilityValue={ratingText}>
          {rated ? (
            <View style={styles.inline}>
              <Icon name="star" color="star" size={tokens.sizes.iconSmall - 2} />
              <Text variant="captionStrong">{rating!.toFixed(1)}</Text>
              <Text variant="caption" color="muted">({ratingCount})</Text>
            </View>
          ) : <Text variant="captionStrong">{t("nearby", "newProvider")}</Text>}
        </Stat>
        <Stat label={t("nearby", "jobs")} accessibilityValue={tp("nearby", "jobsCompleted", { count: completedJobs })}><Text variant="captionStrong">{completedJobs}</Text></Stat>
        <Stat label={t("nearby", "distance")}><Text variant="captionStrong">{distanceLabel}</Text></Stat>
        <Stat label={t("nearby", "eta")} accessibilityValue={etaLoading ? t("nearby", "etaCalculating") : etaLabel ?? t("nearby", "etaUnavailable")}>
          <Text variant="captionStrong">{eta}</Text>
        </Stat>
      </View>
      {actionLabel && onAction ? <Button title={actionLabel} icon="arrow-forward" onPress={onAction} /> : null}
    </View>
  );
}

function Stat({ label, children, accessibilityValue }: { label: string; children: React.ReactNode; accessibilityValue?: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={accessibilityValue ? `${label}: ${accessibilityValue}` : undefined}>
      <Text variant="micro" color="muted">{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: tokens.space.md },
  head: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  badge: {
    width: tokens.sizes.avatar, height: tokens.sizes.avatar, borderRadius: tokens.sizes.avatar / 2,
    alignItems: "center", justifyContent: "center"
  },
  copy: { flex: 1, gap: tokens.space.xxs },
  stats: { flexDirection: "row", gap: tokens.space.sm },
  stat: {
    flex: 1, gap: tokens.space.xxs, paddingVertical: tokens.space.sm, paddingHorizontal: tokens.space.sm,
    borderRadius: tokens.radius.control, backgroundColor: tokens.color.cloud
  },
  inline: { flexDirection: "row", alignItems: "center", gap: tokens.space.xxs }
});
