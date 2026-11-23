import { useLocalSearchParams } from "expo-router";
import { PaymentView } from "../../../../src/payments/PaymentView";

export default function ProviderPayment() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <PaymentView role="provider" requestId={id} />;
}
