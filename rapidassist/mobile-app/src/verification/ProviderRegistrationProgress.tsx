import { StyleSheet, Text, View } from "react-native";
import { tokens } from "../theme/tokens";

const steps = ["Service", "Account", "Workshop", "Identity verification", "Review & submit"];

export function ProviderRegistrationProgress({ currentStep }: { currentStep: number }) {
  return (
    <View style={styles.track} accessibilityLabel={`Step ${currentStep + 1} of ${steps.length}. ${steps[currentStep]}`}>
      {steps.map((label, index) => (
        <View key={label} style={styles.step}>
          <View style={[styles.dot, index <= currentStep && styles.filled]}>
            <Text style={[styles.label, index <= currentStep && styles.inverse]}>{index + 1}</Text>
          </View>
          <Text style={[styles.label, index === currentStep && styles.active]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", gap: 4, marginBottom: tokens.spacing.md },
  step: { flex: 1, minWidth: 0, alignItems: "center", gap: 4 },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: tokens.colors.borderStrong,
    alignItems: "center", justifyContent: "center" },
  filled: { backgroundColor: tokens.colors.brand, borderColor: tokens.colors.brand },
  label: { textAlign: "center", color: tokens.colors.inkMuted, fontSize: 11, fontWeight: "600" },
  active: { color: tokens.colors.brand, fontWeight: "800" },
  inverse: { color: "#fff" }
});
