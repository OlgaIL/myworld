import { Link, useLocation } from "react-router-dom";
import "./PromoRelatedLinks.css";

const pages = [
  { path: "/photo-to-text", label: "Распознать текст с фото" },
  { path: "/handwriting-to-text", label: "Рукописный текст с фото в печатный" },
  { path: "/batch-photo-to-text", label: "Распознать текст с нескольких фото" },
  { path: "/table-from-photo", label: "Распознать таблицу с фото" },
  { path: "/about", label: "Все возможности Word2you" }
];

export default function PromoRelatedLinks() {
  const { pathname } = useLocation();
  return (
    <section className="landing-section promo-related" aria-labelledby="promo-related-heading">
      <h2 id="promo-related-heading">Другие задачи</h2>
      <nav className="promo-related__links" aria-label="Другие возможности Word2you">
        {pages.filter(page => page.path !== pathname).map(page => (
          <Link key={page.path} to={page.path}>{page.label}</Link>
        ))}
      </nav>
    </section>
  );
}
