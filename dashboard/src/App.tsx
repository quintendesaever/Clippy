import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getMe } from "./api";
import { PreferencesProvider } from "./hooks/usePreferences";
import { ThemeProvider } from "./hooks/useTheme";
import type { MeResponse } from "./types";
import Login from "./pages/Login";
import MyTimetable from "./pages/MyTimetable";
import Settings from "./pages/Settings";
import Timetable from "./pages/Timetable";

function AuthedRoutes({ me }: { me: MeResponse }) {
  return (
    <PreferencesProvider initialShowTypePrefix={me.show_type_prefix ?? true}>
      <Routes>
        <Route path="/" element={<Navigate to="/timetable" replace />} />
        <Route path="/timetable" element={<Timetable user={me.user} />} />
        <Route path="/my-timetable" element={<MyTimetable user={me.user} />} />
        <Route path="/settings" element={<Settings user={me.user} />} />
        <Route path="*" element={<Navigate to="/timetable" replace />} />
      </Routes>
    </PreferencesProvider>
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

function AppRoutes() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loginPage">
        <p className="timetableLoading">Laden…</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {me ? <AuthedRoutes me={me} /> : <GuestRoutes />}
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppRoutes />
    </ThemeProvider>
  );
}
