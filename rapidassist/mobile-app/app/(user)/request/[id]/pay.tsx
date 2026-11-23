import { router, useLocalSearchParams } from "expo-router";
import { customerRoutes } from "../../../../src/navigation/routes";
import { PaymentView } from "../../../../src/payments/PaymentView";

export default function CustomerPay() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <PaymentView role="user" requestId={id} onDone={() => (id ? router.replace(customerRoutes.review(id)) : router.back())} />;
}
