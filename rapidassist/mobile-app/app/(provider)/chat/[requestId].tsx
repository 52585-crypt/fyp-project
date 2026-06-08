import React from "react";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { RequestChatThread } from "../../../src/screens/common/RequestChatThread";
import { BottomNav } from "../../../src/ui/components";

export default function ProviderRequestChat() {
  const params = useLocalSearchParams<{ requestId?: string }>();

  return (
    <View style={{ flex: 1 }}>
      <RequestChatThread
        requestId={params.requestId}
        title="Customer Chat"
        subtitle="Message the customer for this job."
      />
      <BottomNav role="provider" active="Jobs" />
    </View>
  );
}
