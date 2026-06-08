import React from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CustomButton } from "../../components/CustomButton";
import { MechanicCard } from "../../components/MechanicCard";
import { mechanicProvider } from "../../services/dummyApi";
import type { RootStackParamList } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

type Props = NativeStackScreenProps<RootStackParamList, "MechanicAssigned">;

export function MechanicAssignedScreen({ navigation }: Props) {
  return (
    <ScreenScaffold title="Mechanic Assigned" subtitle="A verified mechanic accepted your job.">
      <MechanicCard driver={mechanicProvider} />
      <CustomButton title="Track Mechanic" onPress={() => navigation.navigate("MechanicLiveTracking")} />
      <CustomButton title="Open Chat" variant="outline" onPress={() => navigation.navigate("Chat", { providerName: mechanicProvider.name })} />
    </ScreenScaffold>
  );
}
