import React from "react";

// Native Google Sign-In does not use the browser provider.
export function GoogleOAuthRoot({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
