import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useServiceSuggestion } from "./useServiceSuggestion";
import type { ServiceSuggestion } from "./serviceSuggestion.types";
import { Badge, Button, Card } from "../design/components";
import { tokens } from "../design/tokens";

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
          <Ionicons name="sparkles" size={20} color={tokens.color.primary} />
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
          placeholderTextColor={tokens.color.muted}
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
        <Button title="Suggest Service" icon="sparkles" disabled={description.trim().length < 5} onPress={suggest} />
      ) : null}

      {status === "loading" ? (
        <View accessibilityLiveRegion="polite" style={styles.loadingBox}>
          <ActivityIndicator color={tokens.color.primary} />
          <Text style={styles.loadingText}>Understanding your problem...</Text>
        </View>
      ) : null}

      {status === "clarification" && suggestion?.followUpQuestion ? (
        <View style={styles.resultBox}>
          <Badge label="A little more detail" tone="warning" />
          <Text style={styles.question}>{suggestion.followUpQuestion}</Text>
          <TextInput
            accessibilityLabel="Clarification answer"
            maxLength={500}
            multiline
            onChangeText={setClarificationAnswer}
            placeholder="Type your answer..."
            placeholderTextColor={tokens.color.muted}
            style={styles.answerInput}
            textAlignVertical="top"
            value={clarificationAnswer}
          />
          <Button
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
              <Ionicons name={service.icon} size={22} color={tokens.color.onPrimary} />
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
            <Button title="Use This Service" icon="checkmark-circle" onPress={acceptSuggestion} />
          ) : (
            <View style={styles.appliedBox}>
              <Ionicons name="checkmark-circle" size={20} color={tokens.color.success} />
              <Text style={styles.appliedText}>{service.label} selected. Review the service details below.</Text>
            </View>
          )}
          <Text style={styles.disclaimer}>The actual fault will be confirmed after provider inspection.</Text>
        </View>
      ) : null}

      {status === "unsupported" && suggestion ? (
        <View accessibilityLiveRegion="polite" style={styles.resultBox}>
          <Badge label="Choose manually" tone="warning" />
          <Text style={styles.possibleIssue}>{suggestion.possibleIssue}</Text>
        </View>
      ) : null}

      {status === "error" ? (
        <View accessibilityLiveRegion="assertive" style={styles.errorBox}>
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={20} color={tokens.color.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
          {errorStatus === 401 && onSignInRequested ? (
            <Button title="Sign In Again" variant="outline" onPress={onSignInRequested} />
          ) : (
            <Button
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
  sparkleBox: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.primarySoft },
  headingCopy: { flex: 1, minWidth: 0 },
  title: { color: tokens.color.text, fontSize: tokens.size.headline, fontFamily: tokens.font.bold },
  subtitle: { marginTop: 3, color: tokens.color.muted, fontSize: tokens.size.caption, fontFamily: tokens.font.semibold, lineHeight: tokens.lineHeight.bodySmall },
  label: { marginBottom: 8, color: tokens.color.text, fontSize: tokens.size.bodySmall, fontFamily: tokens.font.bold },
  descriptionInput: { minHeight: 104, maxHeight: 190, borderWidth: 1, borderColor: tokens.color.border, borderRadius: tokens.radius.md, backgroundColor: tokens.color.surface, color: tokens.color.text, fontSize: tokens.size.body, lineHeight: tokens.lineHeight.headline, paddingHorizontal: 14, paddingVertical: 12 },
  helperRow: { marginTop: 7, flexDirection: "row", justifyContent: "space-between", gap: 12 },
  helper: { color: tokens.color.muted, fontSize: tokens.size.micro, fontFamily: tokens.font.semibold },
  counter: { color: tokens.color.muted, fontSize: tokens.size.micro, fontFamily: tokens.font.bold },
  loadingBox: { minHeight: 66, borderRadius: tokens.radius.md, backgroundColor: tokens.color.primarySoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 14 },
  loadingText: { color: tokens.color.primaryDark, fontSize: tokens.size.bodySmall, fontFamily: tokens.font.bold },
  resultBox: { gap: 12, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surfaceAlt, padding: 14 },
  resultEyebrow: { color: tokens.color.muted, fontSize: tokens.size.micro, fontFamily: tokens.font.bold, textTransform: "uppercase", letterSpacing: 0.7 },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  serviceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.primary },
  serviceCopy: { flex: 1, minWidth: 0 },
  serviceName: { color: tokens.color.text, fontSize: tokens.size.title, fontFamily: tokens.font.bold },
  issueText: { marginTop: 3, color: tokens.color.muted, fontSize: tokens.size.caption, fontFamily: tokens.font.bold },
  possibleIssue: { color: tokens.color.text, fontSize: tokens.size.bodySmall, fontFamily: tokens.font.semibold, lineHeight: tokens.lineHeight.body },
  disclaimer: { color: tokens.color.muted, fontSize: tokens.size.micro, fontFamily: tokens.font.semibold, lineHeight: tokens.lineHeight.caption },
  question: { color: tokens.color.text, fontSize: tokens.size.body, fontFamily: tokens.font.bold, lineHeight: tokens.lineHeight.body },
  answerInput: { minHeight: 82, maxHeight: 150, borderWidth: 1, borderColor: tokens.color.border, borderRadius: tokens.radius.md, backgroundColor: tokens.color.surface, color: tokens.color.text, fontSize: tokens.size.body, lineHeight: tokens.lineHeight.body, paddingHorizontal: 12, paddingVertical: 10 },
  history: { gap: 8, borderLeftWidth: 3, borderLeftColor: tokens.color.primary, paddingLeft: 11 },
  historyTitle: { color: tokens.color.text, fontSize: tokens.size.caption, fontFamily: tokens.font.bold },
  historyItem: { gap: 2 },
  historyQuestion: { color: tokens.color.muted, fontSize: tokens.size.micro, fontFamily: tokens.font.bold },
  historyAnswer: { color: tokens.color.text, fontSize: tokens.size.caption, fontFamily: tokens.font.bold },
  appliedBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, backgroundColor: tokens.color.successSoft, padding: 11 },
  appliedText: { flex: 1, color: tokens.color.success, fontSize: tokens.size.caption, fontFamily: tokens.font.bold, lineHeight: tokens.lineHeight.bodySmall },
  errorBox: { gap: 12, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.dangerSoft, backgroundColor: tokens.color.dangerSoft, padding: 14 },
  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  errorText: { flex: 1, color: tokens.color.danger, fontSize: tokens.size.caption, fontFamily: tokens.font.bold, lineHeight: tokens.lineHeight.bodySmall },
  manualButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  manualText: { color: tokens.color.primary, fontSize: tokens.size.bodySmall, fontFamily: tokens.font.bold },
  manualHint: { color: tokens.color.muted, fontSize: tokens.size.caption, fontFamily: tokens.font.bold, textAlign: "center" }
});
