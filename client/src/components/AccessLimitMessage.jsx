import { Link } from "react-router-dom";

function AccessLimitMessage({ user }) {
  if (user?.unlimitedAccess || user?.extendedAccessActive) {
    return null;
  }

  if (Number(user?.packageRemaining || 0) > 0) {
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
        Лимит бесплатного пакета обработок достигнут. <Link to="/packages">Посмотреть пакеты</Link>
      </p>
    );
  }

  if (remaining <= 5) {
    return (
      <p className="upload-panel__message">
        Осталось {remaining} обработок из бесплатного пакета. После достижения лимита новые загрузки будут недоступны.
      </p>
    );
  }

  if (used >= 80) {
    return (
      <p className="upload-panel__message">
        Использовано {used} из {limit} обработок бесплатного пакета. Если понадобится больше, можно запросить расширение доступа.
      </p>
    );
  }

  return null;
}

export default AccessLimitMessage;
