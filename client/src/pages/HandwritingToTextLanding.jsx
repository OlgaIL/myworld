import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PageFooter from "../components/PageFooter";
import { captureAcquisitionContext, getAnalyticsDeviceContext, trackGoal } from "../services/analytics";
import {
  DEFAULT_INTENT,
  trackCrossDeviceBlockView,
  trackCrossDeviceCtaClick,
  trackHandwritingLandingCta,
  trackHandwritingLandingView
} from "../utils/handwritingLandingAnalytics";

const useCases = [
  {
    title: "Конспекты и тетради",
    text: "Перенесите важные темы и задания из тетради в запись, которую легко найти позже."
  },
  {
    title: "Заметки от руки",
    text: "Сохраните мысль, список или черновик не только в галерее, но и в текстовом виде."
  },
  {
    title: "Рабочие записи",
    text: "Вернитесь к итогам встречи, плану или задаче, когда фотография уже затерялась среди других."
  }
];

const steps = [
  "Загрузите фотографию",
  "Проверьте и улучшите текст",
  "Сохраните запись в личном архиве"
];

const realExamples = [
  {
    tabLabel: "Маркетплейс",
    title: "Пошаговый план на маркетплейс",
    note: "План из тетради стал структурированной записью, которую можно проверить, улучшить и скопировать.",
    photo: "/handwriting-examples/marketplace-plan-photo.png",
    photoAlt: "Рукописный план продаж на маркетплейсе в тетради",
    result: "/handwriting-examples/marketplace-plan-result.png",
    resultAlt: "Оформленная запись Word2you «Пошаговый план на маркетплейс»"
  },
  {
    tabLabel: "Продвижение",
    title: "План продвижения и текущие задачи",
    note: "Короткий список задач сохранился в текстовом виде вместе с заголовком и описанием.",
    photo: "/handwriting-examples/promotion-photo.png",
    photoAlt: "Рукописные заметки о продвижении, складе и отзывах покупателей",
    result: "/handwriting-examples/promotion-result.png",
    resultAlt: "Оформленная запись Word2you «План продвижения и текущие задачи»"
  },
  {
    tabLabel: "Логистика",
    title: "Основы логистики",
    note: "Заметка о FBO и FBS превратилась в аккуратный конспект с отдельными абзацами.",
    photo: "/handwriting-examples/logistics-photo.png",
    photoAlt: "Рукописная заметка о схемах логистики FBO и FBS",
    result: "/handwriting-examples/logistics-result.png",
    resultAlt: "Оформленная запись Word2you «Основы логистики»"
  }
];

const SEO = {
  title: "Распознать рукописный текст с фото онлайн — Word2you",
  description: "Распознайте рукописный текст, конспект или заметку с фотографии. Проверьте, улучшите и сохраните результат в личном архиве Word2you.",
  canonical: "https://word2you.ru/handwriting-to-text"
};

function UploadIcon() {
  return (
    <svg className="handwriting-upload-cta__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CarouselArrow({ direction }) {
  const path = direction === "previous" ? "M15 6l-6 6 6 6" : "m9 6 6 6-6 6";

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  );
}

function updateMetaTag(attribute, key, content) {
  const selector = `meta[${attribute}="${key}"]`;
  const existing = document.head.querySelector(selector);
  const meta = existing || document.createElement("meta");
  const previousContent = meta.getAttribute("content");

  if (!existing) {
    meta.setAttribute(attribute, key);
    document.head.append(meta);
  }

  meta.setAttribute("content", content);

  return () => {
    if (!existing) {
      meta.remove();
      return;
    }

    if (previousContent === null) {
      meta.removeAttribute("content");
    } else {
      meta.setAttribute("content", previousContent);
    }
  };
}

