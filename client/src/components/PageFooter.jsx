import { Link } from "react-router-dom";

function PageFooter() {
  return (
    <footer className="page-footer">
      <Link className="topbar__link" to="/about">
        О проекте
      </Link>
      <Link className="topbar__link" to="/packages">
        Пакеты
      </Link>
      <Link className="topbar__link" to="/terms">
        Пользовательское соглашение
      </Link>
      <Link className="topbar__link" to="/privacy">
        Политика персональных данных
      </Link>
      <Link className="topbar__link" to="/consent">
        Согласие на обработку данных
      </Link>
      <Link className="topbar__link" to="/requisites">
        Реквизиты
      </Link>
    </footer>
  );
}

export default PageFooter;
