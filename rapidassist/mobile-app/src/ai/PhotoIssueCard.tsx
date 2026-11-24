import { useState } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Badge, Banner, Button, Text } from "../design/components";
import { tokens } from "../design/tokens";
import { getServiceTitle } from "../requests/serviceCatalog";
import type { AppliedServiceSelection } from "./serviceSuggestion.integration";
import { detectVehicleIssue, selectionFromVehicleIssue, vehicleIssueErrorMessage, type VehicleIssueSuggestion } from "./vehicleIssue.api";

type Source = "camera" | "library";

/**
 * "Not sure what's wrong?": the customer photographs the problem, the server's free CLIP model suggests the
 * service and the form is pre-filled. The customer can still change everything by hand.
 */
export function PhotoIssueCard({ token, onApply }: { token: string | null; onApply: (selection: AppliedServiceSelection) => void }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState<Source | null>(null);
  const [result, setResult] = useState<VehicleIssueSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(source: Source) {
    if (!token || busy) return;
    setError(null);
    try {
      if (source === "camera" && Platform.OS !== "web") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error("Allow camera access in Settings or choose an existing photo.");
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], base64: true, quality: 0.5, exif: false };
      const picked = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset?.base64) return;
      const mime = asset.base64.startsWith("iVBORw0KGgo") ? "image/png" : "image/jpeg";
      setPhoto(asset.uri);
      setResult(null);
      setBusy(source);
      const suggestion = await detectVehicleIssue(token, `data:${mime};base64,${asset.base64}`);
      setResult(suggestion);
      const selection = selectionFromVehicleIssue(suggestion);
      if (selection) onApply(selection);
    } catch (failure) {
      setError(failure instanceof Error && !(failure as any).response ? failure.message : vehicleIssueErrorMessage(failure));
    } finally {
      setBusy(null);
    }
  }

  const selection = selectionFromVehicleIssue(result);
  return (
    <View style={styles.root}>
      <Text variant="bodyStrong">Not sure what's wrong?</Text>
      <Text variant="bodySmall" color="muted">Take a photo of the problem and we'll suggest the right service. You can still change it.</Text>
      {photo ? <Image accessibilityLabel="Photo of the problem" source={{ uri: photo }} resizeMode="cover" style={styles.preview} /> : null}
      <View style={styles.row}>
        <Button title={photo ? "Retake photo" : "Take photo"} icon="camera-outline" variant="outline" size="small" fullWidth={false} style={styles.flex}
          loading={busy === "camera"} disabled={!token || Boolean(busy)} onPress={() => void pick("camera")} />
        <Button title="Choose photo" icon="image-outline" variant="outline" size="small" fullWidth={false} style={styles.flex}
          loading={busy === "library"} disabled={!token || Boolean(busy)} onPress={() => void pick("library")} />
      </View>
      {busy ? <Text variant="caption" color="muted" accessibilityLiveRegion="polite">Checking your photo…</Text> : null}
      {result && selection ? (
        <View style={styles.result} accessibilityLiveRegion="polite">
          <Badge label={`${result.title} · ${Math.round(result.confidence * 100)}%`} tone="success" />
          <Text variant="bodySmall" color="muted">Service set to {getServiceTitle(selection.category)}. Change it if this isn't right.</Text>
        </View>
      ) : null}
      {result && !selection ? (
        <Banner tone="warning" title={result.title} message="We couldn't tell the problem from this photo. Choose the service yourself or try a closer photo." />
      ) : null}
      {error ? <Banner tone="danger" title="Photo check failed" message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: tokens.space.sm },
  row: { flexDirection: "row", gap: tokens.space.sm, flexWrap: "wrap" },
  flex: { flexGrow: 1, flexBasis: tokens.sizes.heroArt },
  result: { gap: tokens.space.xs },
  preview: { width: "100%", height: tokens.sizes.map - tokens.space.sm, backgroundColor: tokens.color.surfaceAlt, borderRadius: tokens.radius.md }
});
