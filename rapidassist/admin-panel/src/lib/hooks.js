import { useCallback, useEffect, useState } from "react";
import { adminApi, apiErrorMessage } from "../config/api";

export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · RapidAssist Admin` : "RapidAssist Admin";
  }, [title]);
}

/** Returns a setter that merges changes into the URL query string ("" / null removes a key). */
export function useUpdateParams(setParams) {
  return useCallback(
    (changes) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          Object.entries(changes).forEach(([key, value]) => {
            if (value === "" || value == null) next.delete(key);
            else next.set(key, String(value));
          });
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );
}

/** Debounced search box bound to a URL param; resets ?page when it changes. */
export function useSearchParamInput(params, updateParams, key = "q") {
  const [value, setValue] = useState(params.get(key) || "");
  const debounced = useDebouncedValue(value);
  useEffect(() => {
    if ((params.get(key) || "") !== debounced) updateParams({ [key]: debounced, page: "" });
  }, [debounced, params, updateParams, key]);
  return [value, setValue];
}

/**
 * GET an admin API resource and keep it in state.
 * - Pass url = null to skip fetching (data becomes null).
 * - Responses for stale params are ignored, so fast filter changes can't show old results.
 * - `reload()` refetches; while refetching, the previous data stays visible.
 */
export function useApiResource(url, params) {
  const key = JSON.stringify([url, params || null]);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState({ loadedFor: null, data: null, error: "" });
  const requestId = `${key}#${nonce}`;

  useEffect(() => {
    const [targetUrl, targetParams] = JSON.parse(key);
    if (!targetUrl) return undefined;
    let cancelled = false;
    adminApi
      .get(targetUrl, { params: targetParams || undefined })
      .then((res) => {
        if (!cancelled) setState({ loadedFor: requestId, data: res.data, error: "" });
      })
      .catch((err) => {
        if (!cancelled) setState((s) => ({ loadedFor: requestId, data: s.data, error: apiErrorMessage(err) }));
      });
    return () => {
      cancelled = true;
    };
  }, [key, requestId]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const hasUrl = Boolean(url);
  return {
    data: hasUrl ? state.data : null,
    error: hasUrl ? state.error : "",
    loading: hasUrl && state.loadedFor !== requestId,
    reload
  };
}
