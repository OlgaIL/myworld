import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { initYandexMetrika, trackPageView } from "../services/analytics";

function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    initYandexMetrika();
  }, []);

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}

export default AnalyticsTracker;
