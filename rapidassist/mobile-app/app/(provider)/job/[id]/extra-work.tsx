import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Banner, Button, Card, Header, Input, PhotoUpload, PriceBreakdown, Screen, Text, TextArea } from "../../../../src/design/components";
import { tokens } from "../../../../src/design/tokens";
import { useProviderJob } from "../../../../src/requests/provider/useProviderJob";
import { parseRequestId } from "../../../../src/requests/requestId";

const amount = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0);

/** Mechanic: send inspection findings + extra work for customer approval (PATCH /extra-work). */
export default function ExtraWork() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const job = useProviderJob(parseRequestId(id));
  const [findings, setFindings] = useState("");
  const [part, setPart] = useState("");
  const [partPrice, setPartPrice] = useState("");
  const [labour, setLabour] = useState("");
  const [time, setTime] = useState("");
  const total = amount(partPrice) + amount(labour);
  const valid = (findings.trim() || part.trim()) && total > 0;
  const wrongStage = job.request && job.request.status !== "inspection_started";

  async function send() {
    const ok = await job.requestExtraWork({
      description: findings.trim() || null, partName: part.trim() || null,
      partPrice: amount(partPrice), laborCharge: amount(labour), estimatedTime: time.trim() || null
    });
    if (ok) router.back();
  }

  return (
    <Screen header={<Header title="Inspection & Extra Work" />}
      footer={<Button title="Send for Approval" icon="send" disabled={!valid || Boolean(wrongStage)} loading={job.updating} onPress={send} />}>
      {wrongStage ? <Banner tone="warning" message="Extra work can only be requested while the inspection is in progress." /> : null}
      <TextArea label="Inspection Findings" placeholder="e.g. Battery is weak and needs replacement." maxLength={250} value={findings} onChangeText={setFindings} />
      <Card>
        <Text variant="bodySmallStrong">Recommended Extra Work</Text>
        <Input label="Part / work" placeholder="e.g. Battery replacement" value={part} onChangeText={setPart} />
        <View style={styles.row}>
          <View style={styles.flex}><Input label="Part price (Rs.)" keyboardType="numeric" value={partPrice} onChangeText={setPartPrice} placeholder="0" /></View>
          <View style={styles.flex}><Input label="Labour (Rs.)" keyboardType="numeric" value={labour} onChangeText={setLabour} placeholder="0" /></View>
        </View>
        <Input label="Estimated time" optional placeholder="e.g. 45 min" value={time} onChangeText={setTime} />
      </Card>
      {total > 0 ? (
        <Card><PriceBreakdown lines={[{ label: part || "Parts", amount: amount(partPrice) }, { label: "Labour", amount: amount(labour) }]} total={total} totalLabel="Extra Work Total" /></Card>
      ) : null}
      <Card>
        <Text variant="bodySmallStrong">Upload Proof (Photos)</Text>
        <PhotoUpload title="Add photo" icon="camera-outline" optional />
        <Text variant="caption" color="muted">Photo upload for extra work is coming soon.</Text>
      </Card>
      {job.error ? <Banner tone="danger" message={job.error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", gap: tokens.space.md }, flex: { flex: 1 } });
