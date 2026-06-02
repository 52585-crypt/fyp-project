export type RequestCategory = "car_towing" | "fuel_delivery" | "mechanic";
export type FuelType = "petrol" | "diesel";
export type MechanicIssueCategory = "battery" | "engine" | "tyre" | "brake" | "overheating" | "general_inspection";

export type RequestLocation = {
  lat: number;
  lng: number;
  addressText?: string | null;
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
  | "completed"
  | "cancelled";

export type PriceLine = {
  label: string;
  amount: number;
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
  createdAt: string;
  updatedAt: string;
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
