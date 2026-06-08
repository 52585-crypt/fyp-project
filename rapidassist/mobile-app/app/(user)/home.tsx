import React, { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { listMyRequests, submitRequestReview } from "../../src/requests/requests.api";
import { getServiceIcon, getServiceTitle } from "../../src/requests/serviceCatalog";
import type { RequestCategory, ServiceRequest } from "../../src/requests/requests.types";
import { AppShell, BottomNav, Card, Field, IconBox, Metric, PrimaryButton, SectionTitle, StatusPill } from "../../src/ui/components";
import { ui } from "../../src/ui/system";

const services = [
  { title: "Car Towing", icon: "car", category: "car_towing", tone: "primary" },
  { title: "Fuel Delivery", icon: "water", category: "fuel_delivery", tone: "warning" },
  { title: "Mechanic", icon: "construct", category: "mechanic", tone: "success" }
] as const;

function openRequest(category?: RequestCategory) {
  router.push({
    pathname: "/(user)/request",
    params: category ? { category } : undefined
  });
}

function StarRating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} onPress={() => onChange(star)} style={styles.starButton}>
          <Ionicons name={star <= value ? "star" : "star-outline"} size={28} color={ui.colors.warning} />
        </Pressable>
      ))}
    </View>
  );
}

export default function UserHome() {
  const { token, user } = useAuth();
  const [activeRequest, setActiveRequest] = useState<ServiceRequest | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ServiceRequest | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboardRequests() {
    if (!token) return;
    try {
      setError(null);
      const requests = await listMyRequests(token);
      setActiveRequest(requests.find((item) => item.status !== "completed" && item.status !== "cancelled") || null);
      setReviewTarget(
        requests.find((item) => item.status === "completed" && Boolean(item.providerId) && !item.review?.rating) || null
      );
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load dashboard requests");
    }
  }

  async function onSubmitReview() {
    if (!token || !reviewTarget) return;
    try {
      setSubmittingReview(true);
      setError(null);
      await submitRequestReview(token, reviewTarget.id, rating, comment.trim());
      setReviewTarget(null);
      setComment("");
      setRating(5);
      await loadDashboardRequests();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  }

  useEffect(() => {
    loadDashboardRequests();
  }, [token]);

  return (
    <View style={{ flex: 1 }}>
      <AppShell
        title={`Hi, ${user?.name || "User"}`}
        subtitle="Gulberg 3, Lahore"
        right={
          <Pressable style={styles.bell}>
            <Ionicons name="notifications" size={20} color={ui.colors.text} />
          </Pressable>
        }
      >
        <Card style={styles.hero}>
          <View style={{ flex: 1 }}>
            <StatusPill label="24/7 Roadside Support" />
            <Text style={styles.heroTitle}>Need help for your vehicle?</Text>
            <Text style={styles.heroText}>Request car towing, fuel delivery, or mechanic assistance from verified providers.</Text>
            <PrimaryButton title="Create Request" icon="flash" onPress={() => openRequest()} style={{ marginTop: 14 }} />
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="car-sport" size={46} color="white" />
          </View>
        </Card>

        <View style={styles.metrics}>
          <Metric label="Avg arrival" value="12 min" icon="timer" />
          <Metric label="Active providers" value="48" icon="people" />
        </View>

        {reviewTarget ? (
          <>
            <SectionTitle title="Rate your provider" action={getServiceTitle(reviewTarget.category)} />
            <Card style={styles.reviewCard}>
              <View style={styles.reviewTop}>
                <IconBox icon={getServiceIcon(reviewTarget.category)} tone="success" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewTitle}>How was your service?</Text>
                  <Text style={styles.reviewText}>
                    Your rating helps improve provider quality for future roadside requests.
                  </Text>
                </View>
              </View>
              <StarRating value={rating} onChange={setRating} />
              <Field
                label="Review"
                icon="chatbubble"
                placeholder="Write a short review"
                value={comment}
                onChangeText={setComment}
              />
              <View style={styles.reviewActions}>
                <PrimaryButton
                  title="Later"
                  variant="outline"
                  style={{ flex: 1 }}
                  onPress={() => setReviewTarget(null)}
                />
                <PrimaryButton
                  title={submittingReview ? "Submitting..." : "Submit Review"}
                  icon="star"
                  variant="success"
                  disabled={submittingReview}
                  style={{ flex: 1 }}
                  onPress={onSubmitReview}
                />
              </View>
            </Card>
          </>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <SectionTitle title="Services" action="View all" />
        <View style={styles.grid}>
          {services.map((service) => (
            <Pressable key={service.title} onPress={() => openRequest(service.category)} style={styles.service}>
              <IconBox icon={service.icon} tone={service.tone} />
              <Text style={styles.serviceTitle}>{service.title}</Text>
            </Pressable>
          ))}
        </View>

        <SectionTitle title="Active request" />
        <Card style={styles.active}>
          <View style={styles.activeTop}>
            <IconBox icon={activeRequest ? getServiceIcon(activeRequest.category) : "navigate"} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeTitle}>{activeRequest ? getServiceTitle(activeRequest.category) : "No active request"}</Text>
              <Text style={styles.activeText}>
                {activeRequest
                  ? `${activeRequest.status.replaceAll("_", " ")} - ${activeRequest.pickupLocation?.addressText || "Pickup location"}`
                  : "Start a request and track provider arrival here."}
              </Text>
            </View>
            {activeRequest ? <StatusPill label={activeRequest.status.replaceAll("_", " ")} tone="warning" /> : null}
          </View>
          <PrimaryButton
            title={activeRequest ? "Track Request" : "Emergency SOS"}
            icon={activeRequest ? "navigate" : "alert"}
            variant={activeRequest ? "primary" : "danger"}
            onPress={() => (activeRequest ? router.push("/(user)/tracking") : openRequest())}
          />
        </Card>
      </AppShell>
      <BottomNav role="user" active="Home" />
    </View>
  );
}

const styles = StyleSheet.create({
  bell: { width: 42, height: 42, borderRadius: 14, backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.border, alignItems: "center", justifyContent: "center" },
  hero: { backgroundColor: ui.colors.primary, borderColor: ui.colors.primary, flexDirection: "row", alignItems: "center", gap: 12 },
  heroTitle: { marginTop: 12, color: "white", fontSize: 23, lineHeight: 29, fontWeight: "900" },
  heroText: { marginTop: 8, color: "rgba(255,255,255,0.86)", fontSize: 13, lineHeight: 19, fontWeight: "700" },
  heroIcon: { width: 88, height: 88, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  metrics: { marginTop: 12, flexDirection: "row", gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  service: { flex: 1, minHeight: 118, borderRadius: 18, backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.border, padding: 10, alignItems: "center", justifyContent: "center", gap: 10 },
  serviceTitle: { color: ui.colors.text, fontSize: 12, lineHeight: 16, fontWeight: "900", textAlign: "center" },
  reviewCard: { gap: 12 },
  reviewTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  reviewTitle: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  reviewText: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  stars: { flexDirection: "row", alignItems: "center", gap: 6 },
  starButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  reviewActions: { flexDirection: "row", gap: 10 },
  active: { gap: 14 },
  activeTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  activeTitle: { color: ui.colors.text, fontSize: 15, fontWeight: "900" },
  activeText: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  error: { marginTop: 10, color: ui.colors.danger, fontSize: 12, fontWeight: "800" }
});
