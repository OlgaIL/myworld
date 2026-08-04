function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getCreditSourceLabel(source) {
  if (source === "yookassa") {
    return "Оплата ЮKassa";
  }

  if (source === "manual") {
    return "Вручную";
  }

  return source || "Источник не указан";
}

function AdminProcessingCredits({ credits = [], loading, onSelectUser }) {
  return (
    <section className="admin-access-requests admin-processing-credits">
      <div className="admin-section-heading">
        <div>
          <h2>Начисления</h2>
          <p className="admin-muted">История пополнений баланса обработок</p>
        </div>
      </div>

      {loading ? (
        <p className="admin-muted">Загружаем начисления...</p>
      ) : credits.length === 0 ? (
        <p className="admin-muted">Начислений пока нет.</p>
      ) : (
        <div className="admin-access-requests__list">
          {credits.map((credit) => (
            <article className="admin-access-request" key={credit.id}>
              <div className="admin-access-request__main">
                <strong>{credit.email || credit.displayName || `Пользователь ${credit.userId}`}</strong>
                <span>{credit.displayName || "Без имени"}</span>
                <span className="admin-access-request__package">
                  {getCreditSourceLabel(credit.source)} · пакет «{credit.packageTitle}» · +{credit.amount}
                </span>
                {credit.note && <p>{credit.note}</p>}
                {credit.amountValue !== null && credit.amountValue !== undefined && (
                  <p>{credit.amountValue} {credit.currency || "RUB"} · платеж {credit.providerPaymentId || credit.paymentId}</p>
                )}
              </div>

              <div className="admin-access-request__side">
                <span className={`admin-status admin-status--${credit.source}`}>
                  {getCreditSourceLabel(credit.source)}
                </span>
                <span>{formatDateTime(credit.createdAt)}</span>
                <div className="admin-access-request__actions">
                  <button className="admin-button" type="button" onClick={() => onSelectUser(credit.userId)}>
                    Пользователь
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default AdminProcessingCredits;
