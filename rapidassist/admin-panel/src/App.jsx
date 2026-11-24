import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLogin } from "./pages/AdminLogin";
import { Dashboard } from "./pages/Dashboard";
import { Payouts } from "./pages/Payouts";
import { ProviderVerification } from "./pages/ProviderVerification";
import { Revenue } from "./pages/Revenue";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLogin />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/providers" element={<ProviderVerification />} />
      <Route path="/revenue" element={<Revenue />} />
      <Route path="/payouts" element={<Payouts />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
