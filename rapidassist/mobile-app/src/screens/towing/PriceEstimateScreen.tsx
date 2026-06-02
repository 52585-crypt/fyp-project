import React from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CustomButton } from "../../components/CustomButton";
import { PriceCard } from "../../components/PriceCard";
import { estimateLines } from "../../services/dummyApi";
import type { RootStackParamList } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

type Props = NativeStackScreenProps<RootStackParamList, "TowingEstimate">;

export function PriceEstimateScreen({ navigation }: Props) {
  return (
    <ScreenScaffold title="Price Estimation" subtitle="Transparent fare before assigning a driver.">
      <PriceCard lines={estimateLines} />
      <CustomButton title="Find Driver" onPress={() => navigation.navigate("DriverSearch")} />
      <CustomButton title="Edit Details" variant="outline" onPress={() => navigation.goBack()} />
    </ScreenScaffold>
  );
}
