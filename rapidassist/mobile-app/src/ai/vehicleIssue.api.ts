import { api, getNetworkErrorMessage } from "../config/api";
import type { MechanicIssueCategory, RequestCategory } from "../requests/requests.types";
import type { AppliedServiceSelection } from "./serviceSuggestion.integration";

/** Result of the server's free, local CLIP model (POST /api/ai/vehicle-issue). */
export type VehicleIssueSuggestion = {
  detected: boolean;
  category: RequestCategory | null;
  issueType: MechanicIssueCategory | null;
  title: string;
  confidence: number;
  top: Array<{ title: string; category: RequestCategory | null; issueType: MechanicIssueCategory | null; score: number }>;
};

export const VEHICLE_ISSUE_TIMEOUT_MS = 30_000;

const serviceIds: Record<RequestCategory, AppliedServiceSelection["serviceId"]> = {
  car_towing: "towing",
  fuel_delivery: "fuel",
  mechanic: "mechanic"
};

export async function detectVehicleIssue(token: string, image: string): Promise<VehicleIssueSuggestion> {
  const { data } = await api.post<{ ok: boolean; result: VehicleIssueSuggestion }>(
    "/api/ai/vehicle-issue",
    { image },
    { headers: { Authorization: `Bearer ${token}` }, timeout: VEHICLE_ISSUE_TIMEOUT_MS }
  );
  return data.result;
}

/** The service to pre-select, or null when the photo shows no recognisable vehicle problem. */
export function selectionFromVehicleIssue(result: VehicleIssueSuggestion | null): AppliedServiceSelection | null {
  if (!result?.detected || !result.category || !Object.hasOwn(serviceIds, result.category)) return null;
  return {
    category: result.category,
    serviceId: serviceIds[result.category],
    mechanicIssue: result.category === "mechanic" ? result.issueType ?? null : null
  };
}

export function vehicleIssueErrorMessage(error: any): string {
  const status = Number(error?.response?.status) || null;
  if (status === 401) return "Sign in again to use photo assist.";
  if (status === 403) return "Photo assist is available for customer accounts.";
  if (status === 429) return "Too many photo checks. Wait a minute and try again.";
  if (status === 400 && typeof error?.response?.data?.message === "string") return error.response.data.message;
  return getNetworkErrorMessage(error);
}
