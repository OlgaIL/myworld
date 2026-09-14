import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  captureAcquisitionContext,
  initYandexMetrika,
  rememberMetrikaClientId,
  requestMetrikaClientIdWhenReady,
  trackPageView
} from "../services/analytics";

function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    captureAcquisitionContext();
    initYandexMetrika();
    return requestMetrikaClientIdWhenReady(rememberMetrikaClientId);
  }, []);

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}

export default AnalyticsTracker;
