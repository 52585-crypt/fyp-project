import React, { useMemo, useState } from "react";
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { colors } from "../../src/theme/colors";
import { RATextInput } from "../../src/components/RATextInput";
import { RAButton } from "../../src/components/RAButton";
import { register } from "../../src/auth/auth.api";
import { useAuth } from "../../src/auth/AuthProvider";
import type { MechanicServiceCategory, UserRole } from "../../src/auth/auth.types";
import { getNetworkErrorMessage } from "../../src/config/api";

type MechanicPhotoField = "selfieUrl" | "idCardFrontUrl" | "idCardBackUrl" | "workshopPhotoUrl" | "certificateUrl";

type MechanicDocs = Record<MechanicPhotoField, string>;

type LiveLocation = {
  lat: number;
  lng: number;
  addressText: string | null;
};

type MechanicStep = 0 | 1 | 2 | 3;

const serviceCategories: Array<{ label: string; value: MechanicServiceCategory; icon: keyof typeof Ionicons.glyphMap }> = [
  { label: "Mechanic", value: "mechanic", icon: "construct" },
  { label: "Fuel Delivery", value: "fuel_delivery", icon: "water" },
  { label: "Towing", value: "towing", icon: "car" }
];

const mechanicSteps = ["Service", "Account", "Identity", "Base"];

const initialDocs: MechanicDocs = {
  selfieUrl: "",
  idCardFrontUrl: "",
  idCardBackUrl: "",
  workshopPhotoUrl: "",
  certificateUrl: ""
};

function imageAssetToDataUri(asset: ImagePicker.ImagePickerAsset) {
  if (!asset.base64) {
    throw new Error("Image conversion failed. Please retake the photo.");
  }
  return `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`;
}

