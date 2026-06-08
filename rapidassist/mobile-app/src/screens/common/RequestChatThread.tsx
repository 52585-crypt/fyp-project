import React, { useEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { getRequestMessages, sendRequestMessage } from "../../requests/requests.api";
import type { ChatMessage } from "../../requests/requests.types";
import { AppShell, Card, PrimaryButton } from "../../ui/components";
import { ui } from "../../ui/system";

const CHAT_REFRESH_MS = 3000;

export function RequestChatThread({
  requestId,
  title,
  subtitle
}: {
  requestId?: string;
  title: string;
  subtitle: string;
}) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = useMemo(() => Boolean(token && requestId && body.trim()), [body, requestId, token]);

  async function loadMessages() {
    if (!token || !requestId) return;
    try {
      setError(null);
      setLoading(true);
      setMessages(await getRequestMessages(token, requestId));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load chat");
    } finally {
      setLoading(false);
    }
  }

  async function onSend() {
    const text = body.trim();
    if (!token || !requestId || !text) return;

    try {
      setSending(true);
      setError(null);
      const message = await sendRequestMessage(token, requestId, text);
      setMessages((current) => [...current, message]);
      setBody("");
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    loadMessages();
    const timer = setInterval(loadMessages, CHAT_REFRESH_MS);
    return () => clearInterval(timer);
  }, [requestId, token]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppShell title={title} subtitle={subtitle} scroll={false}>
        <Card style={styles.chatCard}>
          {!requestId ? <Text style={styles.empty}>Open chat from an assigned request.</Text> : null}
          {requestId ? (
            <FlatList
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messages}
              ListEmptyComponent={<Text style={styles.empty}>{loading ? "Loading messages..." : "No messages yet."}</Text>}
              renderItem={({ item }) => {
                const mine = item.senderId === user?.id;
                return (
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                    <Text style={[styles.sender, mine ? styles.senderMine : null]}>
                      {mine ? "You" : item.sender?.name || (item.senderRole === "mechanic" ? "Provider" : "User")}
                    </Text>
                    <Text style={[styles.messageText, mine ? styles.messageTextMine : null]}>{item.body}</Text>
                    <Text style={[styles.time, mine ? styles.timeMine : null]}>
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                );
              }}
            />
          ) : null}
        </Card>

        <View style={styles.composer}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Type message..."
            placeholderTextColor={ui.colors.muted}
            style={styles.input}
            multiline
          />
          <PrimaryButton
            title={sending ? "Sending..." : "Send"}
            icon="send"
            variant="success"
            disabled={!canSend || sending}
            style={styles.sendButton}
            onPress={onSend}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </AppShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  chatCard: { flex: 1, minHeight: 0, padding: 0, overflow: "hidden" },
  messages: { padding: 12, paddingBottom: 18, gap: 10 },
  empty: { color: ui.colors.muted, fontSize: 13, fontWeight: "800", textAlign: "center", marginTop: 20 },
  bubble: { maxWidth: "82%", borderRadius: 16, padding: 11 },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: ui.colors.primary },
  bubbleOther: { alignSelf: "flex-start", backgroundColor: ui.colors.surfaceAlt, borderWidth: 1, borderColor: ui.colors.border },
  sender: { color: ui.colors.muted, fontSize: 11, fontWeight: "900", marginBottom: 4 },
  senderMine: { color: "rgba(255,255,255,0.78)" },
  messageText: { color: ui.colors.text, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  messageTextMine: { color: "white" },
  time: { marginTop: 6, color: ui.colors.muted, fontSize: 10, fontWeight: "800", alignSelf: "flex-end" },
  timeMine: { color: "rgba(255,255,255,0.72)" },
  composer: { flexDirection: "row", gap: 10, alignItems: "flex-end", marginTop: 12 },
  input: {
    flex: 1,
    minHeight: 52,
    maxHeight: 110,
    borderRadius: ui.radius.md,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
    color: ui.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "700"
  },
  sendButton: { width: 108 },
  error: { marginTop: 10, color: ui.colors.danger, fontSize: 12, fontWeight: "800" }
});
