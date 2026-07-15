import { Link } from "react-router-dom";
import PageFooter from "../components/PageFooter";

const ownerDetails = [
  ["Статус", "Самозанятый"],
  ["Получатель", "Ильина Ольга Игоревна"],
  ["ИНН", "501803615021"],
  ["Вид деятельности", "ИТ-сфера: прочее"],
  ["Email", "support@word2you.ru"],
  ["Телефон", "+7 910 423 29 21"]
];

const bankDetails = [
  ["Банк-получатель", "АО «ТБанк»"],
  ["Счет получателя", "40817810600002799118"],
  ["Корреспондентский счет", "30101810145250000974"],
  ["БИК", "044525974"],
  ["ИНН/КПП банка", "7710140679/771301001"],
  [
    "Назначение платежа",
    "Перевод средств по договору No 5033540757, Ильина Ольга Игоревна, НДС не облагается."
  ]
];

function RequisitesSection({ title, items }) {
  return (
    <section className="requisites-card">
      <h2>{title}</h2>
      <dl className="requisites-list">
        {items.map(([label, value]) => (
          <div className="requisites-list__row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RequisitesPage() {
  return (
    <main className="requisites-page">
      <header className="requisites-topbar">
        <Link className="about-logo" to="/">
          Word2you <span>Записи</span>
        </Link>
      </header>

      <section className="requisites-hero">
        <p className="requisites-eyebrow">Word2you</p>
        <h1>Реквизиты</h1>
      </section>

      <div className="requisites-layout">
        <RequisitesSection title="Данные получателя" items={ownerDetails} />
        <RequisitesSection title="Банковские реквизиты" items={bankDetails} />
      </div>

      <PageFooter />
    </main>
  );
}

export default RequisitesPage;
