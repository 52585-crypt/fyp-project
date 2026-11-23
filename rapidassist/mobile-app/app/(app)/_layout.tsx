import { useRoute } from "@react-navigation/native";
import { Redirect, Stack, useGlobalSearchParams, usePathname } from "expo-router";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { customerReturnTo } from "../../src/auth/customerNavigation";
import { colors } from "../../src/theme/colors";

export default function AppLayout() {
  const { isLoading, token, user } = useAuth();
  const route = useRoute();
  const path = usePathname();
  const params = useGlobalSearchParams();
  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.text}>Checking your session...</Text>
      </SafeAreaView>
    );
  }
  if (!token) {
    if (path === "/request/create" || path === "/vehicles" || path === "/vehicles/add") {
      return <Redirect href={{ pathname: "/(auth)/login", params: { returnTo: customerReturnTo(path, params, route.params) } }} />;
    }
    return <Redirect href="/(auth)/welcome" />;
  }
  return <Stack key={user?.id} screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  text: { marginTop: 12, color: colors.mutedText, fontSize: 13, fontWeight: "800" }
});

