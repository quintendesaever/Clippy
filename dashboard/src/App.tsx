import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getMe } from "./api";
import Login from "./pages/Login";
import Settings from "./pages/Settings";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    getMe()
      .then(() => setStatus("ok"))
      .catch(() => setStatus("denied"));
  }, []);

  if (status === "loading") return <p style={{ padding: "2rem" }}>Loading…</p>;
  if (status === "denied") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Home() {
  const [status, setStatus] = useState<"loading" | "authed" | "guest">("loading");

  useEffect(() => {
    getMe()
      .then(() => setStatus("authed"))
      .catch(() => setStatus("guest"));
  }, []);

  if (status === "loading") return <p style={{ padding: "2rem" }}>Loading…</p>;
  if (status === "authed") return <Navigate to="/settings" replace />;
  return <Login />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
