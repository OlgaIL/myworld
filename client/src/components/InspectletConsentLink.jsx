import { useSyncExternalStore } from "react";
import { INSPECTLET_CONSENT_EVENT, INSPECTLET_CONSENT_KEY, inspectletController } from "../services/inspectlet";
import "./InspectletConsentLink.css";

function readConsent() {
  try { return window.localStorage.getItem(INSPECTLET_CONSENT_KEY) === "granted"; }
  catch { return false; }
}

function subscribe(onChange) {
  const onStorage = event => {
    if (event.key === INSPECTLET_CONSENT_KEY || event.key === null) onChange();
  };
  window.addEventListener(INSPECTLET_CONSENT_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(INSPECTLET_CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const serverConsent = () => false;

export default function InspectletConsentLink() {
  const granted = useSyncExternalStore(subscribe, readConsent, serverConsent);
  return <button className="privacy-consent-link" type="button" onClick={() => inspectletController?.chooseConsent(!granted)}>
    {granted ? "Запретить Inspectlet" : "Разрешить Inspectlet"}
  </button>;
}
