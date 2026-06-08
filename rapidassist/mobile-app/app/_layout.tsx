import { Stack } from "expo-router";
import { Provider as PaperProvider } from "react-native-paper";
import { Provider as ReduxProvider } from "react-redux";
import { AuthProvider } from "../src/auth/AuthProvider";
import { paperTheme } from "../src/constants/theme";
import { store } from "../src/store";

export default function RootLayout() {
  return (
    <ReduxProvider store={store}>
      <PaperProvider theme={paperTheme}>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(user)" />
            <Stack.Screen name="(provider)" />
            <Stack.Screen name="(app)" />
          </Stack>
        </AuthProvider>
      </PaperProvider>
    </ReduxProvider>
  );
}

