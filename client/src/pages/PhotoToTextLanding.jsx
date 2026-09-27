import { Link } from "react-router-dom";
import PageFooter from "../components/PageFooter";

const useCases = [
  {
    title: "Конспекты и заметки",
    text: "Сфотографируйте страницу из тетради, чтобы потом найти нужную тему по словам."
  },
  {
    title: "Документы и важные тексты",
    text: "Соберите фото договоров, справок и фрагментов в одном спокойном архиве."
  },
  {
    title: "Рецепты и бытовые записи",
    text: "Сохраните семейный рецепт или список, который обычно теряется в галерее."
  }
];

const steps = [
  "Загрузите фото записи",
  "Получите аккуратный текст",
  "Найдите запись позже"
];

const saveItems = [
  "конспекты",
  "заметки от руки",
  "документы",
  "рецепты",
  "важные тексты",
  "слайды и фото с экрана"
];

function PhotoToTextLanding() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="landing-logo" to="/">
          Word2you <span>Записи</span>
        </Link>
        <nav className="landing-nav" aria-label="Навигация">
          <a href="#how">Как работает</a>
          <a href="#cases">Для чего</a>
          <Link to="/handwriting-to-text">Рукописный текст</Link>
          <Link className="landing-nav__button" to="/">Попробовать</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <p className="landing-eyebrow">Фото в текст и личный архив записей</p>
          <h1>Фото и записи — в личный цифровой архив</h1>
          <p className="landing-hero__text">
            Загрузите фото с телефона, получите текст и откройте его на компьютере.
          </p>
          <div className="landing-actions">
            <Link className="landing-button landing-button--primary" to="/">Попробовать бесплатно</Link>
            <span>После входа можно загрузить сразу несколько фотографий.</span>
          </div>
        </div>

        <div className="landing-demo" aria-label="Пример работы Word2you Записи">
          <video
            className="landing-demo__video"
            src="/word2you-recipe-text-demo.mp4"
            poster="/word2you-recipe-text-demo.jpg"
            autoPlay
            muted
            loop
            playsInline
          />
        </div>
      </section>

      <section className="landing-proof landing-archive-flow" aria-label="Как запись попадает в личный архив">
        <div>
          <strong>Сфотографируйте на телефоне</strong>
        </div>
        <div>
          <strong>Сохраните текст и исходное фото в архиве</strong>
        </div>
        <div>
          <strong>Откройте и редактируйте на компьютере</strong>
        </div>
      </section>

      <section className="landing-section" id="how">
        <div className="landing-section__heading">
          <p className="landing-eyebrow">Как работает</p>
          <h2>Не просто фото в галерее, а запись, с которой можно работать.</h2>
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

      <section className="landing-split" id="cases">
        <div>
          <p className="landing-eyebrow">Для чего</p>
          <h2>Когда важно не потерять текст “на потом”.</h2>
          <p>
            Word2you Записи подходит для учебы, работы, документов и личных заметок.
            Все, что раньше лежало разрозненными фото, можно собрать в один архив.
          </p>
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

      <section className="landing-video-band">
        <div className="landing-video-band__copy">
          <p className="landing-eyebrow">Пример</p>
          <h2>Сфотографировали запись. Позже нашли ее в архиве.</h2>
        </div>
        <video
          className="landing-video-band__video"
          src="/word2you-recipe-reel.mp4"
          poster="/word2you-recipe-reel.jpg"
          autoPlay
          muted
          loop
          playsInline
        />
      </section>

      <section className="landing-search">
        <p className="landing-eyebrow">Что можно сохранить</p>
        <h2>Все записи, которые обычно остаются случайными фото.</h2>
        <div className="landing-search__chips">
          {saveItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section className="landing-final">
        <div>
          <h2>Попробуйте сохранить первую запись сейчас.</h2>
          <p>Загрузите фото заметки, конспекта, рецепта или важного текста.</p>
        </div>
        <Link className="landing-button landing-button--primary" to="/">Попробовать бесплатно</Link>
      </section>

      <PageFooter />
    </main>
  );
}

export default PhotoToTextLanding;
