import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AgentStudioPage } from "./pages/AgentStudioPage";
import { BasketsPage } from "./pages/BasketsPage";
import { JudgePage } from "./pages/JudgePage";
import { MonitorPage } from "./pages/MonitorPage";
import { RiskRulesPage } from "./pages/RiskRulesPage";
import { WalletPage } from "./pages/WalletPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<MonitorPage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="agent" element={<AgentStudioPage />} />
          <Route path="baskets" element={<BasketsPage />} />
          <Route path="risk" element={<RiskRulesPage />} />
          <Route path="judge" element={<JudgePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
