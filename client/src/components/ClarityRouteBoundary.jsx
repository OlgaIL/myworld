import { useLocation } from "react-router-dom";
import { clarityController } from "../services/clarity";

export default function ClarityRouteBoundary({ children }) {
  const location = useLocation();
  // The history guard starts a full navigation. Never mount private content
  // into the previous document while its recorder script may still be loading.
  if (clarityController?.isPrivateTransition(`${location.pathname}${location.search}${location.hash}`)) return null;
  return children;
}
