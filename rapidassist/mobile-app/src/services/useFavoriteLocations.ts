import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  deleteFavoriteLocation, getFavoriteLocations, saveFavoriteLocation,
  type FavoriteLocation, type SaveFavoriteLocationInput
} from "./favoriteLocations.storage";

export function useFavoriteLocations(onError: (message: string) => void) {
  const { token, user } = useAuth();
  const accountId = token ? user?.id : undefined;
  const session = useMemo(() => ({ accountId }), [accountId, token]);
  const current = useRef<typeof session | null>(session);
  current.current = session;
  const [snapshot, setSnapshot] = useState<{ session: typeof session; locations: FavoriteLocation[] } | null>(null);
  const [savingSession, setSavingSession] = useState<typeof session | null>(null);

  useEffect(() => {
    let active = true;
    current.current = session;
    setSnapshot(null);
    setSavingSession(null);
    if (session.accountId) {
      void getFavoriteLocations(session.accountId).then((locations) => {
        if (active && current.current === session) setSnapshot({ session, locations });
      }).catch(() => {});
    }
    return () => {
      active = false;
      if (current.current === session) current.current = null;
    };
  }, [session]);

  async function change(operation: (id: string) => Promise<FavoriteLocation[]>, saving: boolean, fallback: string) {
    if (!session.accountId || current.current !== session) return;
    if (saving) setSavingSession(session);
    try {
      const locations = await operation(session.accountId);
      if (current.current === session) setSnapshot({ session, locations });
    } catch (error) {
      if (current.current === session) onError(error instanceof Error ? error.message : fallback);
    } finally {
      if (saving && current.current === session) setSavingSession(null);
    }
  }

  return {
    favoriteLocations: snapshot?.session === session ? snapshot.locations : [],
    favoriteSaving: savingSession === session,
    saveFavorite: (input: SaveFavoriteLocationInput) => change(
      (id) => saveFavoriteLocation(id, input), true, "Failed to save favorite location"
    ),
    removeFavorite: (favoriteId: string) => change(
      (id) => deleteFavoriteLocation(id, favoriteId), false, "Failed to remove favorite location"
    )
  };
}
