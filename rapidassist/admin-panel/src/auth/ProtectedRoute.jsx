import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { FullPageLoader } from "../components/ui";

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "checking") return <FullPageLoader label="Checking your session…" />;
  if (status !== "authenticated") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
