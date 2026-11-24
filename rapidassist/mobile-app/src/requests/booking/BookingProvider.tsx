import { createContext, useContext, type ReactNode } from "react";
import { useBookingState, type BookingState } from "./useBookingState";

const BookingContext = createContext<BookingState | null>(null);

/** Keeps one booking draft alive across the pickup pin (request/new/[service]) → problem & fare (request/estimate). */
export function BookingProvider({ children }: { children: ReactNode }) {
  return <BookingContext.Provider value={useBookingState()}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const value = useContext(BookingContext);
  if (!value) throw new Error("useBooking must be used inside <BookingProvider>");
  return value;
}
