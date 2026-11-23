import React, { type ComponentProps, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { router, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { RequestPriority, RequestStatus } from "../../requests/requests.types";
import { PrimaryButton as BasePrimaryButton } from "../components";
import { tokens } from "../../theme/tokens";

type IconName = ComponentProps<typeof Ionicons>["name"];

export const customerColors = {
  ...tokens.colors,
  canvas: "#F6F8F7",
  brand: "#08764F",
  brandPressed: "#066542",
  brandSoft: "#E7F5ED",
  border: "#DFE7E2",
  ink: "#17241E",
  inkMuted: "#4F6158"
};

const tabs = [
  { label: "Home", icon: "home-outline", activeIcon: "home", href: "/(user)/home" },
  { label: "Services", icon: "construct-outline", activeIcon: "construct", href: "/(user)/request" },
  { label: "Activity", icon: "receipt-outline", activeIcon: "receipt", href: "/(user)/tracking" },
  { label: "Profile", icon: "person-outline", activeIcon: "person", href: "/(user)/customer/profile" }
] as const satisfies ReadonlyArray<{ label: string; icon: IconName; activeIcon: IconName; href: Href }>;

type CustomerTab = typeof tabs[number]["label"];

/** @deprecated Real expo-router Tabs render the tab bar now. */
export function BottomNavigation(_props: { active: CustomerTab }) {
  return null;
}

function LegacyBottomNavigation({ active }: { active: CustomerTab }) {
  const { bottom } = useSafeAreaInsets();
  return (
    <View style={[styles.navSurface, { paddingBottom: Math.max(bottom, 6) }]}>
      <View accessibilityRole="tablist" style={styles.nav}>
        {tabs.map(({ label, icon, activeIcon, href }) => {
          const selected = active === label;
          return (
            <Pressable key={label} accessibilityRole="tab" accessibilityLabel={label}
              accessibilityState={{ selected }} onPress={() => { if (!selected) router.replace(href); }}
              style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}>
              <View style={[styles.navIcon, selected && styles.navIconSelected]}>
                <Ionicons name={selected ? activeIcon : icon} size={20}
                  color={selected ? customerColors.brandPressed : customerColors.inkMuted} />
              </View>
              <Text style={[styles.navLabel, selected && styles.navLabelSelected]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function CustomerScreen({ active, header, children }: {
  active: CustomerTab;
  header: ReactNode;
  children: ReactNode;
}) {
  const focused = useIsFocused();
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      {focused ? <StatusBar style="dark" /> : null}
      {header}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
      >
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function AppHeader({ title, back, brand, right }: {
  title: string;
  back?: boolean;
  brand?: boolean;
  right?: ReactNode;
}) {
  return (
    <View style={styles.headerSurface}>
      <View style={styles.header}>
        {back ? <IconButton icon="arrow-back" label="Back" onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(user)/home");
        }} /> : null}
        {brand ? <IconTile icon="shield-checkmark" solid /> : null}
        <Text accessibilityRole="header" style={[styles.headerTitle, brand && styles.wordmark]}>{title}</Text>
        {right}
      </View>
    </View>
  );
}

export function IconButton({ icon, label, onPress, unread }: {
  icon: IconName;
  label: string;
  onPress: () => void;
  unread?: number;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <Ionicons name={icon} size={22} color={customerColors.ink} />
      {unread ? <View style={styles.notificationDot} /> : null}
    </Pressable>
  );
}

export function IconTile({ icon, solid = false }: { icon: IconName; solid?: boolean }) {
  return (
    <View style={[styles.iconTile, solid && styles.solidTile]}>
      <Ionicons name={icon} size={21} color={solid ? customerColors.surface : customerColors.brand} />
    </View>
  );
}

export function PrimaryButton(props: ComponentProps<typeof BasePrimaryButton>) {
  return <BasePrimaryButton {...props} accessibilityLabel={props.title} />;
}

export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={styles.sectionHeading}>{children}</Text>;
}

export function ServiceCard({ title, icon, onPress }: {
  title: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title}
      onPress={onPress} style={({ pressed }) => [styles.service, pressed && styles.pressed]}>
      <IconTile icon={icon} />
      <Text style={styles.serviceTitle}>{title}</Text>
    </Pressable>
  );
}

function DetailCard({ label, value, icon, expanded, onPress, children }: {
  label: string;
  value: string;
  icon: IconName;
  expanded: boolean;
  onPress: () => void;
  children?: ReactNode;
}) {
  return (
    <Surface style={styles.detail}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
        accessibilityLabel={`${label}, ${value}`} onPress={onPress}
        style={({ pressed }) => [styles.detailRow, pressed && styles.pressed]}>
        <IconTile icon={icon} />
        <View style={styles.detailCopy}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-forward"} size={18} color={customerColors.inkMuted} />
      </Pressable>
      {expanded ? <View style={styles.detailBody}>{children}</View> : null}
    </Surface>
  );
}

export const LocationCard = DetailCard;

export function VehicleCard(props: Omit<ComponentProps<typeof DetailCard>, "icon" | "label">) {
  return <DetailCard {...props} label="Vehicle" icon="car-outline" />;
}

export function ChoiceGroup<T extends string>({ label, options, value, onChange, hideLabel }: {
  label: string;
  options: ReadonlyArray<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
  hideLabel?: boolean;
}) {
  return (
    <View style={styles.choices}>
      {hideLabel ? null : <Text style={styles.label}>{label}</Text>}
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.choiceRow}>
        {options.map((item) => (
          <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={item.label}
            accessibilityState={{ checked: value === item.value }} onPress={() => onChange(item.value)}
            style={({ pressed }) => [styles.choice, value === item.value && styles.selected, pressed && styles.pressed]}>
            <Text style={[styles.choiceLabel, value === item.value && styles.choiceLabelSelected]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const priorities: ReadonlyArray<{ label: string; value: RequestPriority }> = [
  { label: "Normal", value: "normal" }, { label: "High", value: "high" }, { label: "Urgent", value: "urgent" }
];

export function PrioritySelector({ value, onChange }: {
  value: RequestPriority;
  onChange: (value: RequestPriority) => void;
}) {
  return (
    <Surface>
      <SectionHeading>Priority</SectionHeading>
      <ChoiceGroup label="Priority" hideLabel options={priorities} value={value} onChange={onChange} />
    </Surface>
  );
}

const statusLabels: Record<RequestStatus, string> = {
  pending: "Request received",
  searching_provider: "Finding a provider",
  provider_assigned: "Provider assigned",
  provider_on_way: "On the way",
  provider_arrived: "Provider arrived",
  in_progress: "In progress",
  waiting_user_approval: "Awaiting approval",
  vehicle_loaded: "Vehicle loaded",
  reached_destination: "At destination",
  fuel_delivered: "Fuel delivered",
  inspection_started: "Inspection started",
  extra_work_requested: "Approval needed",
  work_started: "Repair started",
  service_finished: "Service finished",
  completed: "Completed",
  cancelled: "Cancelled"
};

export function StatusBadge({ status, unavailable = false }: { status: RequestStatus; unavailable?: boolean }) {
  const warning = unavailable || ["searching_provider", "waiting_user_approval", "extra_work_requested", "pending"].includes(status);
  const cancelled = status === "cancelled";
  const ink = cancelled ? customerColors.statusDanger : warning ? customerColors.statusWarning : customerColors.brand;
  const tint = cancelled ? customerColors.statusDangerSoft : warning ? customerColors.statusWarningSoft : customerColors.brandSoft;
  return (
    <View style={[styles.badge, { backgroundColor: tint }]}>
      <View style={[styles.badgeDot, { backgroundColor: ink }]} />
      <Text style={[styles.badgeLabel, { color: ink }]}>{unavailable ? "No provider found" : statusLabels[status]}</Text>
    </View>
  );
}

export function SummaryCard({ title, items, total, note }: {
  title: string;
  items: ReadonlyArray<{ label: string; value: string }>;
  total?: string;
  note?: string;
}) {
  return (
    <Surface>
      <View style={customerStyles.row}>
        <IconTile icon="receipt-outline" />
        <View style={styles.detailCopy}><SectionHeading>{title}</SectionHeading></View>
      </View>
      {items.map(({ label, value }) => (
        <View key={label} style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{label}</Text>
          <Text style={styles.summaryValue}>{value}</Text>
        </View>
      ))}
      {total !== undefined ? (
        <View style={[styles.summaryRow, styles.summaryTotal]}>
          <Text style={styles.totalLabel}>Estimated total</Text>
          <Text style={styles.totalValue}>{total}</Text>
        </View>
      ) : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </Surface>
  );
}

export function MetricStrip({ items }: {
  items: ReadonlyArray<{ icon: IconName; label: string; value: string }>;
}) {
  return (
    <View style={styles.metrics} accessibilityLiveRegion="polite">
      {items.map(({ icon, label, value }) => (
        <View key={label} style={styles.metric}>
          <Ionicons name={icon} size={19} color={customerColors.brand} />
          <View style={styles.detailCopy}>
            <Text style={customerStyles.muted}>{label}</Text>
            <Text style={styles.totalLabel}>{value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export const customerStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { flexGrow: 1, flexBasis: 85, minHeight: 46, paddingHorizontal: 8, borderColor: customerColors.border },
  primary: { backgroundColor: customerColors.brand, borderColor: customerColors.brand, minHeight: 50, borderRadius: 10 },
  muted: { color: customerColors.inkMuted, fontSize: 13, lineHeight: 19 },
  input: {
    minHeight: 46, borderColor: customerColors.border, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: customerColors.ink,
    backgroundColor: customerColors.surface
  }
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: customerColors.surface },
  scroll: { flex: 1, backgroundColor: customerColors.canvas },
  scrollContent: { alignItems: "center" },
  content: { width: "100%", maxWidth: 640, padding: 16, paddingBottom: 24, gap: 12 },
  headerSurface: { backgroundColor: customerColors.surface, borderBottomColor: customerColors.border, borderBottomWidth: 1 },
  header: {
    minHeight: 60, width: "100%", maxWidth: 640, alignSelf: "center",
    paddingHorizontal: 16, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 10
  },
  headerTitle: { flex: 1, color: customerColors.ink, fontSize: 19, fontWeight: "700" },
  wordmark: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  iconButton: {
    width: 44, height: 44, alignItems: "center", justifyContent: "center",
    borderRadius: 11, borderWidth: 1, borderColor: customerColors.border, backgroundColor: customerColors.surface
  },
  notificationDot: {
    position: "absolute", top: 8, right: 9, width: 8, height: 8,
    borderRadius: 4, backgroundColor: customerColors.brand, borderWidth: 1, borderColor: customerColors.surface
  },
  iconTile: {
    width: 38, height: 38, alignItems: "center", justifyContent: "center",
    borderRadius: 10, backgroundColor: customerColors.brandSoft
  },
  solidTile: { backgroundColor: customerColors.brand },
  navSurface: { backgroundColor: customerColors.surface, borderTopWidth: 1, borderTopColor: customerColors.border },
  nav: { flexDirection: "row", width: "100%", maxWidth: 640, alignSelf: "center", paddingHorizontal: 8 },
  navItem: { flex: 1, minHeight: 54, alignItems: "center", justifyContent: "center", padding: 4, gap: 2 },
  navIcon: { width: 44, minHeight: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  navIconSelected: { backgroundColor: customerColors.brandSoft },
  navLabel: { color: customerColors.inkMuted, fontSize: 11, fontWeight: "600", textAlign: "center" },
  navLabelSelected: { color: customerColors.brandPressed, fontWeight: "800" },
  surface: { padding: 14, gap: 10, borderWidth: 1, borderColor: customerColors.border, borderRadius: 13, backgroundColor: customerColors.surface },
  sectionHeading: { color: customerColors.ink, fontSize: 17, lineHeight: 23, fontWeight: "700" },
  service: {
    flex: 1, minWidth: 82, minHeight: 90, alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderColor: customerColors.border, borderRadius: 12, backgroundColor: customerColors.surface,
    padding: 10
  },
  serviceTitle: { color: customerColors.ink, fontSize: 13, lineHeight: 17, fontWeight: "700", textAlign: "center" },
  selected: { backgroundColor: customerColors.brandSoft, borderColor: customerColors.brand },
  pressed: { opacity: 0.75 },
  detail: { padding: 0, gap: 0 },
  detailRow: { padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  detailCopy: { flex: 1, minWidth: 0, gap: 3 },
  detailBody: { padding: 12, gap: 8, borderTopColor: customerColors.border, borderTopWidth: 1 },
  label: { color: customerColors.ink, fontWeight: "700", fontSize: 13, lineHeight: 18 },
  detailValue: { color: customerColors.inkMuted, fontSize: 14, lineHeight: 20 },
  choices: { gap: 8 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    flexGrow: 1, flexBasis: "28%", minWidth: 76, minHeight: 44, paddingHorizontal: 7, paddingVertical: 6,
    backgroundColor: customerColors.surface, borderColor: customerColors.border,
    borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center"
  },
  choiceLabel: { color: customerColors.inkMuted, fontSize: 13, fontWeight: "600", textAlign: "center" },
  choiceLabelSelected: { color: customerColors.brandPressed, fontWeight: "700" },
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeLabel: { flexShrink: 1, fontSize: 12, fontWeight: "700" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  summaryLabel: { flex: 1, color: customerColors.inkMuted, fontSize: 13, lineHeight: 19 },
  summaryValue: { flexShrink: 1, color: customerColors.ink, fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "right" },
  summaryTotal: { alignItems: "center", backgroundColor: customerColors.brandSoft, borderRadius: 9, padding: 10 },
  totalLabel: { flexShrink: 1, color: customerColors.ink, fontSize: 14, fontWeight: "700" },
  totalValue: { flexShrink: 1, color: customerColors.brandPressed, fontSize: 17, fontWeight: "800", textAlign: "right" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: {
    flex: 1, minWidth: 116, minHeight: 55, flexDirection: "row", alignItems: "center",
    gap: 8, padding: 9, backgroundColor: customerColors.brandSoft, borderRadius: 9
  },
  note: { color: customerColors.inkMuted, fontSize: 12, lineHeight: 17 }
});
