const LANDING = "handwriting_to_text";
const DEFAULT_INTENT = "handwriting";
const CROSS_DEVICE_LANDING = "handwriting-to-text";
const CROSS_DEVICE_PLACEMENT = "cross_device_block";

export function getHandwritingLandingIntent(search = "") {
  const intent = new URLSearchParams(search).get("intent")?.trim();
  return intent || DEFAULT_INTENT;
}

export function getHandwritingLandingViewParams(search = "") {
  return {
    landing: LANDING,
    intent: getHandwritingLandingIntent(search),
    path: "/handwriting-to-text"
  };
}

export function getHandwritingLandingCtaParams({ search = "", placement }) {
  return {
    landing: LANDING,
    intent: getHandwritingLandingIntent(search),
    placement,
    destination: "/"
  };
}

export function trackHandwritingLandingView({ search = "", track }) {
  return track("handwriting_landing_view", getHandwritingLandingViewParams(search));
}

export function trackHandwritingLandingCta({ search = "", placement, track }) {
  return track("handwriting_landing_cta_click", getHandwritingLandingCtaParams({ search, placement }));
}

export function getCrossDeviceBlockViewParams(deviceType = "desktop") {
  return {
    landing: CROSS_DEVICE_LANDING,
    placement: CROSS_DEVICE_PLACEMENT,
    device_type: deviceType
  };
}

export function getCrossDeviceCtaParams({ deviceType = "desktop" } = {}) {
  return {
    landing: CROSS_DEVICE_LANDING,
    placement: CROSS_DEVICE_PLACEMENT,
    device_type: deviceType,
    destination: "/"
  };
}

export function trackCrossDeviceBlockView({ deviceType, track }) {
  return track("cross_device_block_view", getCrossDeviceBlockViewParams(deviceType));
}

export function trackCrossDeviceCtaClick({ deviceType, track }) {
  return track("cross_device_cta_click", getCrossDeviceCtaParams({ deviceType }));
}

export { DEFAULT_INTENT };
