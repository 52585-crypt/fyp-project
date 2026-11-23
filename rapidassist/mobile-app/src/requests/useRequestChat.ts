import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { onReconnected } from "../services/networkManager";
import { createSocket } from "../services/socket";
import { getRequestMessages, sendRequestMessage } from "./requests.api";
import type { ChatMessage } from "./requests.types";

const POLL_MS = 15000;
const addUnique = (list: ChatMessage[], m: ChatMessage) => (list.some((x) => x.id === m.id) ? list : [...list, m]);

/** Request chat: initial load, 15s poll, reload on reconnect, live socket messages, idempotent send. */
export function useRequestChat(requestId: string | null) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ requestId: string; text: string; id: string } | null>(null);

  const load = useCallback(async () => {
    if (!token || !requestId) { setLoading(false); return; }
    try { setError(null); setMessages(await getRequestMessages(token, requestId)); }
    catch (e: any) { setError(e?.response?.data?.message || e?.message || "Failed to load chat"); }
    finally { setLoading(false); }
  }, [requestId, token]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, POLL_MS);
    const stopReconnect = onReconnected(() => { void load(); });
    return () => { clearInterval(timer); stopReconnect(); };
  }, [load]);

  useEffect(() => {
    if (!token || !requestId) return;
    const socket = createSocket(token);
    socket.on("chat:message", (event: { requestId?: string; message?: ChatMessage }) => {
      if (event.requestId === requestId && event.message) setMessages((c) => addUnique(c, event.message!));
    });
    socket.connect();
    return () => { socket.disconnect(); };
  }, [requestId, token]);

  async function send() {
    const text = body.trim();
    if (!token || !requestId || !text || sending) return;
    setSending(true);
    setError(null);
    try {
      if (pending.current?.requestId !== requestId || pending.current.text !== text) {
        pending.current = { requestId, text, id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
      }
      const message = await sendRequestMessage(token, requestId, text, pending.current.id);
      setMessages((c) => addUnique(c, message));
      setBody("");
      pending.current = null;
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to send message");
    } finally { setSending(false); }
  }

  return { messages, body, setBody, loading, sending, error, send, reload: load, myId: user?.id, canSend: Boolean(token && requestId && body.trim()) };
}
