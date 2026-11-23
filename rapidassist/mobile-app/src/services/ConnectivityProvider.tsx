import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { networkManager, NetworkState } from "./networkManager";
import { tokens } from "../design/tokens";

type ConnectivityContextType = {
  online: boolean;
  isConnected: boolean;
  isBackendReachable: boolean;
  isChecking: boolean;
  retryConnection: () => Promise<void>;
  checkBackend: () => Promise<boolean>;
};

const ConnectivityContext = createContext<ConnectivityContextType>({
  online: true,
  isConnected: true,
  isBackendReachable: true,
  isChecking: false,
  retryConnection: async () => {},
  checkBackend: async () => true
});

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NetworkState>(() => networkManager.getState());

  useEffect(() => {
    return networkManager.addListener((nextState) => {
      setState(nextState);
    });
  }, []);

  const handleRetry = async () => {
    if (state.isChecking) return;
    await networkManager.reconnect();
  };

  const value = useMemo<ConnectivityContextType>(
    () => ({
      online: state.isOnline,
      isConnected: state.isConnected,
      isBackendReachable: state.isBackendReachable,
      isChecking: state.isChecking,
      retryConnection: handleRetry,
      checkBackend: () => networkManager.checkBackendHealth()
    }),
    [state.isOnline, state.isConnected, state.isBackendReachable, state.isChecking]
  );

  const isOffline = !state.isOnline;

  const statusText = !state.isConnected
    ? "Offline · Check your internet connection."
    : "Server unavailable · RapidAssist is reconnecting…";

  return (
    <ConnectivityContext.Provider value={value}>
      {children}
      {isOffline ? (
        <View
          style={styles.banner}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          testID="connectivity-offline-banner"
        >
          <View style={styles.textContainer}>
            <View style={styles.statusDot} />
            <Text style={styles.text} numberOfLines={2}>
              {statusText}
            </Text>
          </View>
          <Pressable
            onPress={handleRetry}
            disabled={state.isChecking}
            accessibilityRole="button"
            accessibilityLabel="Retry network connection"
            testID="connectivity-retry-button"
            style={({ pressed }) => [
              styles.retryButton,
              pressed ? styles.retryButtonPressed : null,
              state.isChecking ? styles.retryButtonDisabled : null
            ]}
          >
            {state.isChecking ? (
              <ActivityIndicator size="small" color={tokens.color.onPrimary} />
            ) : (
              <Text style={styles.retryButtonText}>Retry</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity() {
  return useContext(ConnectivityContext);
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 999,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: tokens.color.warningText,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    shadowColor: tokens.color.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6
  },
  textContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.color.dangerSoft
  },
  text: {
    flex: 1,
    color: tokens.color.onPrimary,
    fontSize: tokens.size.caption,
    fontFamily: tokens.font.bold,
    lineHeight: tokens.lineHeight.caption
  },
  retryButton: {
    backgroundColor: tokens.color.onDarkFaint,
    borderWidth: 1,
    borderColor: tokens.color.onDarkLine,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center"
  },
  retryButtonPressed: {
    backgroundColor: tokens.color.onDarkLine
  },
  retryButtonDisabled: {
    opacity: 0.6
  },
  retryButtonText: {
    color: tokens.color.onPrimary,
    fontSize: tokens.size.caption,
    fontFamily: tokens.font.bold
  }
});
