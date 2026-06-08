import React from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { appColors } from "../../constants/theme";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function ScreenScaffold({ title, subtitle, children }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: appColors.background },
  content: { padding: 18, paddingBottom: 34 },
  title: { color: appColors.text, fontSize: 22, fontWeight: "900" },
  subtitle: { marginTop: 4, color: appColors.muted, fontSize: 13, fontWeight: "700" },
  body: { marginTop: 16, gap: 12 }
});

