import { useCallback, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { listPayments, type Payment } from "./payments.api";

/** Paged payment history. */
export function usePaymentHistory() {
  const { token } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before?: string) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listPayments(token, before);
      setPayments((existing) => (before ? [...existing, ...result.payments] : result.payments));
      setCursor(result.next);
    } catch { setError("Unable to load payment history."); } finally { setLoading(false); }
  }, [token]);

  return { payments, loading, error, hasMore: Boolean(cursor), reload: () => load(), loadMore: () => cursor && load(cursor) };
}
