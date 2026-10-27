import NetInfo from "@react-native-community/netinfo";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

const ConnectivityContext = createContext({ online: true });

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);

  useEffect(() => NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false && state.isInternetReachable !== false);
  }), []);

  const value = useMemo(() => ({ online }), [online]);
  return (
    <ConnectivityContext.Provider value={value}>
      {children}
      {!online ? (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Text style={styles.text}>Offline · job data may be out of date. Reconnect and check the status before retrying an action.</Text>
        </View>
      ) : null}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity() {
  return useContext(ConnectivityContext);
}

const styles = StyleSheet.create({
  banner: { position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 200, borderRadius: 12, padding: 12, backgroundColor: "#7C2D12" },
  text: { color: "white", textAlign: "center", fontSize: 12, fontWeight: "800" }
});
