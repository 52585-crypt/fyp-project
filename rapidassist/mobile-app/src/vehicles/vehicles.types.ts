export type VehicleType = "car" | "bike" | "towing";

export type Vehicle = {
  id: string;
  userId: string;
  type: VehicleType;
  make: string;
  model: string;
  year: number;
  registrationNumber: string | null;
};

export type VehicleCreateInput = {
  type: VehicleType;
  make: string;
  model: string;
  year: number;
  registrationNumber?: string | null;
};

