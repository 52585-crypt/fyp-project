import { useLocalSearchParams } from "expo-router";
import { PaymentDetails } from "../../../src/payments/PaymentDetails";
export default function UserPayment() { const { requestId } = useLocalSearchParams<{ requestId?: string }>(); return <PaymentDetails role="user" requestId={requestId} />; }
