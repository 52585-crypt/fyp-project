import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLogin } from "./pages/AdminLogin";
import { Dashboard } from "./pages/Dashboard";
import { ProviderVerification } from "./pages/ProviderVerification";
import { AdminLayout } from "./components/AdminLayout";
import { useAdminAuth } from "./auth/AdminAuth";
import { LiveJobs } from "./pages/LiveJobs";
import { Heatmap } from "./pages/Heatmap";

function ProtectedAdmin() {
  const { admin, ready, sessionError } = useAdminAuth();
  if (!ready) return <main className="auth-loading">Checking admin session…</main>;
  if (sessionError) return <SessionFailure />;
  return admin ? <AdminLayout /> : <Navigate to="/login" replace />;
}

function LoginRoute() {
  const { admin, ready, sessionError } = useAdminAuth();
  if (!ready) return <main className="auth-loading">Checking admin session…</main>;
  if (sessionError) return <SessionFailure />;
  return admin ? <Navigate to="/dashboard" replace /> : <AdminLogin />;
}

function SessionFailure() {
  const { sessionError, retrySession } = useAdminAuth();
  return <main className="auth-loading"><p role="alert">{sessionError}</p><button type="button" onClick={retrySession}>Retry connection</button></main>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<ProtectedAdmin />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/providers" element={<ProviderVerification />} />
        <Route path="/live-jobs" element={<LiveJobs />} />
        <Route path="/heatmap" element={<Heatmap />} />
      </Route>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
