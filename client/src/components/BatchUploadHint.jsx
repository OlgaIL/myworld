import { Link } from "react-router-dom";
import { getProcessingPackageOffer } from "../utils/packageOffer";
import "./BatchUploadHint.css";

function BatchUploadHint({ user }) {
  if (!user) return null;

  const unlimited = user.unlimitedAccess || user.processingEnabled || user.extendedAccessActive;
  const freeRemaining = Math.max(Number(user.freeRemaining ?? 0), 0);
  const paidRemaining = Math.max(Number(user.paidRemaining ?? user.packageRemaining ?? 0), 0);
  const paymentPackage = getProcessingPackageOffer(user);

  return (
    <div className="batch-upload-hint">
      <p>Можно выбрать несколько фотографий за один раз. Каждое фото — отдельная обработка и запись.</p>
      {!unlimited && (
        <>
          <p>Осталось обработок: бесплатно — {freeRemaining}, оплачено — {paidRemaining}.</p>
          {paymentPackage && (
            <Link to="/packages">Дополнительные обработки: {paymentPackage.amount} за {paymentPackage.price} ₽</Link>
          )}
        </>
      )}
    </div>
  );
}

export default BatchUploadHint;
