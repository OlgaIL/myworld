import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import PageFooter from "../components/PageFooter";
import { useAuthContext } from "../contexts/AuthContext";
import { createAccessRequest, createYookassaPayment } from "../services/api";
import { trackGoal, trackGoalOnce } from "../services/analytics";

const packages = [
  {
    title: "Мини",
    value: "50 обработок",
    price: "290 ₽",
    note: "5.8 ₽ за обработку",
    text: "Для небольшого архива: записи, чеки, фото документов и тексты на потом.",
    action: "Оплатить"
  },
  {
    title: "Стандарт",
    value: "150 обработок",
    price: "590 ₽",
    note: "3.9 ₽ за обработку",
    text: "Хороший вариант, если нужно разобрать конспекты, заметки и накопившиеся фото текстов.",
    action: "Оплатить",
    featured: true,
    badge: "Хороший выбор"
  },
  {
    title: "Макси",
    value: "500 обработок",
    price: "1 490 ₽",
    note: "2.9 ₽ за обработку",
    text: "Для больших архивов, учебных материалов и регулярной работы с записями.",
    action: "Оплатить"
  }
];

const benefits = [
  {
    title: "Распознавание и обработка",
    text: "Превращаем фото с текстом в понятную запись: заголовок, краткое описание, теги и аккуратный текст."
  },
  {
    title: "Обработки не сгорают",
    text: "Купленный пакет остается на балансе. Можно использовать его постепенно, когда появляются новые записи."
  },
  {
    title: "Архив под рукой",
    text: "Готовые записи сохраняются в личном кабинете: их можно искать, открывать и удалять."
  }
];

function PackagesPage() {
  const navigate = useNavigate();
  const { user, authLoading, reloadUser } = useAuthContext();
  const [requestStatus, setRequestStatus] = useState({});

  useEffect(() => {
    trackGoalOnce("packages_view", user?.id || "guest", {
      authenticated: Boolean(user)
    });
  }, [user]);

  async function requestPackage(item) {
    try {
      trackGoal("package_select", {
        package_name: item.title,
        package_value: item.value,
        package_price: item.price
      });
      setRequestStatus((current) => ({ ...current, [item.title]: "sending" }));
      const payment = await createYookassaPayment({ packageTitle: item.title });

      if (payment?.credited) {
        trackGoalOnce("payment_success", payment.paymentId || `${user?.id}:${item.title}`, {
          package_name: item.title,
          package_price: item.price
        });
        await reloadUser();
        navigate("/account");
        return;
      }

      if (payment?.confirmationUrl) {
        trackGoal("payment_redirect", {
          package_name: item.title,
          package_price: item.price
        });
        window.location.href = payment.confirmationUrl;
        return;
      }

      throw new Error("PAYMENT_CONFIRMATION_URL_MISSING");
    } catch (error) {
      console.error("Package payment failed:", error.response?.data || error.message);

      if (error.response?.status === 503 && error.response?.data?.error === "YOOKASSA_DISABLED") {
        try {
          await createAccessRequest({
            message: `Запрос пакета: ${item.title}, ${item.value}, ${item.price}`
          });
          trackGoal("package_request", {
            package_name: item.title,
            package_price: item.price
          });
          setRequestStatus((current) => ({ ...current, [item.title]: "sent" }));
          navigate(`/account?requestedPackage=${encodeURIComponent(item.title)}`);
          return;
        } catch {
          setRequestStatus((current) => ({ ...current, [item.title]: "error" }));
          return;
        }
      }

      setRequestStatus((current) => ({ ...current, [item.title]: "error" }));
    }
  }

  return (
    <main className="packages-page">
      <header className="requisites-topbar">
        <Link className="about-logo" to="/">
          Word2you <span>Записи</span>
        </Link>
      </header>

      <section className="packages-hero">
        <p className="requisites-eyebrow">Пакеты</p>
        <h1>Бесплатные обработки закончились</h1>
        <p>
          Вы уже попробовали распознавание. Пополните пакет, чтобы продолжить сохранять записи, конспекты, фото
          документов и важные тексты.
        </p>
      </section>

      <section className="packages-benefits" aria-label="Преимущества пакетов">
        {benefits.map((item) => (
          <article className="packages-benefit" key={item.title}>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </section>

      <section className="packages-grid">
        {packages.map((item) => (
          <article className={`packages-card ${item.featured ? "packages-card--featured" : ""}`} key={item.title}>
            {item.badge && <span className="packages-card__badge">{item.badge}</span>}
            <span className="packages-card__title">Пакет «{item.title}»</span>
            <strong>{item.value}</strong>
            <p className="packages-card__price">{item.price}</p>
            <p className="packages-card__note">{item.note}</p>
            <p>{item.text}</p>
            {!user && !authLoading ? (
              <Link className="packages-card__button" to="/account">
                Войти и оплатить
              </Link>
            ) : (
              <button
                className="packages-card__button"
                type="button"
                onClick={() => requestPackage(item)}
                disabled={authLoading || requestStatus[item.title] === "sending" || requestStatus[item.title] === "sent"}
              >
                {requestStatus[item.title] === "sending"
                  ? "Отправляем..."
                  : requestStatus[item.title] === "sent"
                    ? "Заявка отправлена"
                    : item.action}
              </button>
            )}
            {requestStatus[item.title] === "error" && (
              <p className="packages-card__status packages-card__status--error">Не удалось перейти к оплате</p>
            )}
            {requestStatus[item.title] === "sent" && (
              <p className="packages-card__status">
                Мы получили заявку и свяжемся с вами. На вашу почту отправлена инструкция по оплате.
              </p>
            )}
          </article>
        ))}
      </section>

      <section className="packages-note">
        <h2>Что считается обработкой?</h2>
        <p>
          Одна успешная обработка — это одно загруженное фото, для которого Word2you распознал текст и подготовил
          результат. Если запись удалить из архива, потраченная обработка не возвращается.
        </p>
      </section>

      <section className="about-final packages-final">
        <h2>Готовые записи остаются в вашем архиве.</h2>
        <Link className="about-button about-button--primary" to="/">
          Вернуться к записям
        </Link>
      </section>

      <PageFooter />
    </main>
  );
}

export default PackagesPage;
