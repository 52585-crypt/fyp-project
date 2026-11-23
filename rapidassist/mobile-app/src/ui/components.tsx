import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  House,
  Wrench,
  ClipboardList,
  UserRound,
  Briefcase,
  Wallet,
  Bell
} from "lucide-react-native";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { tokens } from "../theme/tokens";
import { ui } from "./system";
import { useNotifications } from "../notifications/NotificationProvider";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
const bottomNavHeight = 78;
const screenBottomPadding = bottomNavHeight + 24;

export function AppShell({
  title,
  subtitle,
  children,
  right,
  scroll = true,
  eyebrow
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  scroll?: boolean;
  eyebrow?: string;
}) {
  const insets = useSafeAreaInsets();
  const bottomPadding = { paddingBottom: screenBottomPadding + insets.bottom };
  const body = (
    <View style={styles.content}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, bottomPadding]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={[styles.staticContent, bottomPadding]}>{body}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  tone = "default"
}: {
  children: React.ReactNode;
  style?: ViewStyle | (ViewStyle | null | undefined)[];
  tone?: "default" | "brand" | "accent" | "danger" | "muted";
}) {
  return (
    <View
      style={[
        styles.card,
        tone === "brand" ? styles.cardBrand : null,
        tone === "accent" ? styles.cardAccent : null,
        tone === "danger" ? styles.cardDanger : null,
        tone === "muted" ? styles.cardMuted : null,
        style
      ]}
    >
      {children}
    </View>
  );
}

