import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardPage from "@/pages/dashboard";
import ProjectorPage from "@/pages/projector";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projector" element={<ProjectorPage />} />
      </Routes>
    </BrowserRouter>
  );
}
