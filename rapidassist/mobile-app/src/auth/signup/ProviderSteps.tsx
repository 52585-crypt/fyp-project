import { StyleSheet, View } from "react-native";
import { Banner, Card, Icon, PhotoUpload, ServiceTile, Text } from "../../design/components";
import { tokens } from "../../design/tokens";
import { requiredDocuments, serviceCategories, serviceCategoryLabel } from "../signupSteps";
import type { SignupWizard } from "../useSignupWizard";

export function ServiceStep({ w }: { w: SignupWizard }) {
  const docs = requiredDocuments(w.serviceCategory);
  return (
    <View style={styles.stack}>
      <Text variant="bodySmall" color="muted">Which service will you provide?</Text>
      <View style={styles.grid}>
        {serviceCategories.map((c) => (
          <ServiceTile key={c.value} title={c.label} subtitle={c.subtitle} icon={c.icon}
            selected={w.serviceCategory === c.value} onPress={() => w.selectServiceCategory(c.value)} />
        ))}
      </View>
      <Banner title={`${serviceCategoryLabel(w.serviceCategory)} documents`}
        message={`You'll upload: ${docs.map((d) => d.title.toLowerCase()).join(" and ")}.`} icon="document-text-outline" />
    </View>
  );
}

export function DocumentsStep({ w }: { w: SignupWizard }) {
  return (
    <View style={styles.stack}>
      <Text variant="bodySmall" color="muted">Use clear photos so our team can verify your account quickly.</Text>
      {requiredDocuments(w.serviceCategory).map((d) => (
        <PhotoUpload key={d.field} title={d.title} icon={d.icon} value={w.docs[d.field]}
          onCamera={() => w.captureDocument(d.field)} onGallery={() => w.pickDocument(d.field)} />
      ))}
    </View>
  );
}

export function LocationStep({ w }: { w: SignupWizard }) {
  const loc = w.liveLocation;
  return (
    <View style={styles.stack}>
      <Text variant="bodySmall" color="muted">Optional: share where you usually work so we can match nearby jobs.</Text>
      <Card onPress={w.locationLoading ? undefined : w.fetchLocation} tone={loc ? "selected" : "surface"} accessibilityLabel="Fetch real-time location">
        <View style={styles.row}>
          <Icon name={loc ? "checkmark-circle" : "location-outline"} color={loc ? "success" : "primary"} size={tokens.sizes.iconLarge} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">{w.locationLoading ? "Fetching GPS location..." : loc ? "Location captured" : "Use my current location"}</Text>
            <Text variant="caption" color="muted" numberOfLines={2}>
              {loc ? loc.addressText || `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : "Tap to capture your workshop or service area"}
            </Text>
          </View>
        </View>
      </Card>
      <Banner icon="shield-checkmark-outline"
        message="Continuing saves your provider account. Next you'll add a selfie and CNIC front for identity verification." />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: tokens.space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  flex: { flex: 1, gap: tokens.space.xxs }
});
