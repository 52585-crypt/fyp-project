// Quick-pick pickup landmarks in Islamabad and Rawalpindi.
// Coordinates from OpenStreetMap (looked up via Photon, Nov 2026). Areas use their commercial centre or a central
// node; Gulberg Greens has no named centre in OSM, so it is approximate.
export type Landmark = { id: string; label: string; city: "Islamabad" | "Rawalpindi"; latitude: number; longitude: number };

export const TWIN_CITY_LANDMARKS: readonly Landmark[] = [
  { id: "blue-area", label: "Blue Area", city: "Islamabad", latitude: 33.71276, longitude: 73.063 },
  { id: "f6-markaz", label: "F-6 Markaz", city: "Islamabad", latitude: 33.7294, longitude: 73.0765 },
  { id: "f7-markaz", label: "F-7 Markaz", city: "Islamabad", latitude: 33.72047, longitude: 73.05631 },
  { id: "g9-markaz", label: "G-9 Markaz", city: "Islamabad", latitude: 33.68925, longitude: 73.03252 },
  { id: "i8-markaz", label: "I-8 Markaz", city: "Islamabad", latitude: 33.6679, longitude: 73.07454 },
  { id: "faizabad", label: "Faizabad", city: "Rawalpindi", latitude: 33.6621, longitude: 73.0839 },
  { id: "saddar-rwp", label: "Saddar Rawalpindi", city: "Rawalpindi", latitude: 33.59544, longitude: 73.05323 },
  { id: "committee-chowk", label: "Committee Chowk", city: "Rawalpindi", latitude: 33.61386, longitude: 73.06517 },
  { id: "bahria-phase-4", label: "Bahria Town Phase 4", city: "Rawalpindi", latitude: 33.55024, longitude: 73.12397 },
  { id: "dha-phase-2", label: "DHA Phase 2", city: "Islamabad", latitude: 33.53066, longitude: 73.15703 },
  { id: "pwd", label: "PWD", city: "Islamabad", latitude: 33.57128, longitude: 73.1448 },
  { id: "gulberg-greens", label: "Gulberg Greens", city: "Islamabad", latitude: 33.60022, longitude: 73.21186 }
];
