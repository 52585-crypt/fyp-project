export type RequestCategory = "car_towing" | "fuel_delivery" | "mechanic";
export type FuelType = "petrol" | "diesel";
export type MechanicIssueCategory = "battery" | "engine" | "tyre" | "brake" | "overheating" | "general_inspection";

export type RequestLocation = {
  lat: number;
  lng: number;
  addressText?: string | null;
  updatedAt?: string | null;
};

export type RequestStatus =
  | "pending"
  | "searching_provider"
  | "provider_assigned"
  | "provider_on_way"
  | "provider_arrived"
  | "in_progress"
  | "waiting_user_approval"
  | "vehicle_loaded"
  | "reached_destination"
  | "fuel_delivered"
  | "inspection_started"
  | "extra_work_requested"
  | "work_started"
  | "service_finished"
  | "completed"
  | "cancelled";

export type PriceLine = {
  label: string;
  amount: number;
};

export type ChatMessage = {
  id: string;
  requestId: string;
  senderId: string;
  senderRole: "user" | "mechanic";
  sender: {
    id: string;
    name: string;
    phone: string;
    role: "user" | "mechanic";
  } | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type RequestReview = {
  rating: number;
  comment: string | null;
  byUserId: string | null;
  reviewedAt: string | null;
};

export type ServiceRequest = {
  id: string;
  userId: string;
  providerId: string | null;
  vehicleId: string | null;
  category: RequestCategory;
  vehicleInfo: {
    type: string | null;
    make: string | null;
    model: string | null;
    registrationNumber: string | null;
  };
  pickupLocation: RequestLocation;
  destinationLocation: RequestLocation | null;
  providerLocation?: RequestLocation | null;
  issueType: string | null;
  description: string | null;
  photos: string[];
  fuelDetails?: {
    fuelType: FuelType | null;
    liters: number | null;
  };
  mechanicDetails?: {
    issueCategory: MechanicIssueCategory | null;
    extraWork?: {
      partName: string | null;
      partPrice: number;
      laborCharge: number;
      estimatedTime: string | null;
      description: string | null;
      approvedByUser: boolean;
    };
  };
  estimate: {
    currency: "PKR";
    lines: PriceLine[];
    total: number;
  };
  status: RequestStatus;
  review: RequestReview | null;
  createdAt: string;
  updatedAt: string;
};

export type NearbyProvider = {
  id: string;
  name: string;
  serviceCategory: "mechanic" | "fuel_delivery" | "towing" | null;
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
  distanceKm: number;
  etaMinutes: number;
  score: number;
  location: RequestLocation;
};

export type CreateRequestInput = {
  vehicleId?: string | null;
  category: RequestCategory;
  vehicleInfo?: {
    type?: string | null;
    make?: string | null;
    model?: string | null;
    registrationNumber?: string | null;
  };
  pickupLocation: RequestLocation;
  destinationLocation?: RequestLocation | null;
  distanceKm?: number | null;
  issueType?: string | null;
  description?: string | null;
  fuelDetails?: {
    fuelType: FuelType;
    liters: number;
  };
  mechanicDetails?: {
    issueCategory: MechanicIssueCategory;
  };
};

export type ProviderEarnings = {
  currency: "PKR";
  today: number;
  week: number;
  total: number;
  completedJobs: number;
  recent: ServiceRequest[];
};

export type ExtraWorkInput = {
  partName?: string | null;
  partPrice?: number;
  laborCharge?: number;
  estimatedTime?: string | null;
  description?: string | null;
};
