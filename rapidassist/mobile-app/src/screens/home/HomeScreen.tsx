import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ServiceCard } from "../../components/ServiceCard";
import { appColors, radii } from "../../constants/theme";
import { services } from "../../services/dummyApi";
import { ScreenScaffold } from "../shared/ScreenScaffold";

export function HomeScreen() {
  return (
    <ScreenScaffold title="Hello, Ali" subtitle="Gulberg 3, Lahore, Pakistan">
      <View style={styles.banner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Need Help for Your Vehicle?</Text>
          <Text style={styles.bannerText}>24/7 support - fast and reliable</Text>
          <Pressable style={styles.bannerButton}><Text style={styles.bannerButtonText}>Get Help Now</Text></Pressable>
        </View>
        <Ionicons name="car-sport" size={58} color="white" />
      </View>
      <Text style={styles.sectionTitle}>Our Services</Text>
      <View style={styles.grid}>
        {services.map((item) => <ServiceCard key={item.id} item={item} />)}
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  banner: { minHeight: 140, borderRadius: radii.lg, backgroundColor: appColors.primary, padding: 16, flexDirection: "row", alignItems: "center" },
  bannerTitle: { color: "white", fontSize: 20, fontWeight: "900", lineHeight: 25 },
  bannerText: { marginTop: 5, color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "700" },
  bannerButton: { alignSelf: "flex-start", marginTop: 14, borderRadius: 10, backgroundColor: "white", paddingHorizontal: 14, paddingVertical: 9 },
  bannerButtonText: { color: appColors.primary, fontSize: 12, fontWeight: "900" },
  sectionTitle: { color: appColors.text, fontSize: 16, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }
});

