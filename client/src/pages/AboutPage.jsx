import { Link } from "react-router-dom";

const steps = [
  "Загрузите фото",
  "Word2you распознает текст",
  "Найдите, когда понадобится"
];

const features = [
  "Распознавание текста с фото",
  "Краткое резюме",
  "Автокатегории и теги",
  "Поиск по архиву",
  "Хранение в одном месте"
];

const audiences = [
  "студентам",
  "для личных заметок",
  "для документов и записей",
  "для фото текстов на потом"
];

function AboutLogo() {
  return (
    <Link className="about-logo" to="/">
      Word2you <span>Записи</span>
    </Link>
  );
}

function AboutPage() {
  return (
    <main className="about-page">
      <header className="about-topbar">
        <AboutLogo />
        <nav className="about-nav" aria-label="Навигация">
          <Link className="about-nav__button" to="/">Попробовать бесплатно</Link>
        </nav>
      </header>

      <section className="about-hero">
        <div className="about-hero__content">
          <h1>Сохраняйте любые записи. Находите их за секунды.</h1>
          <p>
            Word2you превращает фото заметок, конспектов и документов в удобный архив с текстом, кратким описанием,
            тегами и поиском.
          </p>
          <div className="about-hero__actions">
            <Link className="about-button about-button--primary" to="/">
              Попробовать бесплатно
            </Link>
            <span>До 5 записей без регистрации.</span>
          </div>
        </div>

        <aside className="about-preview" aria-label="Пример записи">
          <div className="about-preview__image" />
          <div className="about-preview__body">
            <span>14 мая 2026 · ✓ Текст загружен</span>
            <h2>Конспект по истории</h2>
            <p>Краткое описание записи и основные мысли, которые потом легко найти в архиве.</p>
            <div className="about-preview__tags">
              <span>учеба</span>
              <span>конспект</span>
              <span>история</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="about-section">
        <h2>Как это работает</h2>
        <div className="about-steps">
          {steps.map((step, index) => (
            <article className="about-card" key={step}>
              <span>{index + 1}</span>
              <h3>{step}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="about-grid-section">
        <div>
          <h2>Возможности</h2>
          <div className="about-list">
            {features.map((feature) => (
              <span key={feature}>{feature}</span>
            ))}
          </div>
        </div>

        <div>
          <h2>Для кого</h2>
          <div className="about-list">
            {audiences.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="about-notice">
        <h2>Наш проект молодой и активно развивается.</h2>
        <p>
          Мы улучшаем распознавание текста, работу с рукописными записями и загрузку нескольких фото. Уже сейчас можно
          сохранять фото текстов, получать краткое описание и быстро находить записи в архиве.
        </p>
      </section>

      <section className="about-limits">
        <div>
          <span>Без регистрации</span>
          <strong>до 5 записей</strong>
        </div>
        <div>
          <span>После входа в аккаунт</span>
          <strong>до 50 обработок бесплатно</strong>
        </div>
      </section>

      <section className="about-final">
        <h2>Попробуйте сохранить первую запись прямо сейчас.</h2>
        <Link className="about-button about-button--primary" to="/">
          Попробовать бесплатно
        </Link>
      </section>
    </main>
  );
}

export default AboutPage;
