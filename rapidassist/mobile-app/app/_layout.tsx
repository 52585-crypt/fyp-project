import { Stack } from "expo-router";
import { Provider as PaperProvider } from "react-native-paper";
import { Provider as ReduxProvider } from "react-redux";
import { AuthProvider } from "../src/auth/AuthProvider";
import { paperTheme } from "../src/design/paperTheme";
import { useAppFonts } from "../src/design/useAppFonts";
import { store } from "../src/store";
import { DispatchProvider } from "../src/requests/DispatchProvider";
import "../src/services/backgroundLocation";
import { ConnectivityProvider } from "../src/services/ConnectivityProvider";
import { NotificationProvider } from "../src/notifications/NotificationProvider";
import { AppErrorBoundary } from "../src/components/AppErrorBoundary";
import { GoogleOAuthRoot } from "../src/auth/GoogleOAuthRoot";

import { StripeRoot } from "../src/payments/StripeRoot";
import { LanguageProvider } from "../src/i18n/LanguageProvider";

export default function RootLayout() {
  const fontsReady = useAppFonts();
  if (!fontsReady) return null;
  return (
    <AppErrorBoundary><StripeRoot><GoogleOAuthRoot><ReduxProvider store={store}>
      <PaperProvider theme={paperTheme}>
        <ConnectivityProvider><AuthProvider><NotificationProvider>
          <DispatchProvider><LanguageProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(user)" />
            <Stack.Screen name="(provider)" />
            <Stack.Screen name="(dev)" />
          </Stack>
          </LanguageProvider></DispatchProvider>
        </NotificationProvider></AuthProvider></ConnectivityProvider>
      </PaperProvider>
    </ReduxProvider></GoogleOAuthRoot></StripeRoot></AppErrorBoundary>
  );
}
