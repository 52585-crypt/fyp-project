export type RequestCategory = "car" | "bike" | "towing";

export type RequestLocation = {
  lat: number;
  lng: number;
  addressText?: string | null;
};

export type ServiceRequest = {
  id: string;
  userId: string;
  vehicleId: string;
  category: RequestCategory;
  unknownIssue: boolean;
  issueType: string | null;
  description: string | null;
  location: RequestLocation;
  status: "open" | "cancelled" | "completed";
  createdAt: string;
  updatedAt: string;
};

export type CreateRequestInput = {
  vehicleId: string;
  category: RequestCategory;
  unknownIssue: boolean;
  issueType: string | null;
  description?: string | null;
  location: RequestLocation;
};

