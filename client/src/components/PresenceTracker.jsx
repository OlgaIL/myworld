import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

function PresenceTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname === "/admin-control") return undefined;

    function sendPresence() {
      if (document.visibilityState !== "visible") return;
      fetch(`${API_URL}/api/presence`, {
        method: "POST",
        credentials: "include",
        keepalive: true
      }).catch(() => {
        // Presence is optional and must not interrupt the page.
      });
    }

    sendPresence();
    const interval = window.setInterval(sendPresence, 30000);
    document.addEventListener("visibilitychange", sendPresence);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", sendPresence);
    };
  }, [pathname]);

  return null;
}

export default PresenceTracker;