function RolePill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pillWrap, selected ? styles.pillWrapSelected : null]}>
      <Text style={[styles.pillText, selected ? styles.pillTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function ServiceCategoryPicker({
  value,
  onChange
}: {
  value: MechanicServiceCategory;
  onChange: (next: MechanicServiceCategory) => void;
}) {
  return (
    <View style={styles.categoryGrid}>
      {serviceCategories.map((item) => {
        const selected = item.value === value;
        return (
          <Pressable
            key={item.value}
            onPress={() => onChange(item.value)}
            style={[styles.categoryButton, selected ? styles.categoryButtonSelected : null]}
          >
            <Ionicons name={item.icon} size={18} color={selected ? colors.primaryDark : colors.mutedText} />
            <Text style={[styles.categoryText, selected ? styles.categoryTextSelected : null]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StepProgress({ currentStep }: { currentStep: MechanicStep }) {
  return (
    <View style={styles.stepWrap}>
      {mechanicSteps.map((label, index) => {
        const active = index === currentStep;
        const completed = index < currentStep;
        return (
          <View key={label} style={styles.stepItem}>
            <View style={[styles.stepDot, active || completed ? styles.stepDotActive : null]}>
              <Text style={[styles.stepDotText, active || completed ? styles.stepDotTextActive : null]}>
                {index + 1}
              </Text>
            </View>
            <Text style={[styles.stepLabel, active ? styles.stepLabelActive : null]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function UploadRow({
  title,
  value,
  icon,
  onCamera,
  onGallery,
  optional
}: {
  title: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onCamera?: () => void;
  onGallery?: () => void;
  optional?: boolean;
}) {
  return (
    <View style={styles.uploadRow}>
      <View style={styles.uploadPreview}>
        {value ? (
          <Image source={{ uri: value }} style={styles.uploadImage} />
        ) : (
          <Ionicons name={icon} size={22} color={colors.mutedText} />
        )}
      </View>
      <View style={styles.uploadBody}>
        <Text style={styles.uploadTitle}>
          {title}
          {optional ? <Text style={styles.optional}> optional</Text> : null}
        </Text>
        <Text style={styles.uploadStatus}>{value ? "Attached" : "Required"}</Text>
      </View>
      <View style={styles.uploadActions}>
        {onCamera ? (
          <Pressable onPress={onCamera} style={styles.iconButton}>
            <Ionicons name="camera" size={18} color={colors.primaryDark} />
          </Pressable>
        ) : null}
        {onGallery ? (
          <Pressable onPress={onGallery} style={styles.iconButton}>
            <Ionicons name="image" size={18} color={colors.primaryDark} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function Signup() {
  const { setSession } = useAuth();
  const [role, setRole] = useState<UserRole>("user");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [serviceCategory, setServiceCategory] = useState<MechanicServiceCategory>("mechanic");
  const [docs, setDocs] = useState<MechanicDocs>(initialDocs);
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  const [mechanicStep, setMechanicStep] = useState<MechanicStep>(0);
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountReady = useMemo(() => {
    return name.trim().length >= 2 && phone.trim().length >= 10 && password.length >= 6;
  }, [name, phone, password]);

  const identityReady = useMemo(() => {
    if (role !== "mechanic") return true;
    return Boolean(
      serviceCategory &&
        docs.selfieUrl &&
        docs.idCardFrontUrl &&
        docs.idCardBackUrl
    );
  }, [docs, role, serviceCategory]);

  const workshopReady = useMemo(() => {
    if (role !== "mechanic") return true;
    return Boolean(docs.workshopPhotoUrl);
  }, [docs.workshopPhotoUrl, role]);

  const canSubmit = useMemo(() => {
    return accountReady && identityReady && workshopReady;
  }, [accountReady, identityReady, workshopReady]);

  const canMoveNext = useMemo(() => {
    if (mechanicStep === 0) return Boolean(serviceCategory);
    if (mechanicStep === 1) return accountReady;
    if (mechanicStep === 2) return identityReady;
    return workshopReady;
  }, [accountReady, identityReady, mechanicStep, serviceCategory, workshopReady]);

  function selectRole(nextRole: UserRole) {
    setRole(nextRole);
    setError(null);
    if (nextRole === "mechanic") setMechanicStep(0);
  }

  function goNext() {
    if (!canMoveNext) return;
    setMechanicStep((current) => (current < 3 ? ((current + 1) as MechanicStep) : current));
  }

  function goBack() {
    setMechanicStep((current) => (current > 0 ? ((current - 1) as MechanicStep) : current));
  }

  async function captureImage(field: MechanicPhotoField) {
    try {
      setError(null);
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError("Camera permission is required. Allow camera access and try again.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: field === "selfieUrl" ? [1, 1] : [4, 3],
        quality: 0.2,
        base64: true,
        mediaTypes: ["images"],
        cameraType: field === "selfieUrl" ? ImagePicker.CameraType.front : ImagePicker.CameraType.back
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setDocs((current) => ({ ...current, [field]: imageAssetToDataUri(result.assets[0]) }));
      }
    } catch (e: any) {
      setError(e?.message || "Camera is not available on this device. Try the gallery option.");
    }
  }

  async function pickImage(field: MechanicPhotoField) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission is required");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.2,
      base64: true,
      mediaTypes: ["images"]
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setDocs((current) => ({ ...current, [field]: imageAssetToDataUri(result.assets[0]) }));
    }
  }

  async function fetchLocation() {
    try {
      setLocationLoading(true);
      setError(null);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Location permission is required");
        return;
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let addressText: string | null = null;

      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude
        });
        if (address) {
          addressText = [address.name, address.street, address.city, address.region].filter(Boolean).join(", ") || null;
        }
      } catch {
        addressText = null;
      }

      setLiveLocation({
        lat: current.coords.latitude,
        lng: current.coords.longitude,
        addressText
      });
    } catch (e: any) {
      setError(e?.message || "Failed to fetch location");
    } finally {
      setLocationLoading(false);
    }
  }

  async function onSubmit() {
    try {
      setLoading(true);
      setError(null);

      const data = await register({
        role,
        name: name.trim(),
        phone: phone.trim(),
        password,
        isCertified: Boolean(docs.certificateUrl),
        certificateUrl: docs.certificateUrl || undefined,
        mechanicProfile:
          role === "mechanic"
            ? {
                serviceCategory,
                selfieUrl: docs.selfieUrl,
                idCardFrontUrl: docs.idCardFrontUrl,
                idCardBackUrl: docs.idCardBackUrl,
                workshopPhotoUrl: docs.workshopPhotoUrl,
                certificateUrl: docs.certificateUrl || null,
                liveLocation: liveLocation || undefined
              }
            : undefined
      });

      await setSession(data.token, data.user);
      router.replace(data.user.role === "mechanic" ? "/(provider)/dashboard" : "/(user)/home");
    } catch (e: any) {
      setError(getNetworkErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Ionicons name="person-add" size={24} color={colors.primary} />
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Providers complete identity and service verification before receiving jobs.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Role</Text>
          <View style={styles.pills}>
            <RolePill label="User" selected={role === "user"} onPress={() => selectRole("user")} />
            <RolePill label="Provider" selected={role === "mechanic"} onPress={() => selectRole("mechanic")} />
          </View>

          {role === "user" ? (
            <>
              <View style={{ height: 12 }} />
              <RATextInput icon="person" placeholder="Full name" value={name} onChangeText={setName} />
              <View style={{ height: 12 }} />
              <RATextInput
                icon="call"
                placeholder="Phone (e.g. 03001234567)"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
              <View style={{ height: 12 }} />
              <RATextInput
                icon="lock-closed"
                placeholder="Password (min 6 chars)"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </>
          ) : (
            <View style={styles.mechanicBlock}>
              <StepProgress currentStep={mechanicStep} />

              {mechanicStep === 0 ? (
                <>
                  <Text style={styles.sectionTitle}>Select service category</Text>
                  <ServiceCategoryPicker value={serviceCategory} onChange={setServiceCategory} />
                </>
              ) : null}

              {mechanicStep === 1 ? (
                <>
                  <Text style={styles.sectionTitle}>Account details</Text>
                  <RATextInput icon="person" placeholder="Full name" value={name} onChangeText={setName} />
                  <View style={{ height: 12 }} />
                  <RATextInput
                    icon="call"
                    placeholder="Phone (e.g. 03001234567)"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                  <View style={{ height: 12 }} />
                  <RATextInput
                    icon="lock-closed"
                    placeholder="Password (min 6 chars)"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                  />
                </>
              ) : null}

              {mechanicStep === 2 ? (
                <>
                  <Text style={styles.sectionTitle}>Identity documents</Text>
                  <UploadRow
                    title="Real-time selfie"
                    value={docs.selfieUrl}
                    icon="person-circle"
                    onCamera={() => captureImage("selfieUrl")}
                  />
                  <UploadRow
                    title="ID card front"
                    value={docs.idCardFrontUrl}
                    icon="card"
                    onCamera={() => captureImage("idCardFrontUrl")}
                    onGallery={() => pickImage("idCardFrontUrl")}
                  />
                  <UploadRow
                    title="ID card back"
                    value={docs.idCardBackUrl}
                    icon="card"
                    onCamera={() => captureImage("idCardBackUrl")}
                    onGallery={() => pickImage("idCardBackUrl")}
                  />
                  <View style={styles.matchBox}>
                    <Ionicons name="scan" size={18} color={colors.primaryDark} />
                    <Text style={styles.matchText}>
                      ID photo and selfie match will be reviewed after submission.
                    </Text>
                  </View>
                </>
              ) : null}

              {mechanicStep === 3 ? (
                <>
                  <Text style={styles.sectionTitle}>Service base and certificate</Text>
                  <UploadRow
                    title="Workshop photo"
                    value={docs.workshopPhotoUrl}
                    icon="business"
                    onCamera={() => captureImage("workshopPhotoUrl")}
                    onGallery={() => pickImage("workshopPhotoUrl")}
                  />
                  <UploadRow
                    title="Certificate"
                    value={docs.certificateUrl}
                    icon="document-text"
                    onGallery={() => pickImage("certificateUrl")}
                    optional
                  />

                  <Text style={styles.sectionTitle}>Live location <Text style={styles.optional}>optional</Text></Text>
                  <Pressable onPress={fetchLocation} style={styles.locationButton} disabled={locationLoading}>
                    <Ionicons name="location" size={18} color={colors.primaryDark} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.locationTitle}>
                        {locationLoading ? "Fetching location..." : liveLocation ? "Location captured" : "Fetch real-time location"}
                      </Text>
                      {liveLocation ? (
                        <Text style={styles.locationText}>
                          {liveLocation.addressText || `${liveLocation.lat.toFixed(5)}, ${liveLocation.lng.toFixed(5)}`}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                </>
              ) : null}

              <View style={styles.wizardActions}>
                {mechanicStep > 0 ? (
                  <Pressable onPress={goBack} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={18} color={colors.text} />
                    <Text style={styles.backButtonText}>Back</Text>
                  </Pressable>
                ) : (
                  <View style={styles.backButtonPlaceholder} />
                )}
                {mechanicStep < 3 ? (
                  <RAButton title="Next" disabled={!canMoveNext} onPress={goNext} style={styles.nextButton} />
                ) : (
                  <RAButton title={loading ? "Please wait..." : "Create account"} disabled={!canSubmit || loading} onPress={onSubmit} style={styles.nextButton} />
                )}
              </View>
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {role === "user" ? (
            <>
              <View style={{ height: 14 }} />
              <RAButton title={loading ? "Please wait..." : "Create account"} disabled={!canSubmit || loading} onPress={onSubmit} />
            </>
          ) : null}

          <View style={{ height: 14 }} />
          <Text style={styles.bottom}>
            Already have an account?{" "}
            <Link href="/(auth)/login" style={styles.link}>
              Login
            </Link>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 18, paddingBottom: 36 },
  header: { paddingTop: 16, paddingBottom: 18 },
  title: { marginTop: 10, fontSize: 28, fontWeight: "800", color: colors.text },
  subtitle: { marginTop: 6, fontSize: 14, lineHeight: 20, color: colors.mutedText },
  form: {
    marginTop: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: 16
  },
  label: { fontSize: 12, color: colors.mutedText, fontWeight: "700", marginBottom: 8 },
  pills: { flexDirection: "row", gap: 10 },
  pillWrap: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    alignItems: "center"
  },
  pillWrapSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
  pillText: { color: colors.text, fontWeight: "700" },
  pillTextSelected: { color: colors.primaryDark },
  mechanicBlock: { marginTop: 18 },
  stepWrap: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 10
  },
  stepItem: {
    flex: 1,
    alignItems: "center",
    minWidth: 0
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  stepDotActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  stepDotText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "900"
  },
  stepDotTextActive: {
    color: "white"
  },
  stepLabel: {
    marginTop: 5,
    color: colors.mutedText,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center"
  },
  stepLabelActive: {
    color: colors.primaryDark
  },
  sectionTitle: { marginTop: 14, marginBottom: 8, color: colors.text, fontSize: 14, fontWeight: "800" },
  categoryGrid: { gap: 8 },
  categoryButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  categoryButtonSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
  categoryText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  categoryTextSelected: { color: colors.primaryDark },
  uploadRow: {
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8
  },
  uploadPreview: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  uploadImage: { width: "100%", height: "100%" },
  uploadBody: { flex: 1, minWidth: 0 },
  uploadTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  optional: { color: colors.mutedText, fontSize: 11, fontWeight: "600" },
  uploadStatus: { marginTop: 3, color: colors.mutedText, fontSize: 12 },
  uploadActions: { flexDirection: "row", gap: 6 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  matchBox: {
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "center"
  },
  matchText: { flex: 1, color: colors.primaryDark, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  locationButton: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  locationTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  locationText: { marginTop: 3, color: colors.mutedText, fontSize: 12, lineHeight: 16 },
  wizardActions: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  backButton: {
    height: 52,
    width: 104,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4
  },
  backButtonPlaceholder: {
    width: 104
  },
  backButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  },
  nextButton: {
    flex: 1
  },
  error: { marginTop: 10, color: colors.danger, fontSize: 12, fontWeight: "600" },
  bottom: { marginTop: 12, textAlign: "center", color: colors.mutedText },
  link: { color: colors.primary, fontWeight: "700" }
});
