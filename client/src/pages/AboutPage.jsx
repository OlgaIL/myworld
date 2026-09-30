import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageFooter from "../components/PageFooter";

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
  "для рецептов и бытовых записей"
];

const archiveFlow = ["Фото на телефоне", "Распознанный текст", "Личный архив", "Работа на компьютере"];

const seo = {
  title: "О Word2you — личный архив записей с поиском",
  description: "Узнайте, как Word2you помогает сохранять фото и тексты записей в личном архиве, находить их и работать с ними на телефоне и компьютере.",
  canonical: "https://word2you.ru/about"
};

function useAboutSeo() {
  useEffect(() => {
    const previousTitle = document.title;
    const description = document.head.querySelector('meta[name="description"]');
    const previousDescription = description?.getAttribute("content");
    const existingCanonical = document.head.querySelector('link[rel="canonical"]');
    const canonical = existingCanonical || document.createElement("link");
    const previousCanonical = canonical.getAttribute("href");

    document.title = seo.title;
    description?.setAttribute("content", seo.description);
    if (!existingCanonical) {
      canonical.setAttribute("rel", "canonical");
      document.head.append(canonical);
    }
    canonical.setAttribute("href", seo.canonical);

    return () => {
      document.title = previousTitle;
      if (previousDescription !== null && previousDescription !== undefined) {
        description?.setAttribute("content", previousDescription);
      }
      if (existingCanonical) {
        if (previousCanonical === null) canonical.removeAttribute("href");
        else canonical.setAttribute("href", previousCanonical);
      } else {
        canonical.remove();
      }
    };
  }, []);
}

function AboutLogo() {
  return (
    <Link className="about-logo" to="/">
      Word2you <span>Записи</span>
    </Link>
  );
}

function AboutPage() {
  const [lightbox, setLightbox] = useState(null);

  useAboutSeo();

  useEffect(() => {
    if (!lightbox) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setLightbox(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lightbox]);

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
            <span>5 обработок без регистрации.</span>
          </div>
        </div>

        <aside className="about-preview" aria-label="Пример записи">
          <img
            className="about-preview__image"
            src="/handwriting-examples/marketplace-plan-photo.png"
            alt="Фрагмент рукописного конспекта"
          />
          <div className="about-preview__body">
            <span>14 мая 2026 · ✓ Текст загружен</span>
            <h2>Конспект</h2>
            <p>Краткое описание записи и основные мысли, которые потом легко найти в архиве.</p>
            <div className="about-preview__tags">
              <span>учеба</span>
              <span>конспект</span>
              <span>план</span>
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
        <div className="about-notice__copy">
          <h2>Работайте с записями на любом устройстве</h2>
          <p>
            Сфотографируйте запись на телефоне, сохраните текст и откройте его на компьютере.
            После входа можно загрузить сразу несколько фотографий. Исходные фото и готовые тексты
            останутся в личном архиве.
          </p>
          <div className="about-archive-flow" aria-label="От фото на телефоне до работы на компьютере">
            {archiveFlow.map((step, index) => (
              <span key={step}>
                {index > 0 && <span className="about-archive-flow__arrow" aria-hidden="true">→</span>}
                {step}
              </span>
            ))}
          </div>
          <p className="about-notice__links">
            Подробнее: <Link to="/photo-to-text">фото в текст</Link> и <Link to="/handwriting-to-text">рукописные записи</Link>.
          </p>
        </div>
        <div className="about-notice__examples" aria-label="Пример: от фото записи к готовому тексту">
          <figure>
            <button
              type="button"
              className="about-notice__image-button"
              onClick={() => setLightbox({
                src: "/handwriting-examples/marketplace-plan-photo.png",
                alt: "Фото рукописного плана выхода на маркетплейс в тетради",
                label: "Исходное фото"
              })}
              aria-label="Увеличить исходное фото"
            >
              <img
                src="/handwriting-examples/marketplace-plan-photo.png"
                alt="Фото рукописного плана выхода на маркетплейс в тетради"
                loading="lazy"
              />
            </button>
            <figcaption>Исходное фото</figcaption>
          </figure>
          <span className="about-notice__example-arrow" aria-hidden="true">→</span>
          <figure>
            <button
              type="button"
              className="about-notice__image-button"
              onClick={() => setLightbox({
                src: "/handwriting-examples/marketplace-plan-result.png",
                alt: "Оформленный текст плана выхода на маркетплейс после распознавания в Word2you",
                label: "Готовый текст"
              })}
              aria-label="Увеличить готовый текст"
            >
              <img
                src="/handwriting-examples/marketplace-plan-result.png"
                alt="Оформленный текст плана выхода на маркетплейс после распознавания в Word2you"
                loading="lazy"
              />
            </button>
            <figcaption>Готовый текст</figcaption>
          </figure>
        </div>
      </section>

      <section className="about-limits">
        <div>
          <span>Без регистрации</span>
          <strong>5 обработок</strong>
        </div>
        <div>
          <span>После входа в аккаунт</span>
          <strong>ещё 10 обработок</strong>
        </div>
        <div>
          <span>После входа</span>
          <strong>Пакетная загрузка и единый архив</strong>
          <small>На телефоне и компьютере</small>
        </div>
      </section>

      <section className="about-final">
        <h2>Попробуйте сохранить первую запись прямо сейчас.</h2>
        <Link className="about-button about-button--primary" to="/">
          Попробовать бесплатно
        </Link>
      </section>

      <PageFooter />

      {lightbox && (
        <div
          className="handwriting-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.label}
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="handwriting-lightbox__close"
            aria-label="Закрыть увеличенное изображение"
            onClick={() => setLightbox(null)}
          >
            ×
          </button>
          <div className="handwriting-lightbox__content" onClick={(event) => event.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.alt} />
            <p>{lightbox.label}</p>
          </div>
        </div>
      )}
    </main>
  );
}

export default AboutPage;
