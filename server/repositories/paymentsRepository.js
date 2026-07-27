import { query, withTransaction } from "../db/index.js";

export async function createPayment({
  userId,
  idempotenceKey,
  packageTitle,
  packageAmount,
  amountValue,
  currency = "RUB"
}) {
  const result = await query(
    `
      insert into payments (
        user_id,
        idempotence_key,
        package_title,
        package_amount,
        amount_value,
        currency
      )
      values ($1, $2, $3, $4, $5, $6)
      returning *
    `,
    [userId, idempotenceKey, packageTitle, packageAmount, amountValue, currency]
  );

  return result.rows[0];
}

export async function updatePaymentProviderData(id, {
  providerPaymentId,
  status,
  confirmationUrl,
  rawPayload
}) {
  const result = await query(
    `
      update payments
      set
        provider_payment_id = $2,
        status = $3,
        confirmation_url = $4,
        raw_payload = $5,
        updated_at = now()
      where id = $1
      returning *
    `,
    [id, providerPaymentId, status, confirmationUrl, rawPayload]
  );

  return result.rows[0] || null;
}

export async function markPaymentCanceled(providerPaymentId, rawPayload = null) {
  const result = await query(
    `
      update payments
      set
        status = 'canceled',
        raw_payload = coalesce($2, raw_payload),
        updated_at = now()
      where provider_payment_id = $1
        and status <> 'succeeded'
      returning *
    `,
    [providerPaymentId, rawPayload]
  );

  return result.rows[0] || null;
}

export async function markPaymentSucceededAndCredit(providerPaymentId, rawPayload = null) {
  return withTransaction(async (client) => {
    const paymentResult = await client.query(
      "select * from payments where provider_payment_id = $1 for update",
      [providerPaymentId]
    );
    const payment = paymentResult.rows[0] || null;

    if (!payment) {
      return null;
    }

    if (payment.status === "succeeded") {
      return { payment, credited: false };
    }

    const updatedPaymentResult = await client.query(
      `
        update payments
        set
          status = 'succeeded',
          raw_payload = coalesce($2, raw_payload),
          paid_at = coalesce(paid_at, now()),
          updated_at = now()
        where id = $1
        returning *
      `,
      [payment.id, rawPayload]
    );

    await client.query(
      `
        update users
        set
          processing_enabled = false,
          processing_quota = coalesce(processing_quota, 0) + $2,
          updated_at = now()
        where id = $1
      `,
      [payment.user_id, Number(payment.package_amount || 0)]
    );

    return {
      payment: updatedPaymentResult.rows[0],
      credited: true
    };
  });
}
