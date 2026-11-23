import React, { createContext, useContext, useState } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";

type GoogleWebStatus = "loading" | "ready" | "error" | "unconfigured";
const GoogleWebContext = createContext<GoogleWebStatus>("loading");
export const useGoogleWebStatus = () => useContext(GoogleWebContext);

export function GoogleOAuthRoot({ children }: { children: React.ReactNode }) {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  const [status, setStatus] = useState<GoogleWebStatus>("loading");
  if (!clientId) return <GoogleWebContext.Provider value="unconfigured">{children}</GoogleWebContext.Provider>;
  return (
    <GoogleWebContext.Provider value={status}>
      <GoogleOAuthProvider clientId={clientId} onScriptLoadSuccess={() => setStatus("ready")} onScriptLoadError={() => setStatus("error")}>
        {children}
      </GoogleOAuthProvider>
    </GoogleWebContext.Provider>
  );
}
