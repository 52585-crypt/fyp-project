import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { Layout } from "./components/Layout";
import { AdminLogin } from "./pages/AdminLogin";
import { Complaints } from "./pages/Complaints";
import { Dashboard } from "./pages/Dashboard";
import { ProviderVerification } from "./pages/ProviderVerification";
import { Requests } from "./pages/Requests";
import { Users } from "./pages/Users";
import { FullPageLoader } from "./components/ui";

// Leaflet is heavy; only load it when someone opens the map.
const LiveMap = lazy(() => import("./pages/LiveMap").then((m) => ({ default: m.LiveMap })));

function App() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLogin />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/providers" element={<ProviderVerification />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/complaints" element={<Complaints />} />
          <Route
            path="/live"
            element={
              <Suspense fallback={<FullPageLoader label="Loading map…" />}>
                <LiveMap />
              </Suspense>
            }
          />
          <Route path="/users" element={<Users />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
