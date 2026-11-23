import React from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { tokens } from "../../src/theme/tokens";

const services = [
  { label: "Car Mechanic", icon: "construct" as const },
  { label: "Fuel Delivery", icon: "water" as const },
  { label: "Car Towing", icon: "car" as const }
];

export default function Welcome() {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      {/* Section G — Subtle decorative wave arc at bottom */}
      <View pointerEvents="none" style={styles.bottomDecoration} />

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Section A — App Branding */}
          <View style={styles.brandingSection}>
            <View style={styles.logoWrap}>
              <Image
                source={require("../../assets/icon.png")}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>
            <Text style={styles.appName}>RapidAssist</Text>
            <Text style={styles.tagline}>Your Roadside Companion</Text>
          </View>

          {/* Section B — Welcome Heading */}
          <View style={styles.headingSection}>
            <Text style={styles.welcomeHeading}>
              Welcome to{"\n"}
              <Text style={styles.welcomeHeadingGreen}>RapidAssist</Text>
            </Text>
            <Text style={styles.supportingText}>
              Get instant roadside help for breakdowns, fuel and towing — anytime, anywhere.
            </Text>
          </View>

          {/* Section C — Service Highlights */}
          <View style={styles.servicesSection}>
            {services.map((item, index) => (
              <React.Fragment key={item.label}>
                <View style={styles.serviceCol}>
                  <View style={styles.serviceIconWrap}>
                    <Ionicons name={item.icon} size={24} color={tokens.colors.brand} />
                  </View>
                  <Text style={styles.serviceLabel}>{item.label}</Text>
                </View>
                {index < services.length - 1 ? (
                  <View style={styles.serviceDivider} />
                ) : null}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Action Buttons Section */}
        <View style={styles.actionsSection}>
          {/* Section D — Primary Action */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Get Started"
            onPress={() => router.push("/(auth)/signup")}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed ? styles.primaryBtnPressed : null
            ]}
          >
            <Text style={styles.primaryBtnText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={18} color="white" />
          </Pressable>

          {/* Section E — Secondary Action */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="I already have an account"
            onPress={() => router.push("/(auth)/login")}
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed ? styles.secondaryBtnPressed : null
            ]}
          >
            <Text style={styles.secondaryBtnText}>I already have an account</Text>
          </Pressable>

          {/* Section F — Provider Registration */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Register as a Service Provider"
            onPress={() =>
              router.push({
                pathname: "/(auth)/signup",
                params: { role: "mechanic" }
              })
            }
            style={({ pressed }) => [
              styles.providerLinkWrap,
              pressed ? styles.providerLinkPressed : null
            ]}
          >
            <Text style={styles.providerLinkText}>Register as a Provider</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.colors.surface
  },
  bottomDecoration: {
    position: "absolute",
    left: "-15%",
    right: "-15%",
    bottom: -60,
    height: 160,
    borderTopLeftRadius: 300,
    borderTopRightRadius: 300,
    backgroundColor: tokens.colors.brandSoft,
    opacity: 0.65,
    zIndex: 0
  },
  container: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    zIndex: 1
  },
  content: {
    alignItems: "center",
    width: "100%"
  },
  brandingSection: {
    alignItems: "center",
    marginTop: 12
  },
  logoWrap: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: tokens.colors.brandSoft,
    borderWidth: tokens.borders.standard,
    borderColor: tokens.colors.brand,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: tokens.colors.brand,
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }
  },
  logoImage: {
    width: "100%",
    height: "100%"
  },
  appName: {
    marginTop: 12,
    fontSize: 28,
    fontWeight: "900",
    color: tokens.colors.ink,
    letterSpacing: -0.6,
    textAlign: "center"
  },
  tagline: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "600",
    color: tokens.colors.inkMuted,
    textAlign: "center"
  },
  headingSection: {
    alignItems: "center",
    marginTop: 32,
    paddingHorizontal: 12
  },
  welcomeHeading: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "900",
    color: tokens.colors.ink,
    textAlign: "center",
    letterSpacing: -0.8
  },
  welcomeHeadingGreen: {
    color: tokens.colors.brand
  },
  supportingText: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.inkMuted,
    textAlign: "center",
    maxWidth: 320,
    fontWeight: "400"
  },
  servicesSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 36,
    paddingVertical: 14,
    paddingHorizontal: 8
  },
  serviceCol: {
    flex: 1,
    alignItems: "center"
  },
  serviceIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: tokens.colors.brandSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  serviceLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: tokens.colors.ink,
    textAlign: "center"
  },
  serviceDivider: {
    width: 1,
    height: 36,
    backgroundColor: tokens.colors.borderSubtle
  },
  actionsSection: {
    width: "100%",
    gap: 12,
    marginTop: 24,
    alignItems: "center"
  },
  primaryBtn: {
    width: "100%",
    height: 54,
    borderRadius: 14,
    backgroundColor: tokens.colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    elevation: 3,
    shadowColor: tokens.colors.brand,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }
  },
  primaryBtnPressed: {
    backgroundColor: tokens.colors.brandPressed,
    transform: [{ scale: 0.99 }]
  },
  primaryBtnText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3
  },
  secondaryBtn: {
    width: "100%",
    height: 54,
    borderRadius: 14,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1.5,
    borderColor: tokens.colors.brand,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryBtnPressed: {
    backgroundColor: tokens.colors.brandSoft,
    transform: [{ scale: 0.99 }]
  },
  secondaryBtnText: {
    color: tokens.colors.brand,
    fontSize: 15,
    fontWeight: "700"
  },
  providerLinkWrap: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  providerLinkPressed: {
    opacity: 0.7
  },
  providerLinkText: {
    color: tokens.colors.brand,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2
  }
});
