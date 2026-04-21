export type UserRole = "user" | "mechanic";

export type SafeUser = {
  id: string;
  role: UserRole;
  name: string;
  phone: string;
  isCertified: boolean;
  certificateUrl: string | null;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
};

export type AuthResponse = {
  ok: boolean;
  token: string;
  user: SafeUser;
};

