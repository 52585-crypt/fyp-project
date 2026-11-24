import React, { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { AppShell, BottomNav, Card, Field, IconBox, Metric, PrimaryButton, SectionTitle, StatusPill } from "../../../src/ui/components";
import { useAuth } from "../../../src/auth/AuthProvider";
import { getMyWallet, getProviderEarnings, submitWalletTopup } from "../../../src/requests/requests.api";
import type { ProviderEarnings, TopupMethod, WalletTransaction } from "../../../src/requests/requests.types";
import { ui } from "../../../src/ui/system";

const METHODS: { value: TopupMethod; label: string }[] = [
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "Easypaisa" },
  { value: "bank_transfer", label: "Bank" }
];

function pkr(value: number | null | undefined) {
  return `PKR ${Math.round(Number(value || 0)).toLocaleString()}`;
}

function errorMessage(e: any, fallback: string) {
  return e?.response?.data?.message || e?.message || fallback;
}

function transactionTitle(t: WalletTransaction) {
  if (t.type === "commission_debit") return `Platform share - ${String(t.breakdown?.category || "job").replace("_", " ")}`;
  if (t.type === "topup_credit") return `Dues payment (${String(t.method || "").replace("_", " ")})`;
  return "Adjustment";
}

export default function ProviderEarningsScreen() {
  const { token } = useAuth();
  const [earnings, setEarnings] = useState<ProviderEarnings | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<TopupMethod>("jazzcash");
  const [reference, setReference] = useState("");
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      const [providerEarnings, wallet] = await Promise.all([getProviderEarnings(token), getMyWallet(token)]);
      setEarnings(providerEarnings);
      setTransactions(wallet.transactions);
    } catch (e: any) {
      setError(errorMessage(e, "Failed to load earnings"));
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const wallet = earnings?.wallet;

  function openPayForm() {
    setAmount(wallet?.dues ? String(Math.round(wallet.dues)) : "");
    setNotice(null);
    setShowPay(true);
  }

  async function pickProof() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission is required");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.3, base64: true, mediaTypes: ["images"] });
    const asset = result.canceled ? null : result.assets?.[0];
    if (asset?.base64) setProofImage(`data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`);
  }

  async function onSubmitPayment() {
    if (!token) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter the amount you paid");
      return;
    }
    if (reference.trim().length < 4) {
      setError("Enter the transaction ID from your payment message");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await submitWalletTopup(token, { amount: value, method, reference: reference.trim(), proofImage });
      setShowPay(false);
      setReference("");
      setProofImage(null);
      setNotice("Payment submitted. Admin will verify it and update your dues.");
      await load();
    } catch (e: any) {
      setError(errorMessage(e, "Failed to submit payment"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Earnings" subtitle="Your take-home earnings and platform dues.">
        <View style={styles.metrics}>
          <Metric label="Today" value={pkr(earnings?.today)} icon="cash" />
          <Metric label="This week" value={pkr(earnings?.week)} icon="trending-up" />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <SectionTitle title="Wallet" action={wallet?.isBlocked ? "Blocked" : "Active"} />
        <Card style={[styles.walletCard, wallet?.isBlocked ? styles.walletBlocked : null] as any}>
          <View style={styles.walletTop}>
            <IconBox icon="wallet" tone={wallet?.dues ? (wallet.isBlocked ? "danger" : "warning") : "success"} />
            <View style={{ flex: 1 }}>
              <Text style={styles.walletLabel}>{wallet?.dues ? "Dues to pay RapidAssist" : "No dues"}</Text>
              <Text style={styles.walletValue}>{pkr(wallet?.dues)}</Text>
              {wallet?.debtLimit != null ? (
                <Text style={styles.meta}>
                  Limit {pkr(wallet.debtLimit)} - {wallet.isBlocked ? "new jobs are paused until you pay" : `${pkr(wallet.remainingLimit)} left before jobs pause`}
                </Text>
              ) : null}
              {wallet?.pendingTopupCount ? (
                <Text style={styles.meta}>{pkr(wallet.pendingTopupAmount)} payment waiting for admin approval</Text>
              ) : null}
            </View>
          </View>
          <Text style={styles.explain}>
            Customers pay you cash. RapidAssist's commission and service fee from each job are added to your dues.
          </Text>
          {!showPay ? (
            <PrimaryButton
              title="Pay Dues"
              icon="card"
              variant={wallet?.isBlocked ? "danger" : "primary"}
              disabled={!wallet?.dues}
              onPress={openPayForm}
            />
          ) : null}
        </Card>

        {showPay ? (
          <Card style={styles.payCard}>
            <Text style={styles.title}>Pay your dues</Text>
            <Text style={styles.meta}>Send the amount to RapidAssist on JazzCash, Easypaisa or bank, then enter the transaction ID here.</Text>
            <View style={styles.methods}>
              {METHODS.map((item) => (
                <Pressable
                  key={item.value}
                  onPress={() => setMethod(item.value)}
                  style={[styles.methodChip, method === item.value ? styles.methodChipActive : null]}
                >
                  <Text style={[styles.methodText, method === item.value ? styles.methodTextActive : null]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Amount (PKR)" icon="cash" keyboardType="numeric" value={amount} onChangeText={setAmount} />
            <Field label="Transaction ID" icon="receipt" placeholder="e.g. 0123456789" value={reference} onChangeText={setReference} />
            <PrimaryButton title={proofImage ? "Change screenshot" : "Attach screenshot (optional)"} icon="image" variant="outline" onPress={pickProof} />
            {proofImage ? <Image source={{ uri: proofImage }} style={styles.proof} /> : null}
            <View style={styles.actions}>
              <PrimaryButton title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => setShowPay(false)} />
              <PrimaryButton title={submitting ? "Sending..." : "Submit"} icon="send" style={{ flex: 1 }} disabled={submitting} onPress={onSubmitPayment} />
            </View>
          </Card>
        ) : null}

        <SectionTitle title="Summary" />
        <Card style={styles.summary}>
          <Row label="Collected from customers" value={pkr(earnings?.collected)} />
          <Row label="RapidAssist share" value={`- ${pkr(earnings?.platformShare)}`} />
          <Row label="Your earnings" value={pkr(earnings?.total)} strong />
          <Row label="Dues paid so far" value={pkr(wallet?.totalPaid)} />
          <Row label="Completed jobs" value={String(earnings?.completedJobs || 0)} />
        </Card>

        <SectionTitle title="Recent jobs" />
        {(earnings?.recent || []).map((request) => (
          <Card key={request.id} style={styles.row}>
            <IconBox icon="receipt" />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{request.category.replace("_", " ").toUpperCase()}</Text>
              <Text style={styles.meta}>{request.pickupLocation?.addressText || "Completed job"}</Text>
              {request.settlement ? (
                <Text style={styles.meta}>
                  Collected {pkr(request.estimate?.total)} - RapidAssist {pkr(request.settlement.platformRevenue)}
                </Text>
              ) : null}
            </View>
            <StatusPill label={pkr(request.settlement ? request.settlement.providerEarning : request.estimate?.total)} tone="success" />
          </Card>
        ))}
        {!earnings?.recent?.length ? (
          <Card style={styles.row}>
            <IconBox icon="receipt" />
            <Text style={styles.title}>No completed jobs yet</Text>
          </Card>
        ) : null}

        {transactions.length ? <SectionTitle title="Wallet history" /> : null}
        {transactions.map((t) => (
          <Card key={t.id} style={styles.row}>
            <IconBox icon={t.type === "topup_credit" ? "arrow-down-circle" : "arrow-up-circle"} tone={t.amount >= 0 ? "success" : "warning"} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{transactionTitle(t)}</Text>
              <Text style={styles.meta}>
                {new Date(t.createdAt).toLocaleDateString()}
                {t.reference ? ` - Ref ${t.reference}` : ""}
                {t.status !== "approved" ? ` - ${t.status}` : ""}
              </Text>
            </View>
            <StatusPill
              label={`${t.amount >= 0 ? "+" : "-"}${pkr(Math.abs(t.amount))}`}
              tone={t.status === "rejected" ? "danger" : t.status === "pending" ? "warning" : t.amount >= 0 ? "success" : "primary"}
            />
          </Card>
        ))}
      </AppShell>
      <BottomNav role="provider" active="Earn" />
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.meta, strong ? styles.strong : null]}>{label}</Text>
      <Text style={[styles.summaryValue, strong ? styles.strong : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row", gap: 12, marginBottom: 14 },
  row: { marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: ui.colors.text, fontSize: 14, fontWeight: "900" },
  meta: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700" },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "800", marginBottom: 10 },
  notice: { color: ui.colors.success, fontSize: 12, fontWeight: "800", marginBottom: 10 },
  walletCard: { gap: 12, marginBottom: 12 },
  walletBlocked: { borderColor: ui.colors.danger, backgroundColor: ui.colors.dangerSoft },
  walletTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  walletLabel: { color: ui.colors.muted, fontSize: 12, fontWeight: "900" },
  walletValue: { marginTop: 2, color: ui.colors.text, fontSize: 24, fontWeight: "900" },
  explain: { color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  payCard: { gap: 12, marginBottom: 12 },
  methods: { flexDirection: "row", gap: 8 },
  methodChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.colors.border,
    alignItems: "center",
    backgroundColor: ui.colors.surface
  },
  methodChipActive: { borderColor: ui.colors.primary, backgroundColor: ui.colors.primarySoft },
  methodText: { color: ui.colors.muted, fontSize: 13, fontWeight: "900" },
  methodTextActive: { color: ui.colors.primary },
  proof: { width: "100%", height: 160, borderRadius: 12, resizeMode: "cover" },
  actions: { flexDirection: "row", gap: 10 },
  summary: { gap: 8, marginBottom: 12 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryValue: { color: ui.colors.text, fontSize: 13, fontWeight: "800" },
  strong: { color: ui.colors.text, fontSize: 14, fontWeight: "900" }
});
