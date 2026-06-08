import React, { useState } from "react";
import { View } from "react-native";
import { PaymentCard } from "../../components/PaymentCard";
import { PriceCard } from "../../components/PriceCard";
import { CustomButton } from "../../components/CustomButton";
import { estimateLines } from "../../services/dummyApi";
import type { PaymentMethod } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

export function PaymentScreen() {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  return (
    <ScreenScaffold title="Payment" subtitle="Review bill summary and payment method.">
      <PriceCard lines={estimateLines} />
      <View style={{ gap: 10 }}>
        <PaymentCard method="cash" selected={method === "cash"} onPress={() => setMethod("cash")} />
        <PaymentCard method="online" selected={method === "online"} onPress={() => setMethod("online")} />
      </View>
      <CustomButton title="Confirm Payment" />
    </ScreenScaffold>
  );
}

