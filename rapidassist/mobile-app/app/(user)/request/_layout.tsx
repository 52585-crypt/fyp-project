import { Stack } from "expo-router";
import { BookingProvider } from "../../../src/requests/booking/BookingProvider";

/** Booking draft is shared between request/new/[service] and request/estimate. */
export default function RequestLayout() {
  return (
    <BookingProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </BookingProvider>
  );
}
