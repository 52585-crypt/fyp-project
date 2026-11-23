export type UserRole = "user" | "mechanic";
export type MechanicServiceCategory = "mechanic" | "fuel_delivery" | "towing";

export type MechanicProfile = {
  serviceCategory: MechanicServiceCategory;
  selfieUrl: string | null;
  idCardFrontUrl: string | null;
  idCardBackUrl: string | null;
  workshopPhotoUrl: string | null;
  certificateUrl: string | null;
  drivingLicenseUrl: string | null;
  liveLocation?: {
    lat: number;
    lng: number;
    addressText: string | null;
    capturedAt?: string;
  } | null;
  identityMatch: {
    status: "pending" | "matched" | "mismatch" | "manual_review";
    provider: string | null;
    checkedAt: string | null;
  };
};

export type SafeUser = {
  id: string;
  role: UserRole;
  activeRole?: UserRole;
  roles?: UserRole[];
  name: string;
  phone: string | null;
  email?: string | null;
  profilePictureUrl?: string | null;
  authProvider?: "local" | "google";
  hasGoogleSignIn?: boolean;
  isCertified: boolean;
  certificateUrl: string | null;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  mechanicProfile?: MechanicProfile | null;
  ratingAvg?: number;
  ratingCount?: number;
  completedJobs?: number;
  complaintsCount?: number;
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

export type GoogleMechanicProfile = {
  name: string;
  email: string;
  profilePictureUrl: string | null;
  phone?: string | null;
};

