import { Link } from "react-router-dom";

function LegalConsentText({ className = "" }) {
  return (
    <p className={`legal-consent ${className}`.trim()}>
      Загружая запись, вы соглашаетесь с{" "}
      <Link to="/terms">пользовательским соглашением</Link> и{" "}
      <Link to="/privacy">политикой обработки персональных данных</Link>.
    </p>
  );
}

export default LegalConsentText;
