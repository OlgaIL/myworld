import { useLocation } from "react-router-dom";
import { inspectletController } from "../services/inspectlet";

export default function InspectletRouteBoundary({ children }) {
  const location = useLocation();
  // The history guard starts a full navigation. Never mount private content
  // into the previous document while its recorder script may still be loading.
  if (inspectletController?.isPrivateTransition(`${location.pathname}${location.search}${location.hash}`)) return null;
  return children;
}
