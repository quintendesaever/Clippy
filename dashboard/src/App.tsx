import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getMe } from "./api";
import type { MeResponse } from "./types";
import Login from "./pages/Login";
import Settings from "./pages/Settings";
import Timetable from "./pages/Timetable";

function AuthedRoutes({ me }: { me: MeResponse }) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/timetable" replace />} />
      <Route path="/timetable" element={<Timetable user={me.user} />} />
      <Route path="/settings" element={<Settings user={me.user} />} />
      <Route path="*" element={<Navigate to="/timetable" replace />} />
    </Routes>
  );
}

function GuestRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p style={{ padding: "2rem" }}>Laden…</p>;
  }

  return (
    <BrowserRouter>
      {me ? <AuthedRoutes me={me} /> : <GuestRoutes />}
    </BrowserRouter>
  );
}
