import { useEffect } from "react";
import { clarityController } from "../services/clarity";

export default function ClarityTracker() {
  useEffect(() => { clarityController?.sync(); }, []);
  return null;
}
