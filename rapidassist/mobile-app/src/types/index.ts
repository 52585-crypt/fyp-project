import type { Ionicons } from "@expo/vector-icons";

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Login: undefined;
  Signup: undefined;
  OTPVerification: { phone?: string } | undefined;
  ForgotPassword: undefined;
  Home: undefined;
  TowingRequest: undefined;
  VehicleInformation: undefined;
  TowingEstimate: undefined;
  DriverSearch: undefined;
  DriverAssigned: undefined;
  TowingLiveTracking: undefined;
  VehiclePickedUp: undefined;
  ReachedDestination: undefined;
  Payment: undefined;
  ReviewRating: undefined;
  MechanicServices: undefined;
  MechanicServiceInfo: undefined;
  ConfirmMechanicRequest: undefined;
  MechanicAssigned: undefined;
  MechanicLiveTracking: undefined;
  MechanicArrived: undefined;
  InspectionStarted: undefined;
  ExtraWorkApproval: undefined;
  Chat: { providerName?: string } | undefined;
  SOS: undefined;
  PaymentMethods: undefined;
  ServiceHistory: undefined;
  UserProfile: undefined;
};

export type ServiceKind = "towing" | "fuel" | "mechanic" | "battery" | "tyre" | "lockout";

export type ServiceItem = {
  id: ServiceKind;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export type ProviderProfile = {
  id: string;
  name: string;
  role: string;
  rating: number;
  vehicle: string;
  plateNumber: string;
  eta: string;
  distance: string;
  avatarUrl?: string;
};

export type PriceLine = {
  label: string;
  amount: number;
};

export type PaymentMethod = "cash" | "online";

export type RequestStatus =
  | "request_confirmed"
  | "searching"
  | "assigned"
  | "on_the_way"
  | "arrived"
  | "in_progress"
  | "completed";
