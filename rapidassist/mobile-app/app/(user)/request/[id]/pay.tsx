import { useLocalSearchParams } from "expo-router";
import { PaymentDetails } from "../../../../src/payments/PaymentDetails";
export default function UserPayment() { const { id } = useLocalSearchParams<{ id?: string }>(); return <PaymentDetails role="user" requestId={id} />; }
