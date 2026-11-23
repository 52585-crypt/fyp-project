import { providerRoutes } from "../../../src/navigation/routes";
import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../../src/auth/AuthProvider";
import { providerOnboardingRoute } from "../../../src/auth/auth.api";
import {
  acceptRequest,
  declineRequest,
  getProviderEarnings,
  updateProviderAvailability
} from "../../../src/requests/requests.api";
import { getProviderServiceTitle, getRequestTitle, getServiceIcon } from "../../../src/requests/serviceCatalog";
import type { ProviderEarnings } from "../../../src/requests/requests.types";
import {
  AppShell,
  BottomNav,
  Card,
  IconBox,
  Metric,
  NoticeBanner,
  PrimaryButton,
  SectionTitle,
  TicketCard
} from "../../../src/ui/components";
import { tokens } from "../../../src/theme/tokens";
import { useDispatchUpdates, useOfferSeconds } from "../../../src/requests/DispatchProvider";
import { formatCurrency } from "../../../src/i18n";
import { useVerification } from "../../../src/verification/VerificationProvider";
import { canAcceptServiceRequests, canSubmitVerification, verificationPresentation } from "../../../src/verification/verification";

export default function ProviderDashboard() {
  const { token, user } = useAuth();
  const verification = useVerification();
  const verificationDisplay = verification.status && !verification.error ? verificationPresentation(verification.status) : null;
  const canContinueVerification = verification.status && !verification.error && canSubmitVerification(verification.status);
  const firstSubmission = canContinueVerification && !verification.status?.submissionId;
  const canAccept = !verification.loading && !verification.error && canAcceptServiceRequests(verification.status);
  const {
    offers: requests,
    activeJob: activeRequest,
    online,
    setOnline,
    refresh,
    connected,
    error: dispatchError
  } = useDispatchUpdates();
  const [earnings, setEarnings] = useState<ProviderEarnings | null>(null);
  const [loading, setLoading] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const incoming = requests[0] || null;
  const seconds = useOfferSeconds(incoming?.dispatch?.expiresAt);
  const serviceLabel = useMemo(() => getProviderServiceTitle(user?.mechanicProfile?.serviceCategory), [user]);

  async function loadRequests() {
    if (!token) return;
    try {
      await Promise.all([refresh(), verification.refresh()]);
      setEarnings(await getProviderEarnings(token));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Unable to refresh provider console.");
    }
  }

  async function onDecline() {
    if (!token || !incoming?.dispatch?.offerId) return;
    try {
      setLoading(true);
      await declineRequest(token, incoming.id, incoming.dispatch.offerId);
      await refresh();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Unable to decline offer.");
    } finally {
      setLoading(false);
    }
  }

  async function onAccept() {
    if (!token || !incoming || !canAccept) return;
    try {
      setLoading(true);
      const accepted = await acceptRequest(token, incoming.id, incoming.dispatch?.offerId);
      await refresh();
      router.push({
        pathname: "/jobs",
        params: { requestId: accepted.id, category: accepted.category }
      });
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to accept dispatch request");
    } finally {
      setLoading(false);
    }
  }

  async function getAvailabilityLocation() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.granted) {
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        let addressText = "Provider live location";

        try {
          const [address] = await Location.reverseGeocodeAsync({
            latitude: current.coords.latitude,
            longitude: current.coords.longitude
          });
          const readable = address
            ? [address.name, address.street, address.city, address.region].filter(Boolean).join(", ")
            : "";
          if (readable) addressText = readable;
        } catch {
          addressText = "Provider live location";
        }

        return {
          lat: current.coords.latitude,
          lng: current.coords.longitude,
          accuracy: current.coords.accuracy,
          capturedAt: new Date(current.timestamp).toISOString(),
          addressText
        };
      }
    } catch {
      // Fall back to stored coordinates if GPS permission is denied
    }

    throw new Error("GPS location permission is required to go on duty.");
  }

  async function toggleOnline() {
    const next = !online;
    if (!token || (next && !canAccept)) return;
    const previous = online;
    setOnline(next);
    try {
      setAvailabilityStatus(next ? "Acquiring GPS fix & broadcasting beacon…" : "Taking patrol unit off duty…");
      const location = next ? await getAvailabilityLocation() : null;
      await updateProviderAvailability(token, next, location);
      setAvailabilityStatus(next ? "On duty · GPS beacon active." : "Off duty · Beacon paused.");
      await refresh();
    } catch (e: any) {
      setOnline(previous);
      setError(e?.response?.data?.message || e?.message || "Failed to update availability");
      setAvailabilityStatus(null);
    }
  }

  useEffect(() => {
    loadRequests();
  }, [token, online]);

  const countdownFormatted = `0:${String(seconds).padStart(2, "0")}s`;

  return (
    <View style={styles.screen}>
      <AppShell
        eyebrow="WORKSHOP PATROL CONSOLE"
        title={user?.name || "Patrol Operator"}
        subtitle={serviceLabel}
        right={
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Duty status toggle"
            accessibilityState={{ checked: online, disabled: !online && !canAccept }}
            disabled={!online && !canAccept}
            hitSlop={8}
            onPress={toggleOnline}
            style={[styles.dutySwitch, online ? styles.dutySwitchOn : styles.dutySwitchOff]}
          >
            <View style={[styles.dutySwitchThumb, online ? styles.dutySwitchThumbOn : null]} />
          </Pressable>
        }
      >
        {/* Giant High-Contrast Duty Status Card */}
        <Card style={online ? styles.dutyCardOnline : styles.dutyCardOffline}>
          <View style={styles.dutyTop}>
            <View style={styles.dutyBadge}>
              <View style={[styles.dutyBeaconDot, online ? styles.dutyBeaconOn : styles.dutyBeaconOff]} />
              <Text style={online ? styles.dutyBadgeTextOn : styles.dutyBadgeTextOff}>
                {online ? "ON DUTY · READY FOR DISPATCH" : "OFF DUTY · PATROL DOCKED"}
              </Text>
            </View>
            <View style={styles.dutyIconBox}>
              <Ionicons
                name="construct"
                size={22}
                color={online ? tokens.colors.brandSoft : tokens.colors.inkSubtle}
              />
            </View>
          </View>
          <Text style={styles.dutyTitle}>
            {online ? "Receiving Highway Dispatches" : "You are currently offline"}
          </Text>
          <Text style={styles.dutySubtext}>
            {online
              ? `Your unit is registered for ${serviceLabel} emergency requests within your patrol sector.`
              : "Switch your status to ON DUTY above to begin receiving roadside breakdown offers."}
          </Text>
          {availabilityStatus ? (
            <Text style={styles.availabilityStatusText}>{availabilityStatus}</Text>
          ) : null}
        </Card>

        {/* Tactical Metric Strip */}
        <View style={styles.metricsStrip}>
          <Metric label="INCOMING OFFERS" value={String(requests.length)} icon="briefcase" />
          <Metric
            label="TODAY'S EARNINGS"
            value={formatCurrency(earnings?.today || 0)}
            icon="wallet"
          />
          <Metric
            label="PATROL RATING"
            value={user?.ratingCount ? `★ ${Number(user.ratingAvg || 0).toFixed(1)} (${user.ratingCount})` : "New Specialist"}
            icon="star"
          />
        </View>

        {/* Active In-Progress Job Ticket */}
        {activeRequest ? (
          <>
            <SectionTitle title="Active In-Progress Dispatch" action={activeRequest.status.replaceAll("_", " ").toUpperCase()} />
            <TicketCard
              ticketId={activeRequest.id}
              status={activeRequest.status.replaceAll("_", " ")}
              statusTone="arrived"
              title={getRequestTitle(activeRequest.category)}
            >
              <View style={styles.jobInfoRow}>
                <IconBox icon={getServiceIcon(activeRequest.category)} tone="success" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobAddressText}>
                    {activeRequest.pickupLocation?.addressText || "Pickup Coordinates"}
                  </Text>
                  <Text style={styles.jobFeeText}>
                    Job Value:{" "}
                    <Text style={styles.jobFeeVal}>{formatCurrency(activeRequest.estimate?.total || 0)}</Text>
                  </Text>
                </View>
              </View>
              <PrimaryButton
                title="Resume Active Service Job"
                icon="navigate"
                variant="success"
                onPress={() =>
                  router.push({
                    pathname: "/jobs",
                    params: { requestId: activeRequest.id, category: activeRequest.category }
                  })
                }
                style={{ marginTop: tokens.spacing.sm }}
              />
            </TicketCard>
          </>
        ) : null}

        {/* Incoming Dispatch Offer Ticket */}
        <SectionTitle
          title="Dispatch Offer"
          action={incoming ? `${countdownFormatted} remaining` : connected ? "PATROL BEACON ACTIVE" : "SYNCING"}
        />
        {incoming ? (
          <TicketCard
            ticketId={incoming.id}
            status={`EXPIRES IN ${countdownFormatted}`}
            statusTone="accent"
            title={getRequestTitle(incoming.category)}
            style={styles.incomingTicketBorder}
          >
            <View style={styles.incomingContent}>
              <View style={styles.incomingRow}>
                <Ionicons name="location" size={18} color={tokens.colors.brand} />
                <Text style={styles.incomingAddress} numberOfLines={2}>
                  {incoming.pickupLocation?.addressText || "Pickup Location GPS"}
                </Text>
              </View>
              <View style={styles.incomingRow}>
                <Ionicons name="cash-outline" size={18} color={tokens.colors.brand} />
                <Text style={styles.incomingRate}>
                  Estimated job total:{" "}
                  <Text style={styles.incomingRateVal}>{formatCurrency(incoming.estimate?.total || 0)}</Text>
                </Text>
              </View>
            </View>

            {error || dispatchError ? (
              <View style={{ marginVertical: tokens.spacing.xs }}>
                <NoticeBanner tone="danger" title="Dispatch Warning" message={error || dispatchError || ""} />
              </View>
            ) : null}

            <View style={styles.incomingActions}>
              <PrimaryButton
                title="Decline"
                variant="outline"
                disabled={loading}
                style={{ flex: 1 }}
                onPress={onDecline}
              />
              <PrimaryButton
                title="Details"
                icon="reader"
                variant="outline"
                disabled={!incoming}
                style={{ flex: 1 }}
                onPress={() => {
                  router.push(providerRoutes.incoming(incoming.id));
                }}
              />
              <PrimaryButton
                title={loading ? "Accepting…" : "Accept Job"}
                icon="checkmark"
                variant="success"
                disabled={loading || seconds === 0 || !canAccept}
                style={{ flex: 1.5 }}
                onPress={onAccept}
              />
            </View>
          </TicketCard>
        ) : (
          <Card style={styles.noOfferCard}>
            <View style={styles.noOfferRow}>
              <IconBox icon="radio-outline" tone="primary" />
              <View style={{ flex: 1 }}>
                <Text style={styles.noOfferTitle}>
                  {online ? "Monitoring Roadside Broadcasts" : "Patrol Console Docked"}
                </Text>
                <Text style={styles.noOfferText}>
                  {online
                    ? "New breakdown dispatches in your area will appear here with an audible alert."
                    : "Turn duty on to enter the active dispatch queue."}
                </Text>
              </View>
            </View>
            <PrimaryButton
              title="Refresh Queue"
              icon="refresh"
              variant="outline"
              onPress={loadRequests}
              style={{ marginTop: tokens.spacing.sm }}
            />
          </Card>
        )}

        {/* Verification & Compliance Status */}
        <SectionTitle title="Patrol Credentials" action="STATUS" />
        <Card style={styles.verifyCard}>
          <IconBox
            icon="shield-checkmark"
            tone={canAccept ? "success" : "warning"}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.verifyTitle}>
              {verificationDisplay?.title ?? "Check verification"}
            </Text>
            <Text style={styles.verifyText}>
              {verificationDisplay?.message ?? "Load your verification status before going on duty or accepting requests."}
            </Text>
          </View>
        </Card>
        <PrimaryButton title={canContinueVerification ? "Continue verification" : "View verification"} icon="shield-checkmark" variant="outline"
          onPress={() => router.push(firstSubmission ? providerOnboardingRoute : "/verification")} />
      </AppShell>
      <BottomNav role="provider" active="Home" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.colors.canvas
  },
  dutySwitch: {
    width: 60,
    height: 34,
    borderRadius: tokens.radii.pill,
    padding: 3,
    justifyContent: "center",
    borderWidth: tokens.borders.standard
  },
  dutySwitchOn: {
    backgroundColor: tokens.colors.brandSoft,
    borderColor: tokens.colors.brand
  },
  dutySwitchOff: {
    backgroundColor: tokens.colors.canvasSubtle,
    borderColor: tokens.colors.borderStrong
  },
  dutySwitchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: tokens.colors.inkMuted
  },
  dutySwitchThumbOn: {
    marginLeft: 26,
    backgroundColor: tokens.colors.brand
  },
  dutyCardOnline: {
    backgroundColor: tokens.colors.dark,
    borderWidth: tokens.borders.standard,
    borderColor: tokens.colors.brand,
    borderRadius: tokens.radii.md,
    padding: tokens.spacing.xl
  },
  dutyCardOffline: {
    backgroundColor: tokens.colors.surface,
    borderWidth: tokens.borders.standard,
    borderColor: tokens.colors.borderStrong,
    borderRadius: tokens.radii.md,
    padding: tokens.spacing.xl
  },
  dutyTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacing.sm
  },
  dutyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radii.tag,
    borderWidth: tokens.borders.hairline,
    borderColor: "rgba(255, 255, 255, 0.14)"
  },
  dutyBeaconDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  dutyBeaconOn: {
    backgroundColor: tokens.colors.statusSuccess
  },
  dutyBeaconOff: {
    backgroundColor: tokens.colors.statusDanger
  },
  dutyBadgeTextOn: {
    color: tokens.colors.brandSoft,
    fontSize: tokens.typography.sizes.caption,
    fontFamily: tokens.typography.fonts.mono,
    fontWeight: "700",
    letterSpacing: 0.5
  },
  dutyBadgeTextOff: {
    color: tokens.colors.inkMuted,
    fontSize: tokens.typography.sizes.caption,
    fontFamily: tokens.typography.fonts.mono,
    fontWeight: "700",
    letterSpacing: 0.5
  },
  dutyIconBox: {
    width: 38,
    height: 38,
    borderRadius: tokens.radii.sm,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: tokens.borders.hairline,
    borderColor: "rgba(255, 255, 255, 0.12)"
  },
  dutyTitle: {
    marginTop: tokens.spacing.md,
    color: tokens.colors.surface,
    fontSize: tokens.typography.sizes.displayMedium,
    lineHeight: tokens.typography.lineHeights.displayMedium,
    fontWeight: "900"
  },
  dutySubtext: {
    marginTop: tokens.spacing.xs,
    color: tokens.colors.inkSubtle,
    fontSize: tokens.typography.sizes.bodySmall,
    lineHeight: tokens.typography.lineHeights.bodySmall
  },
  availabilityStatusText: {
    marginTop: tokens.spacing.sm,
    color: tokens.colors.brandSoft,
    fontSize: tokens.typography.sizes.caption,
    fontFamily: tokens.typography.fonts.mono,
    fontWeight: "600"
  },
  metricsStrip: {
    marginTop: tokens.spacing.md,
    flexDirection: "row",
    gap: tokens.spacing.sm
  },
  jobInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs
  },
  jobAddressText: {
    color: tokens.colors.ink,
    fontSize: tokens.typography.sizes.bodySmall,
    fontWeight: "700"
  },
  jobFeeText: {
    marginTop: 2,
    color: tokens.colors.inkMuted,
    fontSize: tokens.typography.sizes.caption
  },
  jobFeeVal: {
    color: tokens.colors.brand,
    fontFamily: tokens.typography.fonts.mono,
    fontWeight: "700"
  },
  incomingTicketBorder: {
    borderWidth: tokens.borders.heavy,
    borderColor: tokens.colors.accent
  },
  incomingContent: {
    backgroundColor: tokens.colors.canvasSubtle,
    borderRadius: tokens.radii.sm,
    borderWidth: tokens.borders.hairline,
    borderColor: tokens.colors.border,
    padding: tokens.spacing.sm,
    gap: tokens.spacing.xs,
    marginVertical: tokens.spacing.xs
  },
  incomingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  incomingAddress: {
    flex: 1,
    color: tokens.colors.ink,
    fontSize: tokens.typography.sizes.bodySmall,
    fontWeight: "600"
  },
  incomingRate: {
    color: tokens.colors.inkMuted,
    fontSize: tokens.typography.sizes.caption,
    fontWeight: "600"
  },
  incomingRateVal: {
    color: tokens.colors.brand,
    fontSize: tokens.typography.sizes.bodySmall,
    fontFamily: tokens.typography.fonts.mono,
    fontWeight: "700"
  },
  incomingActions: {
    flexDirection: "row",
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.sm
  },
  noOfferCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: tokens.borders.standard,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radii.md,
    padding: tokens.spacing.lg
  },
  noOfferRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.md
  },
  noOfferTitle: {
    color: tokens.colors.ink,
    fontSize: tokens.typography.sizes.headline,
    fontWeight: "900"
  },
  noOfferText: {
    marginTop: 2,
    color: tokens.colors.inkMuted,
    fontSize: tokens.typography.sizes.bodySmall,
    lineHeight: tokens.typography.lineHeights.bodySmall
  },
  verifyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.md,
    backgroundColor: tokens.colors.surface,
    borderWidth: tokens.borders.standard,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radii.md,
    padding: tokens.spacing.md
  },
  verifyTitle: {
    color: tokens.colors.ink,
    fontSize: tokens.typography.sizes.body,
    fontWeight: "900"
  },
  verifyText: {
    marginTop: 2,
    color: tokens.colors.inkMuted,
    fontSize: tokens.typography.sizes.caption,
    lineHeight: tokens.typography.lineHeights.caption
  }
});
