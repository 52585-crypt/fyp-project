import { api } from "../config/api";

export type ComplaintCategory =
  | "provider_behavior"
  | "overcharging"
  | "late_arrival"
  | "poor_service"
  | "vehicle_damage"
  | "payment"
  | "safety"
  | "app_issue"
  | "other";

export type ComplaintStatus = "open" | "in_review" | "resolved" | "dismissed";

export type Complaint = {
  id: string;
  requestId: string | null;
  category: ComplaintCategory;
  description: string;
  status: ComplaintStatus;
  resolution: string | null;
  resolvedAt: string | null;
  updates: { type: "reply" | "status"; text: string | null; status: ComplaintStatus | null; at: string }[];
  createdAt: string;
  updatedAt: string;
};

export const COMPLAINT_CATEGORIES: { value: ComplaintCategory; label: string }[] = [
  { value: "provider_behavior", label: "Rude behaviour" },
  { value: "overcharging", label: "Overcharged" },
  { value: "late_arrival", label: "Late arrival" },
  { value: "poor_service", label: "Poor service" },
  { value: "vehicle_damage", label: "Vehicle damage" },
  { value: "payment", label: "Payment" },
  { value: "safety", label: "Safety concern" },
  { value: "app_issue", label: "App problem" },
  { value: "other", label: "Other" }
];

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: "Submitted",
  in_review: "In review",
  resolved: "Resolved",
  dismissed: "Closed"
};

export async function createComplaint(
  token: string,
  input: { requestId?: string | null; category: ComplaintCategory; description: string }
) {
  const res = await api.post<{ ok: boolean; complaint: Complaint }>("/api/complaints", input, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data.complaint;
}

export async function listMyComplaints(token: string) {
  const res = await api.get<{ ok: boolean; complaints: Complaint[] }>("/api/complaints", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data.complaints;
}
