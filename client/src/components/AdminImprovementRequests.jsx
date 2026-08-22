import { useEffect, useState } from "react";
import {
  completeAdminImprovementRequest,
  getAdminImprovementRequest,
  getAdminImprovementRequestImageUrl
} from "../services/adminApi";

const STATUS_LABELS = {
  submitted: "Новая",
  in_review: "В работе",
  improved: "Улучшено",
  not_improvable: "Улучшить не удалось",
  cancelled: "Отменена"
};

const TEXT_QUALITY_LABELS = {
  full_text: "Цельный текст",
  fragment: "Фрагмент",
  low_confidence: "Нужно проверить",
  no_meaningful_text: "Нет понятного текста"
};

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

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function AdminImprovementRequests({ requests = [], loading, onTakeInReview, onComplete, onSelectUser }) {
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [improvedText, setImprovedText] = useState("");
  const [adminComment, setAdminComment] = useState("");
  const effectiveSelectedId = selectedRequestId || requests[0]?.id || null;
  const newRequestsCount = requests.filter((request) => request.status === "submitted").length;

  useEffect(() => {
    if (!effectiveSelectedId) {
      return undefined;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setDetailLoading(true);
      setDetailError("");

      getAdminImprovementRequest(effectiveSelectedId)
        .then((loaded) => {
          if (!cancelled) {
            setDetail(loaded);
            setImprovedText(loaded.improvedText || loaded.cleanText || "");
            setAdminComment(loaded.adminComment || "");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setDetail(null);
            setDetailError("Не удалось загрузить заявку.");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setDetailLoading(false);
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [effectiveSelectedId]);

  async function handleTakeInReview() {
    if (!detail || updating) {
      return;
    }

    try {
      setUpdating(true);
      setDetailError("");
      const updated = await onTakeInReview(detail.id);
      setDetail(updated);
    } catch {
      setDetailError("Не удалось изменить статус заявки.");
    } finally {
      setUpdating(false);
    }
  }

  async function handleComplete(status) {
    if (!detail || updating) {
      return;
    }

    if (status === "improved" && !improvedText.trim()) {
      setDetailError("Добавьте улучшенный текст.");
      return;
    }

    try {
      setUpdating(true);
      setDetailError("");
      const updated = await completeAdminImprovementRequest(detail.id, {
        status,
        improvedText,
        adminComment
      });
      setDetail(updated);
      onComplete(updated);
    } catch {
      setDetailError("Не удалось завершить заявку.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <section className="admin-improvements">
      <div className="admin-section-heading">
        <div>
          <h2>Улучшение распознавания</h2>
          <p className="admin-muted">Документы, которые пользователи попросили проверить повторно</p>
        </div>
        {newRequestsCount > 0 && <span className="admin-badge">{newRequestsCount} новых</span>}
      </div>

      {loading ? (
        <p className="admin-muted">Загружаем заявки...</p>
      ) : requests.length === 0 ? (
        <p className="admin-muted">Заявок на улучшение пока нет.</p>
      ) : (
        <div className="admin-improvements__layout">
          <div className="admin-improvements__list">
            {requests.map((request) => (
              <button
                className={`admin-improvement-row ${String(effectiveSelectedId) === String(request.id) ? "admin-improvement-row--active" : ""}`}
                type="button"
                key={request.id}
                onClick={() => setSelectedRequestId(request.id)}
              >
                <span className="admin-improvement-row__top">
                  <strong>{request.documentTitle || "Запись"}</strong>
                  <span className={`admin-status admin-status--${request.status}`}>
                    {getStatusLabel(request.status)}
                  </span>
                </span>
                <span>{request.email || request.displayName || `Пользователь ${request.userId}`}</span>
                <span>{formatDateTime(request.createdAt)}</span>
                {request.comment && <span className="admin-improvement-row__comment">{request.comment}</span>}
              </button>
            ))}
          </div>

          <article className="admin-improvement-detail">
            {detailLoading ? (
              <p className="admin-muted">Загружаем документ...</p>
            ) : detailError && !detail ? (
              <p className="admin-error">{detailError}</p>
            ) : detail ? (
              <>
                <header className="admin-improvement-detail__header">
                  <div>
                    <span className={`admin-status admin-status--${detail.status}`}>
                      {getStatusLabel(detail.status)}
                    </span>
                    <h3>{detail.documentTitle || "Запись"}</h3>
                    <p>{detail.email || detail.displayName || `Пользователь ${detail.userId}`}</p>
                  </div>
                  <div className="admin-improvement-detail__actions">
                    <button className="admin-button" type="button" onClick={() => onSelectUser(detail.userId)}>
                      Пользователь
                    </button>
                    {detail.status === "submitted" && (
                      <button
                        className="admin-button admin-button--primary"
                        type="button"
                        onClick={handleTakeInReview}
                        disabled={updating}
                      >
                        {updating ? "Сохраняем..." : "Взять в работу"}
                      </button>
                    )}
                  </div>
                </header>

                {detailError && <p className="admin-error">{detailError}</p>}

                <dl className="admin-improvement-detail__meta">
                  <div><dt>Запрошено</dt><dd>{formatDateTime(detail.createdAt)}</dd></div>
                  <div><dt>Качество</dt><dd>{TEXT_QUALITY_LABELS[detail.textQuality] || detail.textQuality || "—"}</dd></div>
                  <div><dt>Документ</dt><dd>{detail.documentId}</dd></div>
                </dl>

                {detail.comment && (
                  <section className="admin-improvement-detail__comment">
                    <h4>Комментарий пользователя</h4>
                    <p>{detail.comment}</p>
                  </section>
                )}

                <img
                  className="admin-improvement-detail__image"
                  src={getAdminImprovementRequestImageUrl(detail.id)}
                  alt="Документ для повторной проверки"
                />

                {detail.status === "in_review" && (
                  <section className="admin-improvement-editor">
                    <label htmlFor={`improved-text-${detail.id}`}>Улучшенный текст</label>
                    <textarea
                      id={`improved-text-${detail.id}`}
                      value={improvedText}
                      onChange={(event) => setImprovedText(event.target.value)}
                      rows={16}
                      disabled={updating}
                    />
                    <label htmlFor={`admin-comment-${detail.id}`}>Комментарий администратора</label>
                    <textarea
                      id={`admin-comment-${detail.id}`}
                      value={adminComment}
                      onChange={(event) => setAdminComment(event.target.value)}
                      rows={3}
                      maxLength={2000}
                      disabled={updating}
                      placeholder="Необязательно"
                    />
                    <div className="admin-improvement-editor__actions">
                      <button
                        className="admin-button admin-button--primary"
                        type="button"
                        onClick={() => handleComplete("improved")}
                        disabled={updating || !improvedText.trim()}
                      >
                        {updating ? "Сохраняем..." : "Улучшено"}
                      </button>
                      <button
                        className="admin-button"
                        type="button"
                        onClick={() => handleComplete("not_improvable")}
                        disabled={updating}
                      >
                        Улучшить невозможно
                      </button>
                    </div>
                  </section>
                )}

                {detail.status === "improved" && detail.improvedText && (
                  <section className="admin-improvement-result">
                    <h4>Улучшенный текст</h4>
                    <pre>{detail.improvedText}</pre>
                  </section>
                )}

                {["improved", "not_improvable"].includes(detail.status) && detail.adminComment && (
                  <section className="admin-improvement-detail__comment">
                    <h4>Комментарий администратора</h4>
                    <p>{detail.adminComment}</p>
                  </section>
                )}

                <div className="admin-improvement-detail__texts">
                  <section>
                    <h4>Обработанный текст до улучшения</h4>
                    <pre>{detail.originalCleanText || "Текст отсутствует"}</pre>
                  </section>
                  <section>
                    <h4>Исходное распознавание</h4>
                    <pre>{detail.originalOcrText || "Текст отсутствует"}</pre>
                  </section>
                </div>
              </>
            ) : null}
          </article>
        </div>
      )}
    </section>
  );
}

export default AdminImprovementRequests;
