import { Link } from "react-router-dom";
import { getProcessingPackageOffer } from "../utils/packageOffer";
import "./BatchUploadHint.css";

function BatchUploadHint({ user }) {
  if (!user) return null;

  const unlimited = user.unlimitedAccess || user.processingEnabled || user.extendedAccessActive;
  const paymentPackage = getProcessingPackageOffer(user);

  return (
    <div className="batch-upload-hint">
      <p>Выбирайте несколько фото: страницы одного документа или отдельные документы. 1 фото — 1 обработка.</p>
      {!unlimited && (
        <>
          {paymentPackage && (
            <Link to="/packages">Дополнительные обработки: {paymentPackage.amount} за {paymentPackage.price} ₽</Link>
          )}
        </>
      )}
    </div>
  );
}

export default BatchUploadHint;
