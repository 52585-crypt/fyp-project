import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, PrimaryButton, StatusPill } from "../ui/components";
import { ui } from "../ui/system";
import { useServiceSuggestion } from "./useServiceSuggestion";
import type { ServiceSuggestion } from "./serviceSuggestion.types";

const serviceDisplay = {
  mechanic: { label: "Mechanic", icon: "construct" as const },
  fuel_delivery: { label: "Fuel Delivery", icon: "water" as const },
  car_towing: { label: "Car Towing", icon: "car" as const }
};

const issueLabels = {
  battery: "Battery",
  engine: "Engine",
  tyre: "Tyre",
  brake: "Brake",
  overheating: "Overheating",
  general_inspection: "General inspection"
};

type Props = {
  token: string | null;
  description: string;
  onDescriptionChange: (value: string) => void;
  manualSelectionVersion?: number;
  onSuggestionAccepted?: (suggestion: ServiceSuggestion) => void;
  onSignInRequested?: () => void;
};

export function ServiceSuggestionCard({
  token,
  description,
  onDescriptionChange,
  manualSelectionVersion,
  onSuggestionAccepted,
  onSignInRequested
}: Props) {
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const {
    status,
    suggestion,
    clarifications,
    error,
    errorStatus,
    retryAfterSeconds,
    suggest,
    answerClarification,
    retry,
    acceptSuggestion,
    chooseManually
  } = useServiceSuggestion({ token, description, manualSelectionVersion, onSuggestionAccepted });

  useEffect(() => {
    setClarificationAnswer("");
  }, [suggestion?.followUpQuestion]);

  const service = suggestion?.recommendedService ? serviceDisplay[suggestion.recommendedService] : null;
  const showManualAction = status !== "idle" && status !== "loading";

  return (
    <Card style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.sparkleBox}>
          <Ionicons name="sparkles" size={20} color={ui.colors.primary} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Help me choose a service</Text>
          <Text style={styles.subtitle}>Describe the vehicle problem in Roman Urdu or English.</Text>
        </View>
      </View>

      <View>
        <Text style={styles.label}>Describe your problem</Text>
        <TextInput
          accessibilityLabel="Describe your vehicle problem"
          maxLength={1500}
          multiline
          onChangeText={onDescriptionChange}
          placeholder="Meri gari start nahi ho rahi, click ki awaz hai..."
          placeholderTextColor={ui.colors.muted}
          style={styles.descriptionInput}
          textAlignVertical="top"
          value={description}
        />
        <View style={styles.helperRow}>
          <Text style={styles.helper}>Roman Urdu or English</Text>
          <Text style={styles.counter}>{description.length}/1500</Text>
        </View>
      </View>

      {clarifications.length > 0 ? (
        <View style={styles.history}>
          <Text style={styles.historyTitle}>Details provided</Text>
          {clarifications.map((item, index) => (
            <View key={`${item.question}-${index}`} style={styles.historyItem}>
              <Text style={styles.historyQuestion}>{item.question}</Text>
              <Text style={styles.historyAnswer}>{item.answer}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {status === "idle" ? (
        <PrimaryButton title="Suggest Service" icon="sparkles" disabled={description.trim().length < 5} onPress={suggest} />
      ) : null}

      {status === "loading" ? (
        <View accessibilityLiveRegion="polite" style={styles.loadingBox}>
          <ActivityIndicator color={ui.colors.primary} />
          <Text style={styles.loadingText}>Understanding your problem...</Text>
        </View>
      ) : null}

      {status === "clarification" && suggestion?.followUpQuestion ? (
        <View style={styles.resultBox}>
          <StatusPill label="A little more detail" tone="warning" />
          <Text style={styles.question}>{suggestion.followUpQuestion}</Text>
          <TextInput
            accessibilityLabel="Clarification answer"
            maxLength={500}
            multiline
            onChangeText={setClarificationAnswer}
            placeholder="Type your answer..."
            placeholderTextColor={ui.colors.muted}
            style={styles.answerInput}
            textAlignVertical="top"
            value={clarificationAnswer}
          />
          <PrimaryButton
            title="Continue"
            disabled={!clarificationAnswer.trim()}
            onPress={() => answerClarification(clarificationAnswer)}
          />
        </View>
      ) : null}

      {(status === "suggested" || status === "applied") && service && suggestion ? (
        <View accessibilityLiveRegion="polite" style={styles.resultBox}>
          <Text style={styles.resultEyebrow}>Suggested service</Text>
          <View style={styles.serviceRow}>
            <View style={styles.serviceIcon}>
              <Ionicons name={service.icon} size={22} color="white" />
            </View>
            <View style={styles.serviceCopy}>
              <Text style={styles.serviceName}>{service.label}</Text>
              {suggestion.issueCategory ? (
                <Text style={styles.issueText}>Issue category: {issueLabels[suggestion.issueCategory]}</Text>
              ) : null}
            </View>
          </View>
          <Text style={styles.possibleIssue}>{suggestion.possibleIssue}</Text>
          {status === "suggested" ? (
            <PrimaryButton title="Use This Service" icon="checkmark-circle" onPress={acceptSuggestion} />
          ) : (
            <View style={styles.appliedBox}>
              <Ionicons name="checkmark-circle" size={20} color={ui.colors.success} />
              <Text style={styles.appliedText}>{service.label} selected. Review the service details below.</Text>
            </View>
          )}
          <Text style={styles.disclaimer}>The actual fault will be confirmed after provider inspection.</Text>
        </View>
      ) : null}

      {status === "unsupported" && suggestion ? (
        <View accessibilityLiveRegion="polite" style={styles.resultBox}>
          <StatusPill label="Choose manually" tone="warning" />
          <Text style={styles.possibleIssue}>{suggestion.possibleIssue}</Text>
        </View>
      ) : null}

      {status === "error" ? (
        <View accessibilityLiveRegion="assertive" style={styles.errorBox}>
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={20} color={ui.colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
          {errorStatus === 401 && onSignInRequested ? (
            <PrimaryButton title="Sign In Again" variant="outline" onPress={onSignInRequested} />
          ) : (
            <PrimaryButton
              title={retryAfterSeconds > 0 ? `Retry in ${retryAfterSeconds}s` : "Retry"}
              variant="outline"
              disabled={retryAfterSeconds > 0}
              onPress={retry}
            />
          )}
        </View>
      ) : null}

      {showManualAction ? (
        <Pressable accessibilityRole="button" onPress={chooseManually} style={styles.manualButton}>
          <Text style={styles.manualText}>Choose manually</Text>
        </Pressable>
      ) : (
        <Text style={styles.manualHint}>Or choose a service below</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, marginBottom: 2 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sparkleBox: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: ui.colors.primarySoft },
  headingCopy: { flex: 1, minWidth: 0 },
  title: { color: ui.colors.text, fontSize: 17, fontWeight: "900" },
  subtitle: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "600", lineHeight: 17 },
  label: { marginBottom: 8, color: ui.colors.text, fontSize: 13, fontWeight: "800" },
  descriptionInput: { minHeight: 104, maxHeight: 190, borderWidth: 1, borderColor: ui.colors.border, borderRadius: ui.radius.md, backgroundColor: ui.colors.surface, color: ui.colors.text, fontSize: 15, lineHeight: 21, paddingHorizontal: 14, paddingVertical: 12 },
  helperRow: { marginTop: 7, flexDirection: "row", justifyContent: "space-between", gap: 12 },
  helper: { color: ui.colors.muted, fontSize: 11, fontWeight: "600" },
  counter: { color: ui.colors.muted, fontSize: 11, fontWeight: "700" },
  loadingBox: { minHeight: 66, borderRadius: ui.radius.md, backgroundColor: ui.colors.primarySoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 14 },
  loadingText: { color: ui.colors.primaryDark, fontSize: 13, fontWeight: "800" },
  resultBox: { gap: 12, borderRadius: ui.radius.md, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surfaceAlt, padding: 14 },
  resultEyebrow: { color: ui.colors.muted, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.7 },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  serviceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: ui.colors.primary },
  serviceCopy: { flex: 1, minWidth: 0 },
  serviceName: { color: ui.colors.text, fontSize: 18, fontWeight: "900" },
  issueText: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700" },
  possibleIssue: { color: ui.colors.text, fontSize: 13, fontWeight: "600", lineHeight: 20 },
  disclaimer: { color: ui.colors.muted, fontSize: 11, fontWeight: "600", lineHeight: 16 },
  question: { color: ui.colors.text, fontSize: 14, fontWeight: "800", lineHeight: 20 },
  answerInput: { minHeight: 82, maxHeight: 150, borderWidth: 1, borderColor: ui.colors.border, borderRadius: ui.radius.md, backgroundColor: ui.colors.surface, color: ui.colors.text, fontSize: 14, lineHeight: 20, paddingHorizontal: 12, paddingVertical: 10 },
  history: { gap: 8, borderLeftWidth: 3, borderLeftColor: ui.colors.primary, paddingLeft: 11 },
  historyTitle: { color: ui.colors.text, fontSize: 12, fontWeight: "900" },
  historyItem: { gap: 2 },
  historyQuestion: { color: ui.colors.muted, fontSize: 11, fontWeight: "700" },
  historyAnswer: { color: ui.colors.text, fontSize: 12, fontWeight: "700" },
  appliedBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, backgroundColor: ui.colors.successSoft, padding: 11 },
  appliedText: { flex: 1, color: ui.colors.success, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  errorBox: { gap: 12, borderRadius: ui.radius.md, borderWidth: 1, borderColor: "#FECACA", backgroundColor: ui.colors.dangerSoft, padding: 14 },
  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  errorText: { flex: 1, color: ui.colors.danger, fontSize: 12, fontWeight: "800", lineHeight: 18 },
  manualButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  manualText: { color: ui.colors.primary, fontSize: 13, fontWeight: "900" },
  manualHint: { color: ui.colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }
});
