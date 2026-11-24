import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { detectVehicleIssue, type VehicleIssueSuggestion } from "../requests/requests.api";
import type { MechanicIssueCategory, RequestCategory } from "../requests/requests.types";
import { getNetworkErrorMessage } from "../config/api";
import { Card } from "../ui/components";
import { ui } from "../ui/system";

const categoryLabels: Record<RequestCategory, string> = {
  car_towing: "Car Towing",
  fuel_delivery: "Fuel Delivery",
  mechanic: "Mechanic"
};

/**
 * "Photo se problem pehchano": the user snaps the problem, the server's free
 * CLIP model suggests the service, and the form is filled in automatically.
 * The user can still change the selection by hand.
 */
export function PhotoIssueDetector({
  token,
  onDetected
}: {
  token: string | null;
  onDetected: (category: RequestCategory, issueType: MechanicIssueCategory | null) => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VehicleIssueSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(source: "camera" | "gallery") {
    if (!token) return;
    try {
      setError(null);
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(source === "camera" ? "Camera permission is required." : "Photo library permission is required.");
        return;
      }

      const options: ImagePicker.ImagePickerOptions = { quality: 0.3, base64: true, mediaTypes: ["images"] };
      const picked =
        source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = picked.canceled ? null : picked.assets?.[0];
      if (!asset?.base64) return;

      const dataUri = `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`;
      setPhoto(asset.uri);
      setResult(null);
      setLoading(true);

      const suggestion = await detectVehicleIssue(token, dataUri);
      setResult(suggestion);
      if (suggestion.detected && suggestion.category) {
        onDetected(suggestion.category, suggestion.issueType);
      }
    } catch (e: any) {
      setError(getNetworkErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const confidence = result ? Math.round(result.confidence * 100) : 0;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="sparkles" size={18} color={ui.colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Not sure what's wrong?</Text>
          <Text style={styles.subtitle}>Take a photo of the problem and we'll suggest the right service.</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => pick("camera")} disabled={loading}>
          <Ionicons name="camera" size={16} color={ui.colors.primary} />
          <Text style={styles.actionText}>Take photo</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => pick("gallery")} disabled={loading}>
          <Ionicons name="image" size={16} color={ui.colors.primary} />
          <Text style={styles.actionText}>Gallery</Text>
        </Pressable>
      </View>

      {photo ? (
        <View style={styles.resultRow}>
          <Image source={{ uri: photo }} style={styles.thumb} />
          <View style={{ flex: 1 }}>
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={ui.colors.primary} />
                <Text style={styles.muted}>Checking photo...</Text>
              </View>
            ) : result?.detected && result.category ? (
              <>
                <Text style={styles.detected}>{result.title}</Text>
                <Text style={styles.muted}>
                  Selected {categoryLabels[result.category]} · {confidence}% sure
                </Text>
                <Text style={styles.hint}>Wrong? Just pick another service below.</Text>
              </>
            ) : result ? (
              <>
                <Text style={styles.notDetected}>{result.title}</Text>
                <Text style={styles.hint}>
                  Couldn't tell the problem from this photo. Choose the service yourself, or try a closer photo.
                </Text>
              </>
            ) : null}
          </View>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: "row", gap: 12, alignItems: "center" },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: ui.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center"
  },
  title: { color: ui.colors.text, fontSize: 14, fontWeight: "900" },
  subtitle: { color: ui.colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  actions: { flexDirection: "row", gap: 10 },
  action: {
    flex: 1,
    height: 42,
    borderRadius: ui.radius.md,
    borderWidth: 1,
    borderColor: ui.colors.primarySoft,
    backgroundColor: ui.colors.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  },
  actionText: { color: ui.colors.primary, fontSize: 12, fontWeight: "900" },
  resultRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 64, height: 64, borderRadius: ui.radius.sm, backgroundColor: ui.colors.border },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detected: { color: ui.colors.success, fontSize: 14, fontWeight: "900" },
  notDetected: { color: ui.colors.warning, fontSize: 14, fontWeight: "900" },
  muted: { color: ui.colors.muted, fontSize: 12, marginTop: 2 },
  hint: { color: ui.colors.muted, fontSize: 11, marginTop: 4, lineHeight: 15 },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "700" }
});
