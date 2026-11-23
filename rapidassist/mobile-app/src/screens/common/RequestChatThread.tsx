import { FlatList, StyleSheet, TextInput, View } from "react-native";
import { Banner, EmptyState, Header, IconButton, Screen, SkeletonCard, Text } from "../../design/components";
import { tokens } from "../../design/tokens";
import { parseRequestId } from "../../requests/requestId";
import { useRequestChat } from "../../requests/useRequestChat";
import { formatTime } from "../../utils/format";

/** Chat between the customer and the assigned provider for one request (both roles). */
export function RequestChatThread({ requestId, title, subtitle }: { requestId?: string; title: string; subtitle: string }) {
  const id = parseRequestId(requestId);
  const chat = useRequestChat(id);
  return (
    <Screen scroll={false} padded={false} header={<Header title={title} />}>
      <Text variant="caption" color="muted" align="center" style={styles.subtitle}>{subtitle}</Text>
      {chat.error ? <View style={styles.pad}><Banner tone="danger" message={chat.error} /></View> : null}
      {!id ? (
        <EmptyState icon="chatbubbles-outline" title="Chat unavailable" message="Open chat from an assigned request." />
      ) : chat.loading ? (
        <View style={styles.pad}><SkeletonCard lines={2} /></View>
      ) : (
        <FlatList
          data={chat.messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon="chatbubble-ellipses-outline" title="No messages yet" message="Say hello to coordinate the pickup." />}
          renderItem={({ item }) => {
            const mine = item.senderId === chat.myId;
            const who = mine ? "You" : item.sender?.name || (item.senderRole === "mechanic" ? "Provider" : "Customer");
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]} accessible accessibilityLabel={`${who}: ${item.body}`}>
                {!mine ? <Text variant="captionStrong" color="primary">{who}</Text> : null}
                <Text variant="body" color={mine ? "onPrimary" : "text"}>{item.body}</Text>
                <Text variant="micro" color={mine ? "onPrimaryMuted" : "muted"} align="right">{formatTime(item.createdAt)}</Text>
              </View>
            );
          }}
        />
      )}
      <View style={styles.composer}>
        <TextInput
          value={chat.body}
          onChangeText={chat.setBody}
          placeholder="Type a message..."
          placeholderTextColor={tokens.color.subtle}
          accessibilityLabel="Message"
          multiline
          style={styles.input}
        />
        <IconButton icon="send" label="Send message" tone="solid" size={tokens.sizes.input}
          disabled={!chat.canSend || chat.sending} onPress={chat.send} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { paddingBottom: tokens.space.sm },
  pad: { paddingHorizontal: tokens.space.screen },
  list: { padding: tokens.space.screen, gap: tokens.space.sm, flexGrow: 1 },
  bubble: { maxWidth: "82%", borderRadius: tokens.radius.card, padding: tokens.space.md, gap: tokens.space.xs },
  mine: { alignSelf: "flex-end", backgroundColor: tokens.color.primary, borderBottomRightRadius: tokens.radius.xs },
  theirs: {
    alignSelf: "flex-start", backgroundColor: tokens.color.surface, borderWidth: tokens.sizes.hairline,
    borderColor: tokens.color.border, borderBottomLeftRadius: tokens.radius.xs
  },
  composer: {
    flexDirection: "row", alignItems: "flex-end", gap: tokens.space.sm, paddingHorizontal: tokens.space.screen,
    paddingVertical: tokens.space.md, borderTopWidth: tokens.sizes.hairline, borderTopColor: tokens.color.border,
    backgroundColor: tokens.color.surface
  },
  input: {
    flex: 1, minHeight: tokens.sizes.input, maxHeight: tokens.sizes.textArea, borderRadius: tokens.radius.md,
    borderWidth: tokens.sizes.hairline, borderColor: tokens.color.border, backgroundColor: tokens.color.bg,
    paddingHorizontal: tokens.space.md, paddingVertical: tokens.space.md, color: tokens.color.text, ...tokens.text.body
  }
});
