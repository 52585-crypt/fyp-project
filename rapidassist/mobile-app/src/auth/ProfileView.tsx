import { router, type Href } from "expo-router";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Avatar, Badge, Banner, Button, Card, Header, Icon, Screen, Text, type IconName } from "../design/components";
import { tokens } from "../design/tokens";
import { getNetworkErrorMessage } from "../config/api";
import { AccountModeAction } from "./AccountModeAction";
import { useAuth } from "./AuthProvider";

export type ProfileRow = { title: string; icon: IconName; href?: Href; comingSoon?: boolean };

/** Profile tab body shared by customer and provider. */
export function ProfileView({ rows, roleLabel, extra }: { rows: ReadonlyArray<ProfileRow>; roleLabel: string; extra?: ReactNode }) {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogout() {
    setSigningOut(true);
    setError(null);
    try { await logout(); router.replace("/(auth)/welcome"); } catch (e) { setError(getNetworkErrorMessage(e)); } finally { setSigningOut(false); }
  }

  return (
    <Screen edges={["top", "left", "right"]} header={<Header title="Profile" back={false} />}>
      <Card>
        <View style={styles.row}>
          <Avatar name={user?.name} size={tokens.sizes.avatarLarge} />
          <View style={styles.flex}>
            <Text variant="title">{user?.name ?? "Your account"}</Text>
            {user?.phone ? <Text variant="bodySmall" color="muted">{user.phone}</Text> : null}
            {user?.email ? <Text variant="caption" color="muted">{user.email}</Text> : null}
            <Badge label={roleLabel} />
          </View>
        </View>
      </Card>
      {extra}
      <Card padded={false}>
        {rows.map((r, i) => (
          <Card key={r.title} padded={false} style={[styles.item, i > 0 && styles.divider]}
            onPress={r.href ? () => router.push(r.href!) : undefined} accessibilityLabel={r.title}>
            <View style={styles.itemRow}>
              <View style={styles.icon}><Icon name={r.icon} color="primary" /></View>
              <Text variant="bodyMedium" style={styles.flex}>{r.title}</Text>
              {r.comingSoon ? <Badge label="Coming soon" tone="neutral" /> : r.href ? <Icon name="chevron-forward" color="muted" size={tokens.sizes.iconSmall} /> : null}
            </View>
          </Card>
        ))}
      </Card>
      <AccountModeAction />
      {error ? <Banner tone="danger" message={error} /> : null}
      <Button title="Log out" icon="log-out-outline" variant="danger" loading={signingOut} onPress={onLogout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.lg },
  flex: { flex: 1, gap: tokens.space.xxs },
  item: { borderWidth: 0, borderRadius: 0, shadowOpacity: 0, elevation: 0, backgroundColor: tokens.color.transparent },
  divider: { borderTopWidth: tokens.sizes.hairline, borderTopColor: tokens.color.border },
  itemRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, padding: tokens.space.lg },
  icon: {
    width: tokens.sizes.iconTile - tokens.space.xs, height: tokens.sizes.iconTile - tokens.space.xs, borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.primarySoft, alignItems: "center", justifyContent: "center"
  }
});
