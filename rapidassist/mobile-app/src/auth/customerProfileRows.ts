import type { ProfileRow } from "./ProfileView";

/** Customer profile menu. Only rows with a real destination are tappable; the rest say Coming soon. */
export const customerProfileRows: ReadonlyArray<ProfileRow> = [
  { title: "Vehicles", icon: "car-outline", href: "/vehicles" },
  { title: "Payment history", icon: "card-outline", href: { pathname: "/requests", params: { view: "payments" } } },
  { title: "Notifications", icon: "notifications-outline", href: "/notifications" },
  { title: "Support", icon: "headset-outline", href: "/support" },
  { title: "Emergency contacts", icon: "call-outline", comingSoon: true },
  { title: "Notification settings", icon: "options-outline", comingSoon: true }
];