function updateCanonical(href) {
  const existing = document.head.querySelector('link[rel="canonical"]');
  const canonical = existing || document.createElement("link");
  const previousHref = canonical.getAttribute("href");

  if (!existing) {
    canonical.setAttribute("rel", "canonical");
    document.head.append(canonical);
  }

  canonical.setAttribute("href", href);

  return () => {
    if (!existing) {
      canonical.remove();
      return;
    }

    if (previousHref === null) {
      canonical.removeAttribute("href");
    } else {
      canonical.setAttribute("href", previousHref);
    }
  };
}

function useHandwritingSeo() {
  useEffect(() => {
    const previousTitle = document.title;
    const restoreDescription = updateMetaTag("name", "description", SEO.description);
    const restoreOgTitle = updateMetaTag("property", "og:title", SEO.title);
    const restoreOgDescription = updateMetaTag("property", "og:description", SEO.description);
    const restoreCanonical = updateCanonical(SEO.canonical);

    document.title = SEO.title;

    return () => {
      document.title = previousTitle;
      restoreDescription();
      restoreOgTitle();
      restoreOgDescription();
      restoreCanonical();
    };
  }, []);
}

function HandwritingToTextLanding() {
  const location = useLocation();
  const trackedSearches = useRef(new Set());
  const crossDeviceSectionRef = useRef(null);
  const crossDeviceViewTracked = useRef(false);
  const [activeExampleIndex, setActiveExampleIndex] = useState(0);
  const [lightbox, setLightbox] = useState(null);
  const activeExample = realExamples[activeExampleIndex];

  useHandwritingSeo();

  useEffect(() => {
    if (trackedSearches.current.has(location.search)) {
      return;
    }

    captureAcquisitionContext(DEFAULT_INTENT);
    trackHandwritingLandingView({ search: location.search, track: trackGoal });
    trackedSearches.current.add(location.search);
  }, [location.search]);

  useEffect(() => {
    if (!lightbox) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setLightbox(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lightbox]);

  useEffect(() => {
    const section = crossDeviceSectionRef.current;
    if (!section) {
      return undefined;
    }

    const trackView = () => {
      if (crossDeviceViewTracked.current) {
        return;
      }

      trackCrossDeviceBlockView({
        deviceType: getAnalyticsDeviceContext().deviceType,
        track: trackGoal
      });
      crossDeviceViewTracked.current = true;
    };

    if (typeof window.IntersectionObserver !== "function") {
      trackView();
      return undefined;
    }

    const observer = new window.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        trackView();
        observer.disconnect();
      }
    }, { threshold: 0.35 });

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const handleCtaClick = (placement) => {
    trackHandwritingLandingCta({
      search: location.search,
      placement,
      track: trackGoal
    });
  };

  const showPreviousExample = () => {
    setActiveExampleIndex((current) => (current - 1 + realExamples.length) % realExamples.length);
  };

  const showNextExample = () => {
    setActiveExampleIndex((current) => (current + 1) % realExamples.length);
  };

  const handleCrossDeviceCtaClick = () => {
    handleCtaClick("cross_device");
    trackCrossDeviceCtaClick({
      deviceType: getAnalyticsDeviceContext().deviceType,
      placement: "cross_device_block",
      track: trackGoal
    });
  };

  return (
    <main className="landing-page handwriting-landing">
      <header className="landing-header">
        <Link className="landing-logo" to="/">
          Word2you <span>Записи</span>
        </Link>
        <nav className="landing-nav" aria-label="Навигация">
          <a href="#how">Как работает</a>
          <a href="#cases">Для чего</a>
          <Link to="/photo-to-text">Фото в текст</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <p className="landing-eyebrow">Рукописный текст с фото</p>
          <h1>Превратите рукописный текст в понятную цифровую запись</h1>
          <p className="landing-hero__text">
            Загрузите фото конспекта, страницы из тетради или заметки от руки. Word2you
            распознает текст, поможет улучшить результат и сохранит запись в личном архиве.
          </p>
          <div className="landing-actions">
            <Link
              className="landing-button handwriting-upload-cta"
              to="/"
              aria-label="Загрузить фото рукописной записи"
              onClick={() => handleCtaClick("hero")}
            >
              <UploadIcon />
              Загрузить фото
            </Link>
            <span>5 обработок без регистрации · ещё 10 после входа · карта не нужна</span>
          </div>
        </div>

        <aside className="handwriting-process-card" aria-label="Реальный пример результата Word2you">
          <div className="handwriting-process-card__topline">
            <span>Реальный пример</span>
            <span>Фрагмент</span>
          </div>
          <figure className="handwriting-process-card__photo">
            <figcaption>Фрагмент рукописной страницы</figcaption>
            <div className="handwriting-process-card__photo-frame">
              <img src={realExamples[0].photo} alt={realExamples[0].photoAlt} />
              <span className="handwriting-scan-line" aria-hidden="true" />
            </div>
          </figure>
          <div className="handwriting-process-card__flow" aria-hidden="true">
            <span />
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M5 12h13M14 7l5 5-5 5" />
            </svg>
          </div>
          <article className="handwriting-process-card__result">
            <span className="handwriting-process-card__status">✓ Текст распознан</span>
            <strong>Пошаговый план на маркетплейс</strong>
            <ul>
              <li>Нужно определиться с товаром, который ты будешь продавать</li>
              <li>Регистрация компании и подготовка «кучи» бумажек</li>
            </ul>
          </article>
          <p className="handwriting-process-card__note">
            Результат можно проверить, улучшить и скопировать к себе в документ.
          </p>
        </aside>
      </section>

      <section className="landing-section handwriting-example-section" aria-labelledby="result-example-title">
        <div className="landing-section__heading">
          <p className="landing-eyebrow">Реальные примеры</p>
          <h2 id="result-example-title">Посмотрите результат в деталях</h2>
        </div>
        <p className="handwriting-example-section__intro">
          Выберите пример и сравните исходную рукопись с оформленной записью Word2you.
          Изображения показаны полностью — каждое можно открыть крупнее.
        </p>

        <article
          className="handwriting-showcase"
          id="handwriting-example-panel"
          role="region"
          aria-roledescription="карусель"
          aria-label={`Пример ${activeExampleIndex + 1} из ${realExamples.length}: ${activeExample.title}`}
          key={activeExample.title}
        >
          <div className="handwriting-showcase__heading">
            <div>
              <span>Реальный пример</span>
              <h3>{activeExample.title}</h3>
            </div>
            <div className="handwriting-carousel-controls" aria-label="Листать примеры">
              <button type="button" onClick={showPreviousExample} aria-label="Предыдущий пример">
                <CarouselArrow direction="previous" />
              </button>
              <span aria-live="polite">
                {String(activeExampleIndex + 1).padStart(2, "0")} / {String(realExamples.length).padStart(2, "0")}
              </span>
              <button type="button" onClick={showNextExample} aria-label="Следующий пример">
                <CarouselArrow direction="next" />
              </button>
            </div>
          </div>

          <p className="handwriting-showcase__hint">Нажмите на изображение, чтобы увеличить</p>

          <div className="handwriting-showcase__comparison">
            <figure className="handwriting-showcase__stage handwriting-showcase__stage--photo">
              <figcaption><span>1</span> Исходное фото</figcaption>
              <button
                type="button"
                className="handwriting-showcase__media"
                onClick={() => setLightbox({
                  src: activeExample.photo,
                  alt: activeExample.photoAlt,
                  label: `Исходное фото — ${activeExample.title}`
                })}
                aria-label={`Увеличить исходное фото: ${activeExample.title}`}
              >
                <img src={activeExample.photo} alt={activeExample.photoAlt} />
                <span className="handwriting-showcase__zoom">Увеличить</span>
                <span className="handwriting-showcase__scan" aria-hidden="true" />
              </button>
            </figure>

            <div className="handwriting-showcase__connector" aria-hidden="true">
              <svg viewBox="0 0 72 32" focusable="false">
                <path className="handwriting-showcase__connector-line" d="M2 16h62" />
                <path className="handwriting-showcase__connector-tip" d="m55 7 10 9-10 9" />
              </svg>
              <span>Word2you</span>
            </div>

            <figure className="handwriting-showcase__stage handwriting-showcase__stage--result">
              <figcaption><span>2</span> Оформленная запись</figcaption>
              <button
                type="button"
                className="handwriting-showcase__media"
                onClick={() => setLightbox({
                  src: activeExample.result,
                  alt: activeExample.resultAlt,
                  label: `Оформленная запись — ${activeExample.title}`
                })}
                aria-label={`Увеличить оформленную запись: ${activeExample.title}`}
              >
                <img src={activeExample.result} alt={activeExample.resultAlt} />
                <span className="handwriting-showcase__zoom">Увеличить</span>
              </button>
            </figure>
          </div>

          <p className="handwriting-showcase__note">{activeExample.note}</p>
          <div className="handwriting-example-tags" aria-label="Темы примеров">
            {realExamples.map((example, index) => (
              <span className={index === activeExampleIndex ? "is-current" : ""} key={example.tabLabel}>
                #{example.tabLabel.toLowerCase()}
              </span>
            ))}
          </div>
        </article>

        <p className="handwriting-example-section__note">
          Это реальные примеры. Качество результата зависит от фотографии и разборчивости почерка.
        </p>
      </section>

      <section className="landing-split" id="cases">
        <div>
          <p className="landing-eyebrow">Для каких задач</p>
          <h2>Когда фото хочется превратить в запись, а не оставить в галерее.</h2>
          <p>Текст можно проверить, улучшить, скопировать и вернуть к нему позже из личного архива.</p>
        </div>
        <div className="landing-usecases">
          {useCases.map((item) => (
            <article className="landing-usecase" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" id="how">
        <div className="landing-section__heading">
          <p className="landing-eyebrow">Как работает</p>
          <h2>Три шага от страницы в тетради до записи в архиве.</h2>
        </div>
        <div className="landing-steps">
          {steps.map((step, index) => (
            <article className="landing-step" key={step}>
              <span>{index + 1}</span>
              <h3>{step}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="handwriting-cross-device" ref={crossDeviceSectionRef}>
        <div className="handwriting-cross-device__copy">
          <p className="landing-eyebrow">Один архив на разных устройствах</p>
          <h2>Сфотографируйте на телефоне — откройте готовый текст на компьютере.</h2>
          <p>Документы доступны на любом устройстве после входа в тот же аккаунт.</p>
          <Link
            className="landing-button handwriting-upload-cta"
            to="/"
            aria-label="Загрузить фото и сохранить результат в аккаунте"
            onClick={handleCrossDeviceCtaClick}
          >
            <UploadIcon />
            Загрузить фото
          </Link>
        </div>
        <div className="handwriting-cross-device__flow" aria-label="С телефона в личный архив и на компьютер">
          <span>Телефон</span>
          <i aria-hidden="true">→</i>
          <span>Один аккаунт</span>
          <i aria-hidden="true">→</i>
          <span>Компьютер</span>
        </div>
      </section>

      <section className="landing-split handwriting-quality">
        <div>
          <p className="landing-eyebrow">Честно о качестве</p>
          <h2>Лучше снимок — удобнее результат.</h2>
        </div>
        <p>
          Результат зависит от качества фотографии и разборчивости почерка. Лучше всего
          работают ровные, резкие снимки без теней и бликов. Распознанный текст можно
          проверить и улучшить.
        </p>
      </section>

      <section className="landing-final">
        <div>
          <h2>Попробуйте распознать первую рукописную запись</h2>
          <p>5 обработок без регистрации · ещё 10 после входа</p>
        </div>
        <Link
          className="landing-button handwriting-upload-cta"
          to="/"
          aria-label="Загрузить фото первой рукописной записи"
          onClick={() => handleCtaClick("final")}
        >
          <UploadIcon />
          Загрузить фото
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

export default HandwritingToTextLanding;
