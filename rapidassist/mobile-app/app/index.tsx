import { Redirect } from "expo-router";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text } from "react-native";
import { useAuth } from "../src/auth/AuthProvider";
import { colors } from "../src/theme/colors";

export default function Index() {
  const { isLoading, token, user } = useAuth();
  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.text}>Loading RapidAssist...</Text>
      </SafeAreaView>
    );
  }
  if (!token) return <Redirect href="/(auth)/welcome" />;
  return <Redirect href={user?.role === "mechanic" ? "/(provider)/dashboard" : "/(user)/home"} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  text: { marginTop: 12, color: colors.mutedText, fontSize: 13, fontWeight: "800" }
});

