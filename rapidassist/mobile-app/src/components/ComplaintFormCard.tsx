import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { COMPLAINT_CATEGORIES, createComplaint, type Complaint, type ComplaintCategory } from "../complaints/complaints.api";
import { getServiceTitle } from "../requests/serviceCatalog";
import type { ServiceRequest } from "../requests/requests.types";
import { Card, Field, IconBox, PrimaryButton } from "../ui/components";
import { ui } from "../ui/system";

type Props = {
  token: string;
  request?: ServiceRequest | null;
  onSubmitted: (complaint: Complaint) => void;
  onCancel: () => void;
};

export function ComplaintFormCard({ token, request, onSubmitted, onCancel }: Props) {
  const [category, setCategory] = useState<ComplaintCategory | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(category) && description.trim().length >= 10 && !submitting;

  async function onSubmit() {
    if (!category) return;
    try {
      setSubmitting(true);
      setError(null);
      const complaint = await createComplaint(token, { requestId: request?.id || null, category, description: description.trim() });
      onSubmitted(complaint);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Could not send your complaint");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <IconBox icon="flag" tone="danger" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Report a problem</Text>
          <Text style={styles.text}>
            {request ? `${getServiceTitle(request.category)} · ` : ""}Our support team reviews every report and replies here.
          </Text>
        </View>
      </View>

      <Text style={styles.label}>What went wrong?</Text>
      <View style={styles.chips}>
        {COMPLAINT_CATEGORIES.map((item) => {
          const active = item.value === category;
          return (
            <Pressable
              key={item.value}
              onPress={() => setCategory(item.value)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Field
        label="Details"
        icon="create"
        placeholder="Tell us what happened (at least 10 characters)"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={1000}
      />
      {category === "safety" ? (
        <Text style={styles.safety}>If you are in danger right now, call 15 (Police) or 1122 (Rescue) first.</Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <PrimaryButton title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onCancel} />
        <PrimaryButton
          title={submitting ? "Sending..." : "Send Report"}
          icon="send"
          variant="danger"
          disabled={!canSubmit}
          style={{ flex: 1 }}
          onPress={onSubmit}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, marginBottom: 12, borderColor: ui.colors.dangerSoft },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  text: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  label: { color: ui.colors.text, fontSize: 13, fontWeight: "900" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface },
  chipActive: { borderColor: ui.colors.danger, backgroundColor: ui.colors.dangerSoft },
  chipText: { color: ui.colors.muted, fontSize: 12, fontWeight: "800" },
  chipTextActive: { color: ui.colors.danger },
  safety: { color: ui.colors.danger, fontSize: 12, fontWeight: "800" },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 10 }
});
