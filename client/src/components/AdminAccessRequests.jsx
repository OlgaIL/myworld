import { useMemo } from "react";

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

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

function getRequestStatusLabel(status) {
  const labels = {
    new: "Новая",
    reviewed: "Обработана",
    approved: "Одобрена",
    rejected: "Отклонена"
  };

  return labels[status] || status;
}

const packagePresets = {
  Мини: 50,
  Стандарт: 150,
  Макси: 500
};

function getPackageTitleFromRequest(request) {
  const match = String(request?.message || "").match(/^Запрос пакета:\s*([^,]+)/);
  const title = match?.[1]?.trim();

  return packagePresets[title] ? title : "";
}

function getLatestPackageTitle(requests) {
  const packageRequest = requests.find((request) => getPackageTitleFromRequest(request));
  return getPackageTitleFromRequest(packageRequest);
}

function groupAccessRequestsByUser(requests) {
  const groups = new Map();

  requests.forEach((request) => {
    const key = request.userId || request.email || request.id;
    const group = groups.get(key) || {
      id: key,
      userId: request.userId,
      email: request.email,
      displayName: request.displayName,
      documentsCount: request.documentsCount,
      status: "reviewed",
      requests: []
    };

    group.requests.push(request);
    group.status = group.requests.some((item) => item.status === "new") ? "new" : "reviewed";
    group.latestCreatedAt = group.requests
      .map((item) => new Date(item.createdAt).getTime())
      .filter(Boolean)
      .sort((a, b) => b - a)[0];
    groups.set(key, group);
  });

  return Array.from(groups.values()).sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "new" ? -1 : 1;
    }

    return Number(b.latestCreatedAt || 0) - Number(a.latestCreatedAt || 0);
  });
}

function AdminAccessRequests({ requests, loading, onGrantPackage, onMarkReviewed, onSelectUser }) {
  const newRequestsCount = requests.filter((request) => request.status === "new").length;
  const groupedRequests = useMemo(() => groupAccessRequestsByUser(requests), [requests]);

  return (
    <section className="admin-access-requests">
      <div className="admin-section-heading">
        <div>
          <h2>Заявки</h2>
          <p className="admin-muted">Запросы на пакеты и расширение доступа</p>
        </div>
        {newRequestsCount > 0 && <span className="admin-badge">{newRequestsCount} новых</span>}
      </div>

      {loading ? (
        <p className="admin-muted">Загружаем заявки...</p>
      ) : groupedRequests.length === 0 ? (
        <p className="admin-muted">Заявок пока нет.</p>
      ) : (
        <div className="admin-access-requests__list">
          {groupedRequests.map((group) => {
            const newRequestIds = group.requests
              .filter((request) => request.status === "new")
              .map((request) => request.id);
            const sortedRequests = [...group.requests].sort(
              (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
            );
            const latestRequest = sortedRequests[0] || null;
            const latestRequestDate = sortedRequests[0] ? formatDateTime(sortedRequests[0].createdAt) : "";
            const olderRequestDates = sortedRequests.slice(1).map((request) => formatDateTime(request.createdAt)).join(", ");
            const packageTitle = getLatestPackageTitle(sortedRequests);
            const packageAmount = packagePresets[packageTitle] || 0;

            return (
              <article className="admin-access-request" key={group.id}>
                <div className="admin-access-request__main">
                  <strong>{group.email || group.displayName || `Пользователь ${group.userId}`}</strong>
                  <span>{group.displayName || "Без имени"} · {group.documentsCount} записей</span>
                  {packageTitle && <span className="admin-access-request__package">Пакет «{packageTitle}» · +{packageAmount}</span>}
                  {latestRequest?.message && <p>{latestRequest.message}</p>}
                  <div className="admin-access-request__dates">
                    <strong>{latestRequestDate}</strong>
                    {olderRequestDates && <span>{group.requests.length} заявок · {olderRequestDates}</span>}
                    {!olderRequestDates && <span>{group.requests.length} заявка</span>}
                  </div>
                </div>

                <div className="admin-access-request__side">
                  <span className={`admin-status admin-status--${group.status}`}>
                    {getRequestStatusLabel(group.status)}
                  </span>
                  <span>последняя: {formatDate(group.latestCreatedAt)}</span>
                  <div className="admin-access-request__actions">
                    <button className="admin-button" type="button" onClick={() => onSelectUser(group.userId)}>
                      Пользователь
                    </button>
                    {packageAmount > 0 && newRequestIds.length > 0 && (
                      <button
                        className="admin-button admin-button--primary"
                        type="button"
                        onClick={() => onGrantPackage(group.userId, packageTitle, packageAmount, newRequestIds)}
                      >
                        Начислить +{packageAmount}
                      </button>
                    )}
                    {newRequestIds.length > 0 && (
                      <button className="admin-button" type="button" onClick={() => onMarkReviewed(newRequestIds)}>
                        Отметить обработанной
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default AdminAccessRequests;
