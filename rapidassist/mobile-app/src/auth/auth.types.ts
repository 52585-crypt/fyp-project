export type UserRole = "user" | "mechanic";
export type MechanicServiceCategory = "mechanic" | "fuel_delivery" | "towing";

export type MechanicProfile = {
  serviceCategory: MechanicServiceCategory;
  selfieUrl: string;
  idCardFrontUrl: string;
  idCardBackUrl: string;
  workshopPhotoUrl: string;
  certificateUrl: string | null;
  liveLocation?: {
    lat: number;
    lng: number;
    addressText: string | null;
    capturedAt?: string;
  } | null;
  identityMatch: {
    status: "pending" | "matched" | "mismatch" | "manual_review";
    score: number | null;
    provider: string | null;
    checkedAt: string | null;
  };
};

export type SafeUser = {
  id: string;
  role: UserRole;
  name: string;
  phone: string;
  isCertified: boolean;
  certificateUrl: string | null;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  mechanicProfile?: MechanicProfile | null;
  providerState?: {
    isOnline: boolean;
    currentLocation?: {
      lat: number | null;
      lng: number | null;
      addressText: string | null;
      updatedAt?: string | null;
    } | null;
    activeRequestId?: string | null;
    lastSeenAt?: string | null;
  } | null;
};

export type AuthResponse = {
  ok: boolean;
  token: string;
  user: SafeUser;
};

