import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Shell from "./ui/Shell";
import Dashboard from "./ui/dashboard/Dashboard";
import InvestmentsPage from "./ui/investments/InvestmentsPage";
import LineOfCreditPage from "./ui/loc/LineOfCreditPage";
import LifeInsurancePage from "./ui/policy/LifeInsurancePage";
import ScenariosPage from "./ui/scenarios/ScenariosPage";
import TargetsPage from "./ui/targets/TargetsPage";
import SettingsPage from "./ui/settings/SettingsPage";
import ImportExportPage from "./ui/import-export/ImportExportPage";
import { useStore } from "./store";

export default function App() {
  const loadFromDB = useStore((s) => s.loadFromDB);
  const loaded = useStore((s) => s.loaded);

  useEffect(() => {
    void loadFromDB();
  }, [loadFromDB]);

  if (!loaded) {
    return <div className="p-8 text-sub">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/investments" element={<InvestmentsPage />} />
          <Route path="/loc" element={<LineOfCreditPage />} />
          <Route path="/policy" element={<LifeInsurancePage />} />
          <Route path="/scenarios" element={<ScenariosPage />} />
          <Route path="/targets" element={<TargetsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/import-export" element={<ImportExportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
