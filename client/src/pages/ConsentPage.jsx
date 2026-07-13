import { Link } from "react-router-dom";
import PageFooter from "../components/PageFooter";

function ConsentPage() {
  return (
    <main className="privacy-page">
      <header className="requisites-topbar">
        <Link className="about-logo" to="/">
          Word2you <span>Записи</span>
        </Link>
      </header>

      <section className="privacy-hero">
        <p className="requisites-eyebrow">Word2you</p>
        <h1>Согласие на обработку персональных данных</h1>
        <p>
          Краткое согласие пользователя на обработку данных для работы сервиса. Дата обновления: 13 июля 2026 года.
        </p>
      </section>

      <div className="privacy-layout">
        <section className="requisites-card">
          <h2>Кому дается согласие</h2>
          <p>
            Пользователь дает согласие Ильиной Ольге Игоревне, самозанятому исполнителю сервиса Word2you, на обработку
            персональных данных, необходимых для работы сайта и оказания функций сервиса.
          </p>
        </section>

        <section className="requisites-card">
          <h2>Какие данные могут обрабатываться</h2>
          <p>
            Имя, адрес электронной почты, идентификаторы аккаунта, cookie, технические данные сессии, загруженные
            изображения, распознанный текст, результаты обработки, категории, теги, история загрузок и заявок на пакеты.
          </p>
        </section>

        <section className="requisites-card">
          <h2>Цели обработки</h2>
          <p>
            Регистрация и вход в аккаунт, загрузка и распознавание записей, подготовка результата, хранение архива,
            поиск по записям, поддержка пользователя, учет лимитов и пакетов, улучшение качества сервиса и обеспечение
            безопасности.
          </p>
        </section>

        <section className="requisites-card">
          <h2>Действия с данными</h2>
          <p>
            Сбор, запись, систематизация, хранение, уточнение, использование, передача техническим провайдерам обработки,
            обезличивание, блокирование, удаление и уничтожение данных в пределах, необходимых для работы сервиса.
          </p>
        </section>

        <section className="requisites-card">
          <h2>Срок действия согласия</h2>
          <p>
            Согласие действует до его отзыва пользователем или до прекращения необходимости обработки данных. Пользователь
            может запросить удаление данных по адресу{" "}
            <a href="mailto:olga.k.ilyina@gmail.com">olga.k.ilyina@gmail.com</a>.
          </p>
        </section>

        <section className="requisites-card">
          <h2>Связанные документы</h2>
          <p>
            Подробнее о правилах сервиса написано в{" "}
            <Link to="/terms">пользовательском соглашении</Link> и{" "}
            <Link to="/privacy">политике обработки персональных данных</Link>.
          </p>
        </section>
      </div>

      <PageFooter />
    </main>
  );
}

export default ConsentPage;
