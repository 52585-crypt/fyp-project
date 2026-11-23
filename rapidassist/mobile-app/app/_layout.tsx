import { Stack } from "expo-router";
import { Provider as PaperProvider } from "react-native-paper";
import { Provider as ReduxProvider } from "react-redux";
import { AuthProvider } from "../src/auth/AuthProvider";
import { paperTheme } from "../src/constants/theme";
import { store } from "../src/store";
import { DispatchProvider } from "../src/requests/DispatchProvider";
import "../src/services/backgroundLocation";
import { ConnectivityProvider } from "../src/services/ConnectivityProvider";
import { NotificationProvider } from "../src/notifications/NotificationProvider";
import { AppErrorBoundary } from "../src/components/AppErrorBoundary";
import { GoogleOAuthRoot } from "../src/auth/GoogleOAuthRoot";

import { StripeRoot } from "../src/payments/StripeRoot";

export default function RootLayout() {
  return (
    <AppErrorBoundary><StripeRoot><GoogleOAuthRoot><ReduxProvider store={store}>
      <PaperProvider theme={paperTheme}>
        <ConnectivityProvider><AuthProvider><NotificationProvider>
          <DispatchProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(user)" />
            <Stack.Screen name="(provider)" />
            <Stack.Screen name="(app)" />
          </Stack>
          </DispatchProvider>
        </NotificationProvider></AuthProvider></ConnectivityProvider>
      </PaperProvider>
    </ReduxProvider></GoogleOAuthRoot></StripeRoot></AppErrorBoundary>
  );
}
