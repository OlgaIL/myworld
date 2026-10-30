import { useEffect, useState } from "react";
import { getAdminTableAttempts } from "../services/adminApi";

export default function AdminTableStatistics({ hours }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getAdminTableAttempts(hours).then((data) => { if (!cancelled) setState({ hours, data }); })
      .catch(() => { if (!cancelled) setState({ hours, error: true }); });
    return () => { cancelled = true; };
  }, [hours]);
  const current = state?.hours === hours ? state : null;
  const data = current?.data;
  return <section aria-label="Сборка таблиц">
    <h3 className="admin-llm-summary__subtitle">Сборка таблиц</h3>
    {current?.error ? <p className="admin-error">Статистика таблиц временно недоступна.</p> : !data
      ? <p className="admin-muted">Загрузка...</p> : <>
        <div className="admin-llm-summary__metrics">
          <span>Запуски <strong>{data.attempts}</strong></span>
          <span>Успешно <strong>{data.successes}</strong></span>
          <span>Не удалось <strong>{data.failures}</strong></span>
          <span>В работе <strong>{data.pending}</strong></span>
          {data.unfinished > 0 && <span>Без результата <strong>{data.unfinished}</strong></span>}
        </div>
        {data.models?.map(model=><p className="admin-muted" key={model.model}>
          {model.model}: вызовов {model.calls}; вход {model.inputTokens}, выход {model.outputTokens} токенов;
          {model.estimatedCostRub===null?" стоимость неизвестна":` по тарифу ≈ ${model.estimatedCostRub.toFixed(2)} ₽`}
          {model.unknownCostCalls>0?`; без стоимости: ${model.unknownCostCalls}`:""}.
        </p>)}
        <p className="admin-muted">Учёт запусков — с обновления системы. Открытие готовой таблицы не считается новой попыткой.</p>
      </>}
  </section>;
}
