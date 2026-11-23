import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { networkManager, NetworkState } from "./networkManager";

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
              <ActivityIndicator size="small" color="#FFFFFF" />
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
    backgroundColor: "#7C2D12",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    shadowColor: "#000",
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
    backgroundColor: "#FCA5A5"
  },
  text: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16
  },
  retryButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center"
  },
  retryButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.35)"
  },
  retryButtonDisabled: {
    opacity: 0.6
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800"
  }
});