export function TicketCard({
  ticketId,
  status,
  statusTone = "brand",
  title,
  children,
  style
}: {
  ticketId?: string;
  status?: string;
  statusTone?: "brand" | "accent" | "onWay" | "arrived" | "success" | "danger";
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle | (ViewStyle | null | undefined)[];
}) {
  return (
    <View style={[styles.ticketCard, style]}>
      {ticketId || status || title ? (
        <View style={styles.ticketHeader}>
          <View style={{ flex: 1 }}>
            {ticketId ? <Text style={styles.ticketId}>JOB TICKET #{ticketId.slice(-6).toUpperCase()}</Text> : null}
            {title ? <Text style={styles.ticketTitle}>{title}</Text> : null}
          </View>
          {status ? <StatusStamp label={status} tone={statusTone} /> : null}
        </View>
      ) : null}
      <View style={styles.ticketBody}>{children}</View>
    </View>
  );
}

export function IconBox({
  icon,
  tone = "primary"
}: {
  icon: IconName;
  tone?: "primary" | "success" | "warning" | "danger" | "dark" | "accent";
}) {
  const colorMap = {
    primary: tokens.colors.brand,
    success: tokens.colors.statusSuccess,
    warning: tokens.colors.accent,
    accent: tokens.colors.accent,
    danger: tokens.colors.statusDanger,
    dark: tokens.colors.dark
  };
  const bgMap = {
    primary: tokens.colors.brandSoft,
    success: tokens.colors.statusSuccessSoft,
    warning: tokens.colors.accentSoft,
    accent: tokens.colors.accentSoft,
    danger: tokens.colors.statusDangerSoft,
    dark: tokens.colors.canvasSubtle
  };
  return (
    <View style={[styles.iconBox, { backgroundColor: bgMap[tone] }]}>
      <Ionicons name={icon} size={20} color={colorMap[tone]} />
    </View>
  );
}

export function PrimaryButton({
  title,
  accessibilityLabel,
  onPress,
  icon,
  variant = "primary",
  disabled,
  loading,
  style
}: {
  title: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  icon?: IconName;
  variant?: "primary" | "dark" | "outline" | "danger" | "success" | "accent";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle | (ViewStyle | null | undefined)[];
}) {
  const isInactive = Boolean(disabled || loading);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isInactive, busy: Boolean(loading) }}
      disabled={isInactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "dark" ? styles.buttonDark : null,
        variant === "outline" ? styles.buttonOutline : null,
        variant === "danger" ? styles.buttonDanger : null,
        variant === "success" ? styles.buttonSuccess : null,
        variant === "accent" ? styles.buttonAccent : null,
        isInactive ? styles.buttonDisabled : null,
        pressed && !isInactive ? styles.buttonPressed : null,
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === "outline" ? tokens.colors.brand : "white"} />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={18}
              color={variant === "outline" ? tokens.colors.brand : "white"}
            />
          ) : null}
          <Text style={[styles.buttonText, variant === "outline" ? styles.buttonTextOutline : null]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({
  icon,
  label,
  error,
  style,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & { icon?: IconName; label?: string; error?: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          focused ? styles.fieldFocused : null,
          error ? styles.fieldError : null
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={error ? tokens.colors.statusDanger : focused ? tokens.colors.brand : tokens.colors.inkMuted}
          />
        ) : null}
        <TextInput
          placeholderTextColor={tokens.colors.inkSubtle}
          accessibilityLabel={label}
          {...props}
          style={[styles.input, style]}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
      </View>
      {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
    </View>
  );
}

export function StatusStamp({
  label,
  tone = "brand"
}: {
  label: string;
  tone?: "brand" | "accent" | "onWay" | "arrived" | "success" | "danger" | "primary" | "warning";
}) {
  const toneMap = {
    brand: { bg: tokens.colors.brandSoft, border: tokens.colors.brand, color: tokens.colors.brand },
    primary: { bg: tokens.colors.brandSoft, border: tokens.colors.brand, color: tokens.colors.brand },
    accent: { bg: tokens.colors.accentSoft, border: tokens.colors.accent, color: tokens.colors.accent },
    warning: { bg: tokens.colors.accentSoft, border: tokens.colors.accent, color: tokens.colors.accent },
    onWay: { bg: tokens.colors.statusOnWaySoft, border: tokens.colors.statusOnWay, color: tokens.colors.statusOnWay },
    arrived: { bg: tokens.colors.statusArrivedSoft, border: tokens.colors.statusArrived, color: tokens.colors.statusArrived },
    success: { bg: tokens.colors.statusSuccessSoft, border: tokens.colors.statusSuccess, color: tokens.colors.statusSuccess },
    danger: { bg: tokens.colors.statusDangerSoft, border: tokens.colors.statusDanger, color: tokens.colors.statusDanger }
  };
  const activeTone = toneMap[tone] || toneMap.brand;
  return (
    <View style={[styles.stamp, { backgroundColor: activeTone.bg, borderColor: activeTone.border }]}>
      <Text style={[styles.stampText, { color: activeTone.color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

export const StatusPill = StatusStamp;

export function NoticeBanner({
  title,
  message,
  tone = "warning"
}: {
  title?: string;
  message: string;
  tone?: "warning" | "danger" | "success" | "brand";
}) {
  const iconMap: Record<string, IconName> = {
    warning: "warning",
    danger: "alert-circle",
    success: "checkmark-circle",
    brand: "information-circle"
  };
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.noticeBanner,
        tone === "danger" ? styles.noticeDanger : tone === "success" ? styles.noticeSuccess : styles.noticeWarning
      ]}
    >
      <Ionicons
        name={iconMap[tone] || "warning"}
        size={20}
        color={tone === "danger" ? tokens.colors.statusDanger : tone === "success" ? tokens.colors.statusSuccess : tokens.colors.accent}
      />
      <View style={{ flex: 1 }}>
        {title ? <Text style={styles.noticeTitle}>{title}</Text> : null}
        <Text style={styles.noticeText}>{message}</Text>
      </View>
    </View>
  );
}

export function EmptyState({
  icon = "construct-outline",
  title,
  message,
  actionLabel,
  onAction
}: {
  icon?: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={icon} size={32} color={tokens.colors.inkMuted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <PrimaryButton title={actionLabel} onPress={onAction} style={{ marginTop: 14 }} />
      ) : null}
    </View>
  );
}

export function Metric({
  label,
  value,
  icon,
  detail
}: {
  label: string;
  value: string;
  icon: IconName;
  detail?: string;
}) {
  return (
    <Card style={styles.metric}>
      <View style={styles.metricTop}>
        <IconBox icon={icon} tone="primary" />
        <Text style={styles.metricLabel}>{label.toUpperCase()}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </Card>
  );
}

type LucideIconType = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

type TabConfig = {
  label: string;
  icon: LucideIconType;
  href: string;
  matchAliases?: string[];
};

export function BottomNav({ role, active }: { role: "user" | "provider"; active: string }) {
  const insets = useSafeAreaInsets();
  const { unread } = useNotifications();

  // 4 modern, minimal tabs inspired by inDrive / Uber
  const userTabs: TabConfig[] = [
    { label: "Home", icon: House, href: "/(user)/home" },
    { label: "Services", icon: Wrench, href: "/(user)/request", matchAliases: ["Request", "Services"] },
    { label: "Activity", icon: ClipboardList, href: "/(user)/tracking", matchAliases: ["Track", "Activity"] },
    { label: "Profile", icon: UserRound, href: "/(user)/customer/profile" }
  ];

  const providerTabs: TabConfig[] = [
    { label: "Home", icon: House, href: "/(provider)/dashboard" },
    { label: "Jobs", icon: Briefcase, href: "/(provider)/jobs" },
    { label: "Earn", icon: Wallet, href: "/(provider)/earnings" },
    { label: "Alerts", icon: Bell, href: "/(provider)/notifications" },
    { label: "Profile", icon: UserRound, href: "/(provider)/profile" }
  ];

  const tabs = role === "user" ? userTabs : providerTabs;

  return (
    <View
      style={[
        styles.bottomNav,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          minHeight: 64 + insets.bottom
        }
      ]}
    >
      {tabs.map((tab) => {
        const selected =
          active === tab.label ||
          Boolean(tab.matchAliases?.includes(active));
        const IconComponent = tab.icon;
        const color = selected ? tokens.colors.brand : "#94A3B8";

        return (
          <Pressable
            key={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            onPress={() => {
              if (selected) return;
              router.replace(tab.href as any);
            }}
            style={styles.navItem}
          >
            <View style={styles.navIconWrap}>
              <IconComponent size={24} color={color} strokeWidth={2} />
              {tab.label === "Alerts" && unread > 0 ? (
                <View style={styles.navBadge}>
                  <Text style={styles.navBadgeText}>{unread > 9 ? "9+" : unread}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.navText, selected ? styles.navTextActive : null]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.canvas },
  scrollContent: { paddingBottom: screenBottomPadding },
  staticContent: { flex: 1, paddingBottom: screenBottomPadding },
  content: { padding: tokens.spacing.lg, width: "100%", maxWidth: 760, alignSelf: "center" },
  header: { marginBottom: tokens.spacing.lg, marginTop: tokens.spacing.xs },
  eyebrow: {
    color: tokens.colors.brand,
    fontSize: tokens.typography.sizes.caption,
    fontWeight: "900",
    letterSpacing: tokens.typography.letterSpacing.stamped,
    marginBottom: 4
  },
  title: {
    color: tokens.colors.ink,
    fontSize: tokens.typography.sizes.displayLarge,
    fontWeight: "900",
    letterSpacing: tokens.typography.letterSpacing.tight
  },
  subtitle: {
    marginTop: 4,
    color: tokens.colors.inkMuted,
    fontSize: tokens.typography.sizes.body,
    fontWeight: "500",
    lineHeight: tokens.typography.lineHeights.body
  },
  card: {
    borderRadius: tokens.radii.md,
    borderWidth: tokens.borders.standard,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    padding: tokens.spacing.lg
  },
  cardBrand: {
    borderColor: tokens.colors.brand,
    backgroundColor: tokens.colors.surfaceRaised
  },
  cardAccent: {
    borderColor: tokens.colors.accent,
    backgroundColor: tokens.colors.accentSoft
  },
  cardDanger: {
    borderColor: tokens.colors.statusDanger,
    backgroundColor: tokens.colors.statusDangerSoft
  },
  cardMuted: {
    backgroundColor: tokens.colors.canvasSubtle,
    borderColor: tokens.colors.borderSubtle
  },
  ticketCard: {
    borderRadius: tokens.radii.md,
    borderWidth: tokens.borders.standard,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: tokens.colors.surface,
    overflow: "hidden"
  },
  ticketHeader: {
    backgroundColor: tokens.colors.canvasSubtle,
    borderBottomWidth: tokens.borders.standard,
    borderBottomColor: tokens.colors.border,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  ticketId: {
    fontSize: tokens.typography.sizes.caption,
    fontWeight: "900",
    color: tokens.colors.inkMuted,
    fontVariant: ["tabular-nums"],
    letterSpacing: tokens.typography.letterSpacing.stamped
  },
  ticketTitle: {
    fontSize: tokens.typography.sizes.headline,
    fontWeight: "800",
    color: tokens.colors.ink,
    marginTop: 2
  },
  ticketBody: {
    padding: tokens.spacing.lg
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: tokens.radii.sm,
    borderWidth: tokens.borders.hairline,
    borderColor: tokens.colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  button: {
    minHeight: tokens.touch.comfortable,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderRadius: tokens.radii.button,
    backgroundColor: tokens.colors.brand,
    borderWidth: tokens.borders.standard,
    borderColor: tokens.colors.brandDark,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  buttonPressed: {
    backgroundColor: tokens.colors.brandPressed,
    transform: [{ translateY: 1 }]
  },
  buttonDark: {
    backgroundColor: tokens.colors.dark,
    borderColor: tokens.colors.ink
  },
  buttonOutline: {
    backgroundColor: tokens.colors.surface,
    borderWidth: tokens.borders.standard,
    borderColor: tokens.colors.borderStrong
  },
  buttonDanger: {
    backgroundColor: tokens.colors.statusDanger,
    borderColor: "#991B1B"
  },
  buttonSuccess: {
    backgroundColor: tokens.colors.statusSuccess,
    borderColor: "#166534"
  },
  buttonAccent: {
    backgroundColor: tokens.colors.accent,
    borderColor: tokens.colors.accentHover
  },
  buttonDisabled: {
    opacity: 0.52
  },
  buttonText: {
    color: tokens.colors.inkInverse,
    fontSize: tokens.typography.sizes.body,
    fontWeight: "800",
    letterSpacing: 0.2,
    flexShrink: 1,
    textAlign: "center"
  },
  buttonTextOutline: {
    color: tokens.colors.ink
  },
  fieldWrap: {
    marginBottom: tokens.spacing.md
  },
  fieldLabel: {
    marginBottom: 6,
    color: tokens.colors.ink,
    fontSize: tokens.typography.sizes.bodySmall,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  field: {
    minHeight: tokens.touch.comfortable,
    borderRadius: tokens.radii.md,
    borderWidth: tokens.borders.standard,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: tokens.spacing.md
  },
  fieldFocused: {
    borderColor: tokens.colors.brand,
    backgroundColor: tokens.colors.surfaceRaised
  },
  fieldError: {
    borderColor: tokens.colors.statusDanger,
    backgroundColor: tokens.colors.statusDangerSoft
  },
  fieldErrorText: {
    marginTop: 4,
    color: tokens.colors.statusDanger,
    fontSize: tokens.typography.sizes.bodySmall,
    fontWeight: "600"
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: tokens.colors.ink,
    fontSize: tokens.typography.sizes.body,
    fontWeight: "500",
    paddingVertical: 12
  },
  stamp: {
    alignSelf: "flex-start",
    borderRadius: tokens.radii.tag,
    borderWidth: tokens.borders.hairline,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  stampText: {
    fontSize: tokens.typography.sizes.caption,
    fontWeight: "900",
    letterSpacing: tokens.typography.letterSpacing.stamped,
    fontVariant: ["tabular-nums"]
  },
  noticeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: tokens.spacing.md,
    borderRadius: tokens.radii.md,
    borderWidth: tokens.borders.standard,
    marginBottom: tokens.spacing.md
  },
  noticeWarning: {
    backgroundColor: tokens.colors.accentSoft,
    borderColor: tokens.colors.accent
  },
  noticeDanger: {
    backgroundColor: tokens.colors.statusDangerSoft,
    borderColor: tokens.colors.statusDanger
  },
  noticeSuccess: {
    backgroundColor: tokens.colors.statusSuccessSoft,
    borderColor: tokens.colors.statusSuccess
  },
  noticeTitle: {
    color: tokens.colors.ink,
    fontSize: tokens.typography.sizes.bodySmall,
    fontWeight: "800",
    marginBottom: 2
  },
  noticeText: {
    color: tokens.colors.ink,
    fontSize: tokens.typography.sizes.bodySmall,
    fontWeight: "500",
    lineHeight: 18
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacing.xxl,
    borderRadius: tokens.radii.md,
    borderWidth: tokens.borders.standard,
    borderStyle: "dashed",
    borderColor: tokens.colors.borderStrong,
    backgroundColor: tokens.colors.surfaceRaised
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: tokens.radii.md,
    backgroundColor: tokens.colors.canvasSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: tokens.spacing.md
  },
  emptyTitle: {
    color: tokens.colors.ink,
    fontSize: tokens.typography.sizes.headline,
    fontWeight: "800",
    textAlign: "center"
  },
  emptyMessage: {
    marginTop: 4,
    color: tokens.colors.inkMuted,
    fontSize: tokens.typography.sizes.body,
    textAlign: "center",
    maxWidth: 320
  },
  metric: {
    flex: 1,
    minWidth: 100,
    gap: 6,
    padding: tokens.spacing.md
  },
  metricTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4
  },
  metricValue: {
    color: tokens.colors.ink,
    fontSize: tokens.typography.sizes.displayMedium,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    letterSpacing: tokens.typography.letterSpacing.tight
  },
  metricLabel: {
    color: tokens.colors.inkMuted,
    fontSize: tokens.typography.sizes.caption,
    fontWeight: "800",
    letterSpacing: tokens.typography.letterSpacing.stamped
  },
  metricDetail: {
    color: tokens.colors.inkSubtle,
    fontSize: tokens.typography.sizes.bodySmall,
    fontWeight: "500"
  },
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    zIndex: 50,
    elevation: 8,
    shadowColor: "#0F1A15",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 6
  },
  navItem: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4
  },
  navIconWrap: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center"
  },
  navBadge: {
    position: "absolute",
    right: -6,
    top: -3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: tokens.colors.statusDanger,
    alignItems: "center",
    justifyContent: "center"
  },
  navBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
    fontVariant: ["tabular-nums"]
  },
  navText: {
    marginTop: 3,
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2
  },
  navTextActive: {
    color: tokens.colors.brand,
    fontWeight: "700"
  },
  sectionRow: {
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  sectionTitle: {
    color: tokens.colors.ink,
    fontSize: tokens.typography.sizes.bodySmall,
    fontWeight: "900",
    letterSpacing: tokens.typography.letterSpacing.stamped
  },
  sectionAction: {
    color: tokens.colors.brand,
    fontSize: tokens.typography.sizes.bodySmall,
    fontWeight: "800"
  }
});
