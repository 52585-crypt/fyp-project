import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { AppShell, BottomNav, Card, PrimaryButton, StatusPill } from "../ui/components";
import { ui } from "../ui/system";
import { confirmCashCollected, getPaymentBundle, PaymentBundle, submitPayment } from "./payments.api";

const money = (minor: number) => `PKR ${(minor / 100).toLocaleString()}`;
const submissionId = () => `pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

export function PaymentDetails({ requestId, role }: { requestId?: string; role: "user" | "provider" }) {
  const { token } = useAuth();
  const [bundle, setBundle] = useState<PaymentBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const pendingSubmission = useRef<{ requestId: string; method: string; simulationResult?: string; key: string } | null>(null);

  async function load() {
    if (!token || !requestId) { setLoading(false); setError("Open payment from a completed job."); return; }
    setLoading(true);
    try { setBundle(await getPaymentBundle(token, requestId)); setError(""); }
    catch (e: any) { setError(e?.response?.data?.message || e?.message || "Unable to load invoice"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [requestId, token]);

  async function pay(method: "cash" | "online_simulated", simulationResult?: "success" | "failed") {
    if (!token || !requestId || busy) return;
    try {
      setBusy(true); setError("");
      const pending = pendingSubmission.current;
      if (!pending || pending.requestId !== requestId || pending.method !== method || pending.simulationResult !== simulationResult) {
        pendingSubmission.current = { requestId, method, simulationResult, key: submissionId() };
      }
      setBundle(await submitPayment(token, requestId, { method, simulationResult, idempotencyKey: pendingSubmission.current!.key }));
      pendingSubmission.current = null;
    } catch (e: any) { setError(e?.response?.data?.message || e?.message || "Payment could not be processed"); }
    finally { setBusy(false); }
  }

  async function exportInvoice() {
    if (!bundle || exporting) return;
    try {
      setExporting(true); setError("");
      const rows = bundle.invoice.lines.map((line) => `<tr><td>${escapeHtml(line.label)}</td><td>${money(line.amountMinor)}</td></tr>`).join("");
      const html = `<html><body style="font-family:Arial;padding:32px;color:#182e28"><h1>RapidAssist</h1><h2>Invoice ${escapeHtml(bundle.invoice.invoiceNumber)}</h2><p>Finalized ${new Date(bundle.invoice.finalizedAt).toLocaleString()}</p><table style="width:100%;border-collapse:collapse">${rows}<tr style="font-weight:bold;border-top:2px solid #182e28"><td>Total</td><td>${money(bundle.invoice.totalMinor)}</td></tr></table><p>Payment: ${escapeHtml(bundle.payment?.status || "not selected")}</p></body></html>`;
      if (Platform.OS === "web") { await Print.printAsync({ html }); return; }
      const file = await Print.printToFileAsync({ html });
      if (!(await Sharing.isAvailableAsync())) throw new Error("PDF sharing is unavailable on this device.");
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "Share RapidAssist invoice" });
    } catch (error: any) {
      setError(error?.message || "Unable to export the invoice. Please try again.");
    } finally { setExporting(false); }
  }

  const payment = bundle?.payment;
  return <View style={{ flex: 1 }}>
    <AppShell title="Payment & Invoice" subtitle={bundle?.invoice.invoiceNumber || "Final bill for the completed job"} right={<PrimaryButton title="Refresh" icon="refresh" variant="outline" onPress={() => void load()} />}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {bundle ? <>
        <Card style={styles.invoice}>
          {bundle.invoice.lines.map((line) => <View key={line.label} style={styles.row}><Text style={styles.label}>{line.label}</Text><Text style={styles.value}>{money(line.amountMinor)}</Text></View>)}
          <View style={[styles.row, styles.total]}><Text style={styles.totalText}>Total</Text><Text style={styles.totalText}>{money(bundle.invoice.totalMinor)}</Text></View>
          <View style={styles.status}><Text style={styles.label}>Payment status</Text><StatusPill label={payment?.status || "not selected"} tone={payment?.status === "paid" ? "success" : payment?.status === "failed" ? "danger" : "warning"} /></View>
          <PrimaryButton title={exporting ? "Exporting…" : "Export Invoice PDF"} disabled={exporting} icon="share" variant="outline" onPress={() => void exportInvoice()} />
        </Card>

        {role === "user" && !payment ? <Card style={styles.actions}>
          <Text style={styles.heading}>Choose payment method</Text>
          <PrimaryButton title="Pay Cash" icon="cash" variant="outline" disabled={busy} onPress={() => void pay("cash")} />
          <PrimaryButton title="Simulate Online Success" icon="card" variant="success" disabled={busy} onPress={() => void pay("online_simulated", "success")} />
          <PrimaryButton title="Simulate Online Failure" icon="close-circle" variant="danger" disabled={busy} onPress={() => void pay("online_simulated", "failed")} />
        </Card> : null}
        {role === "user" && payment?.method === "online_simulated" && payment.status === "failed" ? <PrimaryButton title="Retry Simulated Payment" icon="refresh" variant="success" disabled={busy} onPress={() => void pay("online_simulated", "success")} /> : null}
        {role === "provider" && payment?.method === "cash" && payment.status === "pending" ? <PrimaryButton title="Confirm Cash Collected" icon="checkmark-circle" variant="success" disabled={busy} onPress={async () => {
          if (!token || !requestId) return;
          try { setBusy(true); const updated = await confirmCashCollected(token, requestId); setBundle({ ...bundle, payment: updated }); }
          catch (e: any) { setError(e?.response?.data?.message || e?.message || "Unable to confirm cash"); }
          finally { setBusy(false); }
        }} /> : null}
      </> : loading ? <Text style={styles.empty}>Loading finalized invoice…</Text> : null}
    </AppShell>
    <BottomNav role={role} active={role === "provider" ? "Earn" : "Track"} />
  </View>;
}

const styles = StyleSheet.create({
  invoice: { gap: 13 }, actions: { marginTop: 14, gap: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  label: { flex: 1, color: ui.colors.muted, fontSize: 13, fontWeight: "700" },
  value: { color: ui.colors.text, fontSize: 13, fontWeight: "900" },
  total: { borderTopWidth: 1, borderTopColor: ui.colors.border, paddingTop: 13 },
  totalText: { color: ui.colors.text, fontSize: 17, fontWeight: "900" },
  status: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  error: { color: ui.colors.danger, marginBottom: 12, fontWeight: "700" },
  empty: { color: ui.colors.muted, textAlign: "center", marginTop: 30 }
});
