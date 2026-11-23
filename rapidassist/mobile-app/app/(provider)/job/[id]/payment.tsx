import { useLocalSearchParams } from "expo-router";
import { PaymentDetails } from "../../../../src/payments/PaymentDetails";
export default function ProviderPayment() { const { id } = useLocalSearchParams<{ id?: string }>(); return <PaymentDetails role="provider" requestId={id} />; }
