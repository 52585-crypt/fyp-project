import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CustomButton } from "../../components/CustomButton";
import { CustomInput } from "../../components/CustomInput";
import { appColors, radii } from "../../constants/theme";
import type { RootStackParamList } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

export function ChatScreen({ route }: Props) {
  const [message, setMessage] = useState("");
  const providerName = route.params?.providerName ?? "Provider";

  return (
    <ScreenScaffold title={`Chat with ${providerName}`} subtitle="Dummy in-app chat layout for socket integration.">
      <View style={styles.bubbleLeft}><Text style={styles.leftText}>I am on the way. Please share your exact spot.</Text></View>
      <View style={styles.bubbleRight}><Text style={styles.rightText}>I am near the main gate.</Text></View>
      <CustomInput label="Message" icon="chatbubble" value={message} onChangeText={setMessage} placeholder="Type message..." />
      <CustomButton title="Send Message" />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  bubbleLeft: { alignSelf: "flex-start", maxWidth: "82%", borderRadius: radii.md, backgroundColor: appColors.surface, borderWidth: 1, borderColor: appColors.border, padding: 12 },
  bubbleRight: { alignSelf: "flex-end", maxWidth: "82%", borderRadius: radii.md, backgroundColor: appColors.primary, padding: 12 },
  leftText: { color: appColors.text, fontSize: 13, fontWeight: "700" },
  rightText: { color: "white", fontSize: 13, fontWeight: "800" }
});
