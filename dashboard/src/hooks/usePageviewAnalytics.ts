import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { recordPageView } from "../api";

export function PageviewTracker() {
  const location = useLocation();

  useEffect(() => {
    void recordPageView(location.pathname || "/");
  }, [location.pathname]);

  return null;
}
