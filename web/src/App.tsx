import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardPage from "@/pages/dashboard";
import ProjectorPage from "@/pages/projector";
import BashHistoryPage from "@/pages/bash-history";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projector" element={<ProjectorPage />} />
        <Route path="/bash-history" element={<BashHistoryPage />} />
      </Routes>
    </BrowserRouter>
  );
}
