import { Link } from "react-router-dom";
import { TABLE_UPLOAD_PATH } from "../utils/tableFlow";
import "./TableResultExample.css";

export default function TableResultExample() {
  return (
    <article className="table-result-example" aria-labelledby="table-result-example-heading">
      <h3 id="table-result-example-heading">Таблица остаётся таблицей</h3>
      <p>Пример структуры на условных данных: значения расположены по строкам и столбцам. Это схема результата, а не пример распознавания фотографии.</p>
      <div className="table-result-example__scroll" role="region" aria-label="Пример таблицы" tabIndex={0}>
        <table>
          <caption>Учебный пример · план занятий</caption>
          <thead><tr><th scope="col">Тема</th><th scope="col">Часы</th><th scope="col">Задания</th></tr></thead>
          <tbody>
            <tr><th scope="row">Введение</th><td>2</td><td>1–3</td></tr>
            <tr><th scope="row">Практика</th><td>4</td><td>4–8</td></tr>
            <tr><th scope="row">Повторение</th><td>2</td><td>9–10</td></tr>
          </tbody>
        </table>
      </div>
      <p>После восстановления сверьте каждую ячейку с фото. Скопируйте таблицу и вставьте в Word с сохранением исходного форматирования.</p>
      <Link className="landing-button landing-button--primary" to={TABLE_UPLOAD_PATH}>Загрузить фото таблицы</Link>
      <small>Восстановление таблиц доступно после входа. Доступность и остаток попыток проверяются в аккаунте.</small>
    </article>
  );
}
