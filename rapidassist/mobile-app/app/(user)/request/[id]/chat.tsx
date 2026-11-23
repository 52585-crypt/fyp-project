import React from "react";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { RequestChatThread } from "../../../../src/screens/common/RequestChatThread";
import { BottomNav } from "../../../../src/ui/components";

export default function UserRequestChat() {
  const params = useLocalSearchParams<{ id?: string }>();

  return (
    <View style={{ flex: 1 }}>
      <RequestChatThread
        requestId={params.id}
        title="Request Chat"
        subtitle="Message your assigned provider."
      />
      <BottomNav role="user" active="Activity" />
    </View>
  );
}
