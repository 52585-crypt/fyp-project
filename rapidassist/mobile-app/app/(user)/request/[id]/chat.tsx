import { useLocalSearchParams } from "expo-router";
import { RequestChatThread } from "../../../../src/screens/common/RequestChatThread";

export default function RequestChat() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <RequestChatThread requestId={id} title="Chat" subtitle="Message your assigned provider." />;
}
