import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLogin } from "./pages/AdminLogin";
import { Dashboard } from "./pages/Dashboard";
import { ProviderVerification } from "./pages/ProviderVerification";
import { AdminLayout } from "./components/AdminLayout";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLogin />} />
      <Route element={<AdminLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/providers" element={<ProviderVerification />} />
      </Route>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
