import { StyleSheet, View } from "react-native";
import { Button, Card, EmptyState, ErrorState, Header, Icon, Screen, SkeletonCard, Text } from "../design/components";
import { tokens } from "../design/tokens";
import { formatDateTime } from "../utils/format";
import { useNotificationInbox } from "./useNotificationInbox";

/** In-app notifications (real /api/notifications). Used by the customer screen and the provider Inbox tab. */
export function NotificationInbox({ role }: { role: "user" | "provider" }) {
  const inbox = useNotificationInbox();
  const tab = role === "provider";
  return (
    <Screen edges={tab ? ["top", "left", "right"] : undefined} onRefresh={inbox.reload} refreshing={false}
      header={<Header title={tab ? "Inbox" : "Notifications"} back={!tab}
        right={inbox.unreadCount ? <Button title="Read all" size="small" variant="ghost" fullWidth={false} disabled={inbox.busy} onPress={inbox.readAll} /> : null} />}>
      {inbox.loading ? <><SkeletonCard lines={1} /><SkeletonCard lines={1} /></> : null}
      {inbox.error && !inbox.items ? <ErrorState message={inbox.error} onRetry={inbox.reload} /> : null}
      {inbox.items && inbox.items.length === 0 ? (
        <EmptyState icon="notifications-off-outline" title="No notifications yet" message="Job, message, approval and payment updates appear here." />
      ) : null}
      {inbox.items?.map((item) => (
        <Card key={item.id} tone={item.readAt ? "surface" : "soft"} onPress={() => void inbox.open(item)}
          accessibilityLabel={`${item.readAt ? "" : "Unread. "}${item.title}. ${item.body}`}>
          <View style={styles.row}>
            <View style={styles.icon}><Icon name="notifications-outline" color="primary" /></View>
            <View style={styles.flex}>
              <Text variant="bodySmallStrong">{item.title}</Text>
              <Text variant="bodySmall" color="muted">{item.body}</Text>
              <Text variant="micro" color="subtle">{formatDateTime(item.createdAt)}</Text>
            </View>
            {!item.readAt ? <View style={styles.dot} /> : null}
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: tokens.space.md },
  flex: { flex: 1, gap: tokens.space.xxs },
  icon: {
    width: tokens.sizes.iconTile - tokens.space.xs, height: tokens.sizes.iconTile - tokens.space.xs, borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center"
  },
  dot: { width: tokens.space.sm, height: tokens.space.sm, borderRadius: tokens.space.xs, backgroundColor: tokens.color.primary, marginTop: tokens.space.xs }
});
