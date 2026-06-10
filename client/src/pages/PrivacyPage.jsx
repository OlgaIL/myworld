import { Link } from "react-router-dom";

function PrivacyPage() {
  return (
    <main className="privacy-page">
      <header className="requisites-topbar">
        <Link className="about-logo" to="/">
          Word2you <span>Записи</span>
        </Link>
      </header>

      <section className="privacy-hero">
        <p className="requisites-eyebrow">Word2you</p>
        <h1>Политика конфиденциальности</h1>
        <p>
          Эта страница коротко объясняет, какие данные использует сервис и зачем.
        </p>
      </section>

      <div className="privacy-layout">
        <section className="requisites-card">
          <h2>Какие данные мы обрабатываем</h2>
          <p>
            Word2you обрабатывает данные, которые нужны для работы сервиса: данные аккаунта Google при входе,
            загруженные изображения, распознанный текст, результаты обработки, технические данные сессии и cookie.
          </p>
        </section>

        <section className="requisites-card">
          <h2>Зачем это нужно</h2>
          <p>
            Данные используются, чтобы загрузить и распознать записи, сохранить их в личном кабинете, показать список
            документов, обеспечить вход в аккаунт и улучшать работу сервиса.
          </p>
        </section>

        <section className="requisites-card">
          <h2>Cookie и аналитика</h2>
          <p>
            Мы используем cookie для корректной работы сайта, сохранения сессии пользователя и гостевого режима.
            Также на сайте может использоваться Яндекс.Метрика, чтобы понимать, как работает сервис и какие разделы
            требуют улучшения.
          </p>
        </section>

        <section className="requisites-card">
          <h2>Хранение данных</h2>
          <p>
            Метаданные записей хранятся в базе данных, а загруженные изображения пока хранятся на сервере проекта.
            Пользователь может удалить записи из личного кабинета.
          </p>
        </section>

        <section className="requisites-card">
          <h2>Контакты</h2>
          <p>
            По вопросам обработки данных можно написать на почту{" "}
            <a href="mailto:olga.k.ilyina@gmail.com">olga.k.ilyina@gmail.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}

export default PrivacyPage;
