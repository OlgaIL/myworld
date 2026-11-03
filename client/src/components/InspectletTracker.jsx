import { useEffect } from "react";
import { inspectletController } from "../services/inspectlet";

export default function InspectletTracker() {
  useEffect(() => { inspectletController?.sync(); }, []);
  return null;
}
