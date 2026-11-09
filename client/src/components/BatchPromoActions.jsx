import { Link } from "react-router-dom";
import { useAuthContext } from "../contexts/AuthContext";
import { captureAcquisitionContext, trackGoal } from "../services/analytics";
import { BATCH_TRIAL_PATH, batchUploadPath } from "../utils/batchFlow";

export default function BatchPromoActions({ placement }) {
  const { user } = useAuthContext() || {};
  function track(action) {
    captureAcquisitionContext("batch_photo_to_text");
    trackGoal("batch_promo_cta_click", { action, placement, source: "batch_promo" });
  }
  return <div className="batch-promo-actions">
    <Link className="landing-button landing-button--primary" to={batchUploadPath(placement)} onClick={() => track("multiple")}>
      {user ? "Загрузить несколько фото" : "Войти и загрузить несколько фото"}
    </Link>
    <Link className="batch-promo-actions__secondary" to={user ? "/" : BATCH_TRIAL_PATH} onClick={() => track("single")}>
      {user ? "Сначала загрузить одно фото" : "Сначала попробовать одно фото без входа"}
    </Link>
  </div>;
}
