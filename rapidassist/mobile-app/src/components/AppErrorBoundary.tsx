import React from "react";
import { Button, Text, View } from "react-native";

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Unable to render RapidAssist:", error, info.componentStack);
  }

  render() {
    if (this.state.failed) return <View style={{ flex: 1, padding: 24, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Text accessibilityRole="alert">Something went wrong while displaying this screen.</Text>
      <Button title="Try again" onPress={() => this.setState({ failed: false })} />
    </View>;
    return this.props.children;
  }
}
