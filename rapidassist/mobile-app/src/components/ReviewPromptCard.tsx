import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { submitRequestReview } from "../requests/requests.api";
import { getServiceIcon, getServiceTitle } from "../requests/serviceCatalog";
import type { ServiceRequest } from "../requests/requests.types";
import { Card, Field, IconBox, PrimaryButton } from "../ui/components";
import { ui } from "../ui/system";

type Props = {
  token: string;
  request: ServiceRequest;
  onSubmitted: (request: ServiceRequest) => void;
  onLater?: () => void;
};

export function ReviewPromptCard({ token, request, onSubmitted, onLater }: Props) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    try {
      setSubmitting(true);
      setError(null);
      const updated = await submitRequestReview(token, request.id, rating, comment.trim());
      setComment("");
      setRating(5);
      onSubmitted(updated);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <IconBox icon={getServiceIcon(request.category)} tone="success" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Rate your provider</Text>
          <Text style={styles.text}>{getServiceTitle(request.category)} completed. Share your service experience.</Text>
        </View>
      </View>

      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={star} onPress={() => setRating(star)} style={styles.starButton}>
            <Ionicons name={star <= rating ? "star" : "star-outline"} size={30} color={ui.colors.warning} />
          </Pressable>
        ))}
      </View>

      <Field
        label="Review"
        icon="chatbubble"
        placeholder="Write a short review"
        value={comment}
        onChangeText={setComment}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        {onLater ? <PrimaryButton title="Later" variant="outline" style={{ flex: 1 }} onPress={onLater} /> : null}
        <PrimaryButton
          title={submitting ? "Submitting..." : "Submit Review"}
          icon="star"
          variant="success"
          disabled={submitting}
          style={{ flex: 1 }}
          onPress={onSubmit}
        />
      </View>
    </Card>
  );
}

export function ReviewSummary({ request }: { request: ServiceRequest }) {
  if (!request.review?.rating) return null;

  return (
    <View style={styles.summary}>
      <View style={styles.summaryStars}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Ionicons key={star} name={star <= request.review!.rating ? "star" : "star-outline"} size={15} color={ui.colors.warning} />
        ))}
      </View>
      {request.review.comment ? <Text style={styles.summaryText}>{request.review.comment}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  text: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  stars: { flexDirection: "row", alignItems: "center", gap: 6 },
  starButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: 10 },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "800" },
  summary: { marginTop: 8, gap: 5 },
  summaryStars: { flexDirection: "row", alignItems: "center", gap: 2 },
  summaryText: { color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 }
});
