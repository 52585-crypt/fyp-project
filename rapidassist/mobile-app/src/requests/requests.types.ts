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

export type PriceLineKind = "service" | "fuel_cost" | "delivery_fee" | "platform_fee" | "extra_work";

export type PriceLine = {
  label: string;
  amount: number;
  kind?: PriceLineKind | null;
};

export type RequestSettlement = {
  commissionRate: number;
  commissionBase: number;
  commission: number;
  platformFee: number;
  providerEarning: number;
  platformRevenue: number;
  settledAt: string | null;
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
  settlement?: RequestSettlement | null;
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

export type ProviderWallet = {
  providerId: string;
  currency: "PKR";
  balance: number;
  dues: number;
  debtLimit: number | null;
  remainingLimit: number | null;
  totalEarned: number;
  totalPlatformRevenue: number;
  totalPaid: number;
  settledJobs: number;
  isBlocked: boolean;
  blockedAt: string | null;
  pendingTopupAmount: number;
  pendingTopupCount: number;
  minTopupAmount: number;
};

export type TopupMethod = "jazzcash" | "easypaisa" | "bank_transfer" | "cash" | "other";

export type WalletTransaction = {
  id: string;
  requestId: string | null;
  type: "commission_debit" | "topup_credit" | "adjustment";
  amount: number;
  balanceAfter: number | null;
  status: "pending" | "approved" | "rejected";
  method: TopupMethod | null;
  reference: string | null;
  hasProof: boolean;
  breakdown?: {
    category: RequestCategory | null;
    requestTotal: number | null;
    commission: number | null;
    platformFee: number | null;
    providerEarning: number | null;
  };
  note: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type TopupInput = {
  amount: number;
  method: TopupMethod;
  reference?: string | null;
  proofImage?: string | null;
  note?: string | null;
};

export type ProviderEarnings = {
  currency: "PKR";
  today: number;
  week: number;
  total: number;
  collected: number;
  platformShare: number;
  completedJobs: number;
  wallet: ProviderWallet;
  recent: ServiceRequest[];
};

export type ExtraWorkInput = {
  partName?: string | null;
  partPrice?: number;
  laborCharge?: number;
  estimatedTime?: string | null;
  description?: string | null;
};
