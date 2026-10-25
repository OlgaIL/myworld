import { useEffect } from "react";
import { Link } from "react-router-dom";
import PageFooter from "../components/PageFooter";
import TableResultExample from "../components/TableResultExample";
import { captureAcquisitionContext } from "../services/analytics";
import "./FeatureLanding.css";

export function FeatureHeader() {
  return <header className="landing-header"><Link className="landing-logo" to="/">Word2you <span>Записи</span></Link><nav className="landing-nav" aria-label="Возможности Word2you"><Link to="/about">О проекте</Link><Link to="/photo-to-text">Фото в текст</Link><Link to="/handwriting-to-text">Рукопись</Link><Link to="/batch-photo-to-text">Несколько фото</Link><Link to="/table-from-photo">Таблицы</Link></nav></header>;
}

const batchExamples = [
  ["marketplace-plan", "План на маркетплейс"],
  ["promotion", "План продвижения"],
  ["logistics", "Запись по логистике"]
];

export default function FeatureLanding({ kind }) {
  const batch = kind === "batch";
  useEffect(() => { captureAcquisitionContext(batch ? "batch_photo_to_text" : "table_from_photo"); }, [batch]);
  return <main className="landing-page feature-page">
    <FeatureHeader />
    <section className="feature-hero">
      <p className="landing-eyebrow">{batch ? "Для нескольких страниц" : "Для работы с ячейками"}</p>
      <h1>{batch ? "Несколько фото страниц — в текст за одну загрузку" : "Таблица с фото — в строки и столбцы"}</h1>
      <p>{batch ? "Загрузите фотографии конспектов, документов или заметок одним выбором. Каждая фотография станет отдельной записью с исходным изображением и распознанным текстом." : "Попробуйте восстановить таблицу с фотографии. Сверьте числа и расположение ячеек с оригиналом, затем скопируйте результат в свой документ Word."}</p>
      <Link className="landing-button landing-button--primary" to="/">{batch ? "Начать с первой фотографии" : "Загрузить фото таблицы"}</Link>
      <p className="feature-note">{batch ? "Несколько файлов можно выбрать после входа. Начать с одного фото можно без регистрации." : "Восстановление таблиц доступно после входа, если сервис обнаружил признаки таблицы."}</p>
    </section>
    <section className="landing-section" aria-labelledby="feature-steps">
      <h2 id="feature-steps">{batch ? "Как обработать несколько фотографий" : "Как получить таблицу из фотографии"}</h2>
      <ol className="feature-steps">
        <li><h3>{batch ? "Войдите и выберите файлы" : "Загрузите чёткую фотографию"}</h3><p>{batch ? "В личном кабинете выделите несколько изображений JPEG, PNG или WebP за один раз." : "Снимите страницу ровно, без бликов. В кадре должны быть видны края таблицы и значения ячеек."}</p></li>
        <li><h3>{batch ? "Дождитесь обработки" : "Откройте вкладку «Таблицы»"}</h3><p>{batch ? "Фотографии обрабатываются по очереди в пределах доступного остатка. Результаты сохраняются в архиве." : "Если таблица обнаружена, запустите её восстановление. Если вкладки нет, проверьте качество снимка."}</p></li>
        <li><h3>{batch ? "Проверьте каждую запись" : "Сверьте и скопируйте ячейки"}</h3><p>{batch ? "Откройте нужную страницу, сравните текст с фото и скопируйте результат. К архиву можно вернуться позже." : "Проверьте числа, заголовки и объединённые ячейки. При вставке в Word выберите сохранение исходного форматирования."}</p></li>
      </ol>
    </section>
    {batch ? <section className="landing-section" aria-labelledby="batch-examples"><h2 id="batch-examples">Три фотографии — три отдельные записи</h2><p>Планы, конспекты и рабочие заметки можно хранить вместе в архиве. Ниже — примеры исходных страниц; результаты их распознавания можно посмотреть на странице рукописи.</p><div className="feature-examples">{batchExamples.map(([name, title]) => <figure key={name}><img src={`/handwriting-examples/${name}-photo.png`} alt={`Исходная рукописная страница: ${title}`} loading="lazy" /><figcaption>{title} → отдельная запись</figcaption></figure>)}</div><Link to="/handwriting-to-text">Посмотреть исходные фото и результаты распознавания</Link></section> : <section className="landing-section"><TableResultExample /></section>}
    <section className="landing-split"><div><h2>{batch ? "Понятный объём и условия" : "Что проверить перед использованием"}</h2><p>{batch ? "Перед большой загрузкой проверьте остаток обработок в аккаунте. Если его недостаточно, посмотрите доступные пакеты и стоимость продолжения." : "Сложная сетка, блики и мелкие цифры могут приводить к ошибкам. Результат нужно проверять по фотографии, особенно перед использованием расчётов и реквизитов."}</p><Link to="/packages">Посмотреть пакеты</Link></div><div className="landing-usecases"><article className="landing-usecase"><h3>{batch ? "Каждое фото сохраняется отдельно" : "Условия восстановления"}</h3><p>{batch ? "Пакетная обработка не объединяет страницы в один документ. Добавление нескольких страниц внутрь одной записи запланировано отдельно." : "Доступность пробного восстановления и оставшихся попыток проверяется в аккаунте. Для переноса таблицы в Word используйте копирование из браузера."}</p></article><article className="landing-usecase"><h3>Начните на телефоне, продолжите на компьютере</h3><p>После входа сохраните записи в архиве. Откройте тот же аккаунт на компьютере, чтобы проверить текст и перенести его в рабочий документ.</p></article></div></section>
    <section className="landing-section"><h2>Другие задачи</h2><div className="feature-related"><Link to={batch ? "/table-from-photo" : "/batch-photo-to-text"}>{batch ? "На фотографиях есть таблицы" : "Нужно обработать несколько фотографий"}</Link><Link to="/handwriting-to-text">Распознать рукописные записи</Link><Link to="/photo-to-text">Скопировать печатный текст с фото</Link><Link to="/about">Все возможности Word2you</Link></div></section>
    <section className="landing-final"><div><h2>{batch ? "Начните с первой страницы" : "Попробуйте на своей таблице"}</h2><p>Загрузите фотографию и проверьте результат на своей задаче.</p></div><Link className="landing-button landing-button--primary" to="/">Загрузить фото</Link></section>
    <PageFooter />
  </main>;
}
