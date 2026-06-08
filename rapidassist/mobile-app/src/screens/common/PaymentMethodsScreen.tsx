import React, { useState } from "react";
import { View } from "react-native";
import { CustomButton } from "../../components/CustomButton";
import { PaymentCard } from "../../components/PaymentCard";
import type { PaymentMethod } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

export function PaymentMethodsScreen() {
  const [method, setMethod] = useState<PaymentMethod>("cash");

  return (
    <ScreenScaffold title="Payment Methods" subtitle="Manage default payment option.">
      <View style={{ gap: 10 }}>
        <PaymentCard method="cash" selected={method === "cash"} onPress={() => setMethod("cash")} />
        <PaymentCard method="online" selected={method === "online"} onPress={() => setMethod("online")} />
      </View>
      <CustomButton title="Save Payment Method" />
    </ScreenScaffold>
  );
}
