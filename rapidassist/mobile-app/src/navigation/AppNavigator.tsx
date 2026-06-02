import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { appColors } from "../constants/theme";
import { ChatScreen } from "../screens/common/ChatScreen";
import { LiveTrackingScreen } from "../screens/common/LiveTrackingScreen";
import { PaymentMethodsScreen } from "../screens/common/PaymentMethodsScreen";
import { PaymentScreen } from "../screens/common/PaymentScreen";
import { ReviewRatingScreen } from "../screens/common/ReviewRatingScreen";
import { ServiceHistoryScreen } from "../screens/common/ServiceHistoryScreen";
import { SOSScreen } from "../screens/common/SOSScreen";
import { UserProfileScreen } from "../screens/common/UserProfileScreen";
import { ConfirmRequestScreen } from "../screens/mechanic/ConfirmRequestScreen";
import { ExtraWorkApprovalScreen } from "../screens/mechanic/ExtraWorkApprovalScreen";
import { InspectionStartedScreen } from "../screens/mechanic/InspectionStartedScreen";
import { MechanicArrivedScreen } from "../screens/mechanic/MechanicArrivedScreen";
import { MechanicAssignedScreen } from "../screens/mechanic/MechanicAssignedScreen";
import { MechanicServicesScreen } from "../screens/mechanic/MechanicServicesScreen";
import { ServiceInformationScreen } from "../screens/mechanic/ServiceInformationScreen";
import { HomeScreen } from "../screens/home/HomeScreen";
import { DriverAssignedScreen } from "../screens/towing/DriverAssignedScreen";
import { DriverSearchScreen } from "../screens/towing/DriverSearchScreen";
import { PriceEstimateScreen } from "../screens/towing/PriceEstimateScreen";
import { ReachedDestinationScreen } from "../screens/towing/ReachedDestinationScreen";
import { TowingRequestScreen, VehicleInformationScreen } from "../screens/towing/TowingRequestScreen";
import { VehiclePickedUpScreen } from "../screens/towing/VehiclePickedUpScreen";
import type { RootStackParamList } from "../types";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<RootStackParamList>();

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: appColors.primary,
        tabBarInactiveTintColor: appColors.muted,
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 8 },
        tabBarIcon: ({ color, size }) => {
          const names: Record<string, keyof typeof Ionicons.glyphMap> = {
            Home: "home",
            ServiceHistory: "time",
            PaymentMethods: "card",
            UserProfile: "person"
          };
          return <Ionicons name={names[route.name] ?? "ellipse"} size={size} color={color} />;
        }
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="ServiceHistory" component={ServiceHistoryScreen} options={{ title: "History" }} />
      <Tab.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={{ title: "Payments" }} />
      <Tab.Screen name="UserProfile" component={UserProfileScreen} options={{ title: "Profile" }} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={Tabs} />
      <Stack.Screen name="TowingRequest" component={TowingRequestScreen} />
      <Stack.Screen name="TowingEstimate" component={PriceEstimateScreen} />
      <Stack.Screen name="DriverSearch" component={DriverSearchScreen} />
      <Stack.Screen name="DriverAssigned" component={DriverAssignedScreen} />
      <Stack.Screen name="TowingLiveTracking" component={LiveTrackingScreen} />
      <Stack.Screen name="VehiclePickedUp" component={VehiclePickedUpScreen} />
      <Stack.Screen name="ReachedDestination" component={ReachedDestinationScreen} />
      <Stack.Screen name="MechanicServices" component={MechanicServicesScreen} />
      <Stack.Screen name="MechanicServiceInfo" component={ServiceInformationScreen} />
      <Stack.Screen name="ConfirmMechanicRequest" component={ConfirmRequestScreen} />
      <Stack.Screen name="MechanicAssigned" component={MechanicAssignedScreen} />
      <Stack.Screen name="MechanicLiveTracking" component={LiveTrackingScreen} />
      <Stack.Screen name="MechanicArrived" component={MechanicArrivedScreen} />
      <Stack.Screen name="InspectionStarted" component={InspectionStartedScreen} />
      <Stack.Screen name="ExtraWorkApproval" component={ExtraWorkApprovalScreen} />
      <Stack.Screen name="Payment" component={PaymentScreen} />
      <Stack.Screen name="ReviewRating" component={ReviewRatingScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="SOS" component={SOSScreen} />
      <Stack.Screen name="VehicleInformation" component={VehicleInformationScreen} />
    </Stack.Navigator>
  );
}
