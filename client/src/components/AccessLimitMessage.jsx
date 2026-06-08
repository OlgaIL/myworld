import { useState } from "react";
import { createAccessRequest } from "../services/api";

function AccessRequestForm() {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleClick() {
    try {
      setStatus("sending");
      setError("");
      await createAccessRequest({ message: "" });
      setStatus("sent");
    } catch (requestError) {
      setError(requestError.message || "Не удалось отправить заявку");
      setStatus("idle");
    }
  }

  return (
    <span className="access-request">
      {status === "sent" ? (
        <span className="access-request__sent">✓ Вы запросили продление доступа. Проверьте вашу почту</span>
      ) : (
        <>
          <button className="access-request__link" type="button" onClick={handleClick} disabled={status === "sending"}>
            {status === "sending" ? "отправляем запрос..." : "запросить продление доступа на 1 месяц"}
          </button>
          {error && <span className="access-request__error">{error}</span>}
        </>
      )}
    </span>
  );
}

function AccessLimitMessage({ user }) {
  if (user?.unlimitedAccess || user?.extendedAccessActive) {
    return null;
  }

  const limit = Number(user?.recordLimit || 0);
  const used = Number(user?.recordsUsed || 0);
  const remaining = Number(user?.recordsRemaining || 0);

  if (!limit) {
    return null;
  }

  if (remaining <= 0) {
    return (
      <p className="upload-panel__message">
        Лимит бесплатного тарифа достигнут, <AccessRequestForm />
      </p>
    );
  }

  if (remaining <= 5) {
    return (
      <p className="upload-panel__message">
        Осталось {remaining} записей. После достижения лимита новые загрузки будут недоступны.
      </p>
    );
  }

  if (used >= 80) {
    return (
      <p className="upload-panel__message">
        Вы сохранили {used} из {limit} записей. Если понадобится больше места, можно запросить продление доступа.
      </p>
    );
  }

  return null;
}

export default AccessLimitMessage;
