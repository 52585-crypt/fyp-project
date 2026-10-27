import { useLocalSearchParams } from "expo-router";
import { PaymentDetails } from "../../../src/payments/PaymentDetails";
export default function ProviderPayment() { const { requestId } = useLocalSearchParams<{ requestId?: string }>(); return <PaymentDetails role="provider" requestId={requestId} />; }
