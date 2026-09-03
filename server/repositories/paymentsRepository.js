import { query, withTransaction } from "../db/index.js";

export async function createPayment({
  userId,
  idempotenceKey,
  packageId,
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
        package_id,
        package_title,
        package_amount,
        amount_value,
        currency
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      returning *
    `,
    [userId, idempotenceKey, packageId, packageTitle, packageAmount, amountValue, currency]
  );

  return result.rows[0];
}

export async function findActivePaymentByPackage(userId, packageId) {
  const result = await query(
    `
      select *
      from payments
      where user_id = $1
        and package_id = $2
        and status in ('pending', 'waiting_for_capture', 'succeeded')
      order by created_at desc
      limit 1
    `,
    [userId, packageId]
  );

  return result.rows[0] || null;
}

export async function hasSuccessfulPackagePayment(userId, packageId) {
  const result = await query(
    `
      select exists(
        select 1
        from payments
        where user_id = $1 and package_id = $2 and status = 'succeeded'
      ) as used
    `,
    [userId, packageId]
  );

  return Boolean(result.rows[0]?.used);
}

export async function markPaymentFailedById(id, rawPayload = null) {
  const result = await query(
    `
      update payments
      set
        status = 'failed',
        raw_payload = coalesce($2, raw_payload),
        updated_at = now()
      where id = $1 and status = 'pending'
      returning *
    `,
    [id, rawPayload]
  );

  return result.rows[0] || null;
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

    const creditEventResult = await client.query(
      "select id from processing_credit_events where payment_id = $1",
      [payment.id]
    );

    if (creditEventResult.rows[0]) {
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

    await client.query(
      `
        insert into processing_credit_events (
          user_id,
          payment_id,
          source,
          package_title,
          amount,
          note
        )
        values ($1, $2, 'yookassa', $3, $4, $5)
        on conflict do nothing
      `,
      [
        payment.user_id,
        payment.id,
        payment.package_title,
        Number(payment.package_amount || 0),
        `Оплата ЮKassa · ${payment.amount_value} ${payment.currency}`
      ]
    );

    return {
      payment: updatedPaymentResult.rows[0],
      credited: true
    };
  });
}

export async function grantManualProcessingCredit({
  userId,
  packageTitle,
  amount,
  note = "",
  createdBy = "admin"
}) {
  return withTransaction(async (client) => {
    const userResult = await client.query("select * from users where id = $1 for update", [userId]);
    const user = userResult.rows[0] || null;

    if (!user) {
      return null;
    }

    const updatedUserResult = await client.query(
      `
        update users
        set
          processing_enabled = false,
          processing_quota = coalesce(processing_quota, 0) + $2,
          updated_at = now()
        where id = $1
        returning *
      `,
      [userId, amount]
    );

    await client.query(
      `
        insert into processing_credit_events (
          user_id,
          source,
          package_title,
          amount,
          note,
          created_by
        )
        values ($1, 'manual', $2, $3, $4, $5)
      `,
      [userId, packageTitle, amount, note, createdBy]
    );

    return updatedUserResult.rows[0] || null;
  });
}

export async function listProcessingCreditEventsForAdmin() {
  const result = await query(`
      select
        processing_credit_events.*,
        payments.package_id,
        users.email,
      users.display_name,
      payments.provider_payment_id,
      payments.amount_value,
      payments.currency,
      payments.status as payment_status
    from processing_credit_events
    join users on users.id = processing_credit_events.user_id
    left join payments on payments.id = processing_credit_events.payment_id
    order by processing_credit_events.created_at desc
    limit 200
  `);

  return result.rows;
}

export async function listProcessingCreditEventsForUser(userId) {
  const result = await query(
    `
      select
        processing_credit_events.*,
        payments.package_id,
        payments.amount_value,
        payments.currency,
        payments.status as payment_status
      from processing_credit_events
      left join payments on payments.id = processing_credit_events.payment_id
      where processing_credit_events.user_id = $1
      order by processing_credit_events.created_at asc
    `,
    [userId]
  );

  return result.rows;
}
