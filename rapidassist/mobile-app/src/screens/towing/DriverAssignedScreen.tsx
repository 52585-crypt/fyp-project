import React from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CustomButton } from "../../components/CustomButton";
import { DriverCard } from "../../components/DriverCard";
import { demoProvider } from "../../services/dummyApi";
import type { RootStackParamList } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

type Props = NativeStackScreenProps<RootStackParamList, "DriverAssigned">;

export function DriverAssignedScreen({ navigation }: Props) {
  return (
    <ScreenScaffold title="Driver Assigned" subtitle="Your towing driver accepted the request.">
      <DriverCard driver={demoProvider} />
      <CustomButton title="Track Driver" onPress={() => navigation.navigate("TowingLiveTracking")} />
      <CustomButton title="Open Chat" variant="outline" onPress={() => navigation.navigate("Chat", { providerName: demoProvider.name })} />
    </ScreenScaffold>
  );
}
