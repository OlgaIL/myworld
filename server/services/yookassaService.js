import axios from "axios";

const YOOKASSA_API_URL = "https://api.yookassa.ru/v3";

function getAuthConfig({ shopId, secretKey }) {
  return {
    username: shopId,
    password: secretKey
  };
}

export async function createYookassaPayment({
  shopId,
  secretKey,
  idempotenceKey,
  amountValue,
  currency,
  description,
  returnUrl,
  metadata
}) {
  const response = await axios.post(
    `${YOOKASSA_API_URL}/payments`,
    {
      amount: {
        value: Number(amountValue).toFixed(2),
        currency
      },
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: returnUrl
      },
      description,
      metadata
    },
    {
      auth: getAuthConfig({ shopId, secretKey }),
      headers: {
        "Idempotence-Key": idempotenceKey,
        "Content-Type": "application/json"
      },
      timeout: 15000
    }
  );

  return response.data;
}

export async function getYookassaPayment({ shopId, secretKey, paymentId }) {
  const response = await axios.get(`${YOOKASSA_API_URL}/payments/${encodeURIComponent(paymentId)}`, {
    auth: getAuthConfig({ shopId, secretKey }),
    timeout: 15000
  });

  return response.data;
}
