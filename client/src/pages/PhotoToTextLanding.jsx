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
  "Загрузите фото",
  "Проверьте и скопируйте текст",
  "При необходимости войдите и сохраните запись"
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
          <h1>Распознайте текст с фото и скопируйте результат</h1>
          <p className="landing-hero__text">
            Загрузите фото печатного текста или скриншот. Получите текст,
            проверьте его и скопируйте. После входа можно сохранить запись вместе
            с исходным фото и открыть её на другом устройстве в том же аккаунте.
          </p>
          <div className="landing-actions">
            <Link className="landing-button landing-button--primary" to="/">Перейти к загрузке фото</Link>
            <span>На следующей странице выберите фотографию</span>
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
          <h2>Как получить и скопировать текст с фото</h2>
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

      <section className="landing-section photo-text-example" aria-labelledby="photo-text-example-heading">
        <div className="landing-section__heading">
          <p className="landing-eyebrow">Реальный пример</p>
          <h2 id="photo-text-example-heading">Фото учебного задания → текст для копирования и сохранения</h2>
          <p>Word2you распознаёт условия задания. Этот пример не показывает решение задачи. Результат нужно сверять с оригиналом.</p>
        </div>
        <div className="photo-text-example__grid">
          <figure>
            <figcaption>Фрагмент исходной страницы: задания 1–2</figcaption>
            <div className="photo-text-example__source">
              <a href="/photo-text-examples/textbook-source.png" target="_blank" rel="noopener noreferrer" aria-label="Открыть полную исходную страницу">
                <img src="/photo-text-examples/textbook-source.png" alt="Печатные задания 1–2: о картофеле и капусте и о фруктовых деревьях в саду" loading="lazy" width="1102" height="635" />
              </a>
            </div>
          </figure>
          <figure>
            <figcaption>Фрагмент результата: задания 1–2, вкладка „Текст“</figcaption>
            <div className="photo-text-example__result">
              <p>- 1. В магазин привезли 3 т 250 кг картофеля, а капусты - на 24 ц меньше, чем картофеля. Спустя день в магазине осталось капусты 126 кг, а картофеля - на 6 ц 84 кг больше. Сколько продано за день картофеля и капусты отдельно?</p>
              <p>- 2. В саду было 28 рядов фруктовых деревьев. При расширении сада число рядов было доведено до 30, а число деревьев в каждом ряду увеличили на два. После чего число фруктовых деревьев увеличилось на 108. Сколько фруктовых деревьев стало в саду?</p>
            </div>
          </figure>
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

      <section className="landing-section" id="faq" aria-labelledby="photo-faq-heading">
        <div className="landing-section__heading">
          <p className="landing-eyebrow">Вопросы и ответы</p>
          <h2 id="photo-faq-heading">О распознавании текста с фото</h2>
        </div>
        <div className="landing-usecases">
          <article className="landing-usecase">
            <h3>Как скопировать текст с фото?</h3>
            <p>Загрузите фотографию в инструмент, проверьте результат и нажмите кнопку копирования рядом с текстом.</p>
          </article>
          <article className="landing-usecase">
            <h3>Можно ли распознать текст с телефона?</h3>
            <p>Да, откройте Word2you в браузере телефона и выберите фото. После входа сохраните запись в архиве: на компьютере она будет доступна в том же аккаунте.</p>
          </article>
          <article className="landing-usecase">
            <h3>Какие файлы принимает сервис?</h3>
            <p>Поддерживаются изображения JPEG, PNG и WebP. Можно загрузить фото печатного текста или скриншот.</p>
          </article>
          <article className="landing-usecase">
            <h3>Что делать, если в тексте есть ошибки?</h3>
            <p>Сверьте результат с оригиналом перед копированием. Если текст размытый или есть блики, сделайте более чёткое фото при ровном освещении и загрузите его снова. Для записей от руки смотрите <Link to="/handwriting-to-text">распознавание рукописного текста</Link>.</p>
          </article>
        </div>
      </section>

      <section className="landing-final">
        <div>
          <h2>Получите текст с фотографии</h2>
          <p>На следующей странице выберите фотографию</p>
        </div>
        <Link className="landing-button landing-button--primary" to="/">Перейти к загрузке фото</Link>
      </section>

      <PageFooter />
    </main>
  );
}

export default PhotoToTextLanding;
