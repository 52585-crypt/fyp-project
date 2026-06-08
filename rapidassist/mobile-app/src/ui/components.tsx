import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { router } from "expo-router";
import { ui } from "./system";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function AppShell({
  title,
  subtitle,
  children,
  right,
  scroll = true
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  scroll?: boolean;
}) {
  const body = (
    <View style={styles.content}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: 104 }} showsVerticalScrollIndicator={false}>{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function IconBox({ icon, tone = "primary" }: { icon: IconName; tone?: "primary" | "success" | "warning" | "danger" | "dark" }) {
  const colorMap = {
    primary: ui.colors.primary,
    success: ui.colors.success,
    warning: ui.colors.warning,
    danger: ui.colors.danger,
    dark: ui.colors.dark
  };
  const bgMap = {
    primary: ui.colors.primarySoft,
    success: ui.colors.successSoft,
    warning: ui.colors.warningSoft,
    danger: ui.colors.dangerSoft,
    dark: "#E5E7EB"
  };
  return (
    <View style={[styles.iconBox, { backgroundColor: bgMap[tone] }]}>
      <Ionicons name={icon} size={20} color={colorMap[tone]} />
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  icon,
  variant = "primary",
  disabled,
  style
}: {
  title: string;
  onPress?: () => void;
  icon?: IconName;
  variant?: "primary" | "dark" | "outline" | "danger" | "success";
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "dark" ? styles.buttonDark : null,
        variant === "outline" ? styles.buttonOutline : null,
        variant === "danger" ? styles.buttonDanger : null,
        variant === "success" ? styles.buttonSuccess : null,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? { opacity: 0.86 } : null,
        style
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={variant === "outline" ? ui.colors.primary : "white"} /> : null}
      <Text style={[styles.buttonText, variant === "outline" ? styles.buttonTextOutline : null]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ icon, label, ...props }: TextInputProps & { icon?: IconName; label?: string }) {
  return (
    <View>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.field}>
        {icon ? <Ionicons name={icon} size={18} color={ui.colors.muted} /> : null}
        <TextInput placeholderTextColor={ui.colors.muted} style={styles.input} {...props} />
      </View>
    </View>
  );
}

export function StatusPill({ label, tone = "primary" }: { label: string; tone?: "primary" | "success" | "warning" | "danger" }) {
  const bg = tone === "success" ? ui.colors.successSoft : tone === "warning" ? ui.colors.warningSoft : tone === "danger" ? ui.colors.dangerSoft : ui.colors.primarySoft;
  const color = tone === "success" ? ui.colors.success : tone === "warning" ? ui.colors.warning : tone === "danger" ? ui.colors.danger : ui.colors.primary;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function Metric({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <Card style={styles.metric}>
      <IconBox icon={icon} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Card>
  );
}

export function BottomNav({ role, active }: { role: "user" | "provider"; active: string }) {
  const userTabs = [
    { label: "Home", icon: "home", href: "/(user)/home" },
    { label: "Request", icon: "add-circle", href: "/(user)/request" },
    { label: "Track", icon: "navigate", href: "/(user)/tracking" },
    { label: "Profile", icon: "person", href: "/(user)/profile" }
  ] as const;
  const providerTabs = [
    { label: "Home", icon: "speedometer", href: "/(provider)/dashboard" },
    { label: "Jobs", icon: "briefcase", href: "/(provider)/jobs" },
    { label: "Earn", icon: "wallet", href: "/(provider)/earnings" },
    { label: "Profile", icon: "person", href: "/(provider)/profile" }
  ] as const;
  const tabs = role === "user" ? userTabs : providerTabs;

  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const selected = active === tab.label;
        return (
          <Pressable key={tab.label} onPress={() => router.replace(tab.href)} style={styles.navItem}>
            <Ionicons name={tab.icon} size={21} color={selected ? ui.colors.primary : ui.colors.muted} />
            <Text style={[styles.navText, selected ? styles.navTextActive : null]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.colors.bg },
  content: { padding: 18 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  title: { color: ui.colors.text, fontSize: 24, fontWeight: "900", letterSpacing: 0 },
  subtitle: { marginTop: 4, color: ui.colors.muted, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  card: { borderRadius: ui.radius.lg, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface, padding: 14, ...ui.shadow },
  iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  button: { height: 52, borderRadius: ui.radius.md, backgroundColor: ui.colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  buttonDark: { backgroundColor: ui.colors.dark },
  buttonOutline: { backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.border },
  buttonDanger: { backgroundColor: ui.colors.danger },
  buttonSuccess: { backgroundColor: ui.colors.success },
  buttonDisabled: { opacity: 0.52 },
  buttonText: { color: "white", fontSize: 15, fontWeight: "900" },
  buttonTextOutline: { color: ui.colors.primary },
  fieldLabel: { marginBottom: 7, color: ui.colors.text, fontSize: 13, fontWeight: "900" },
  field: { height: 52, borderRadius: ui.radius.md, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  input: { flex: 1, color: ui.colors.text, fontSize: 15, fontWeight: "700" },
  pill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pillText: { fontSize: 11, fontWeight: "900" },
  metric: { flex: 1, minHeight: 124, gap: 8 },
  metricValue: { color: ui.colors.text, fontSize: 19, fontWeight: "900" },
  metricLabel: { color: ui.colors.muted, fontSize: 12, fontWeight: "800" },
  bottomNav: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 78, borderTopWidth: 1, borderTopColor: ui.colors.border, backgroundColor: ui.colors.surface, flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingBottom: 8 },
  navItem: { minWidth: 62, alignItems: "center", justifyContent: "center" },
  navText: { marginTop: 4, color: ui.colors.muted, fontSize: 10, fontWeight: "900" },
  navTextActive: { color: ui.colors.primary },
  sectionRow: { marginTop: 16, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  sectionAction: { color: ui.colors.primary, fontSize: 12, fontWeight: "900" }
});

