import { query, withTransaction } from "../db/index.js";

export async function upsertGoogleUser({ googleId, email, displayName, avatarUrl }) {
  const result = await query(
    `
      insert into users (google_id, email, display_name, avatar_url)
      values ($1, $2, $3, $4)
      on conflict (google_id)
      do update set
        email = excluded.email,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        updated_at = now()
      returning *
    `,
    [googleId, email, displayName, avatarUrl]
  );

  return result.rows[0];
}

export async function upsertYandexUser({ yandexId, email, displayName, avatarUrl }) {
  const existingByYandex = await query("select * from users where yandex_id = $1", [yandexId]);

  if (existingByYandex.rows[0]) {
    const result = await query(
      `
        update users
        set
          email = $2,
          display_name = $3,
          avatar_url = $4,
          updated_at = now()
        where yandex_id = $1
        returning *
      `,
      [yandexId, email, displayName, avatarUrl]
    );

    return result.rows[0];
  }

  if (email) {
    const existingByEmail = await query(
      `
        select *
        from users
        where lower(email) = lower($1)
        order by created_at asc
        limit 1
      `,
      [email]
    );

    if (existingByEmail.rows[0] && !existingByEmail.rows[0].yandex_id) {
      const result = await query(
        `
          update users
          set
            yandex_id = $2,
            display_name = $3,
            avatar_url = coalesce($4, avatar_url),
            updated_at = now()
          where id = $1
          returning *
        `,
        [existingByEmail.rows[0].id, yandexId, displayName, avatarUrl]
      );

      return result.rows[0];
    }
  }

  const result = await query(
    `
      insert into users (yandex_id, email, display_name, avatar_url)
      values ($1, $2, $3, $4)
      returning *
    `,
    [yandexId, email, displayName, avatarUrl]
  );

  return result.rows[0];
}

async function upsertProviderUser({ providerColumn, providerId, email, displayName, avatarUrl }) {
  const allowedProviderColumns = new Set(["vk_id", "sber_id", "mts_id"]);
  if (!allowedProviderColumns.has(providerColumn)) {
    throw new Error("Unsupported auth provider");
  }

  const normalizedName = displayName || "User";
  const existingByProvider = await query(`select * from users where ${providerColumn} = $1`, [providerId]);

  if (existingByProvider.rows[0]) {
    const result = await query(
      `
        update users
        set
          email = coalesce($2, email),
          display_name = $3,
          avatar_url = coalesce($4, avatar_url),
          updated_at = now()
        where ${providerColumn} = $1
        returning *
      `,
      [providerId, email || null, normalizedName, avatarUrl || null]
    );

    return result.rows[0];
  }

  if (email) {
    const existingByEmail = await query(
      "select * from users where lower(email) = lower($1) order by created_at asc limit 1",
      [email]
    );

    if (existingByEmail.rows[0] && !existingByEmail.rows[0][providerColumn]) {
      const result = await query(
        `
          update users
          set
            ${providerColumn} = $2,
            display_name = $3,
            avatar_url = coalesce($4, avatar_url),
            updated_at = now()
          where id = $1
          returning *
        `,
        [existingByEmail.rows[0].id, providerId, normalizedName, avatarUrl || null]
      );

      return result.rows[0];
    }
  }

  const result = await query(
    `
      insert into users (${providerColumn}, email, display_name, avatar_url)
      values ($1, $2, $3, $4)
      returning *
    `,
    [providerId, email || null, normalizedName, avatarUrl || null]
  );

  return result.rows[0];
}

export function upsertVkUser({ vkId, email, displayName, avatarUrl }) {
  return upsertProviderUser({ providerColumn: "vk_id", providerId: vkId, email, displayName, avatarUrl });
}

export function upsertSberUser({ sberId, email, displayName, avatarUrl }) {
  return upsertProviderUser({ providerColumn: "sber_id", providerId: sberId, email, displayName, avatarUrl });
}

export function upsertMtsUser({ mtsId, email, displayName, avatarUrl }) {
  return upsertProviderUser({ providerColumn: "mts_id", providerId: mtsId, email, displayName, avatarUrl });
}

export async function findUserById(id) {
  const result = await query("select * from users where id = $1", [id]);
  return result.rows[0] || null;
}

export async function findUserByGoogleId(googleId) {
  const result = await query("select * from users where google_id = $1", [googleId]);
  return result.rows[0] || null;
}

export async function saveUserAcquisitionContext(userId, context) {
  if (!userId || !context || Object.keys(context).length === 0) {
    return null;
  }

  const result = await query(
    `
      update users
      set
        acquisition_context = coalesce(acquisition_context, $2::jsonb),
        acquisition_captured_at = coalesce(acquisition_captured_at, now()),
        updated_at = now()
      where id = $1
      returning *
    `,
    [userId, JSON.stringify(context)]
  );

  return result.rows[0] || null;
}

export async function saveUserAnalyticsIdentity(userId, {
  metrikaClientId = null,
  deviceType = null,
  deviceOs = null,
  deviceBrowser = null
}) {
  const result = await query(
    `
      update users
      set
        metrika_client_id = coalesce(metrika_client_id, $2),
        first_device_type = coalesce(first_device_type, $3),
        first_device_os = coalesce(first_device_os, $4),
        first_device_browser = coalesce(first_device_browser, $5),
        updated_at = now()
      where id = $1
      returning *
    `,
    [userId, metrikaClientId, deviceType, deviceOs, deviceBrowser]
  );

  return result.rows[0] || null;
}

export async function listUsersForAdmin() {
  const result = await query(
    `
      select
        users.id,
        users.email,
        users.email_verified_at,
        users.display_name,
        users.avatar_url,
        users.google_id,
        users.yandex_id,
        users.vk_id,
        users.sber_id,
        users.mts_id,
        users.processing_enabled,
        users.processing_quota,
        users.processing_used,
        users.free_processing_limit,
        users.records_processed_total,
        users.last_processing_at,
        users.first_device_type,
        users.first_device_os,
        users.first_device_browser,
        users.metrika_client_id,
        users.documents_created_total,
        users.documents_deleted_total,
        users.documents_history_complete,
        users.processing_mode,
        users.access_expires_at,
        users.acquisition_context,
        users.acquisition_captured_at,
        users.created_at,
        users.updated_at,
        count(photos.id)::int as documents_count,
        max(photos.created_at) as last_document_at
      from users
      left join photos on photos.user_id = users.id
      group by users.id
      order by users.created_at desc
    `
  );

  return result.rows;
}

export async function findUserForAdmin(userId) {
  const result = await query(
    `
      select
        users.id,
        users.email,
        users.email_verified_at,
        users.display_name,
        users.avatar_url,
        users.google_id,
        users.yandex_id,
        users.vk_id,
        users.sber_id,
        users.mts_id,
        users.processing_enabled,
        users.processing_quota,
        users.processing_used,
        users.free_processing_limit,
        users.records_processed_total,
        users.last_processing_at,
        users.first_device_type,
        users.first_device_os,
        users.first_device_browser,
        users.metrika_client_id,
        users.documents_created_total,
        users.documents_deleted_total,
        users.documents_history_complete,
        users.processing_mode,
        users.access_expires_at,
        users.acquisition_context,
        users.acquisition_captured_at,
        users.created_at,
        users.updated_at,
        count(photos.id)::int as documents_count,
        max(photos.created_at) as last_document_at
      from users
      left join photos on photos.user_id = users.id
      where users.id = $1
      group by users.id
      limit 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

export async function updateUserProcessingAccess(userId, { processingEnabled, processingQuota, processingUsed }) {
  const result = await query(
    `
      update users
      set
        processing_enabled = $2,
        processing_quota = $3,
        processing_used = $4,
        updated_at = now()
      where id = $1
      returning *
    `,
    [userId, processingEnabled, processingQuota, processingUsed]
  );

  return result.rows[0] || null;
}

export async function updateUserProductAccess(userId, { processingEnabled, processingQuota, processingUsed, accessExpiresAt }) {
  const result = await query(
    `
      update users
      set
        processing_enabled = $2,
        processing_quota = $3,
        processing_used = $4,
        access_expires_at = $5,
        updated_at = now()
      where id = $1
      returning *
    `,
    [userId, processingEnabled, processingQuota, processingUsed, accessExpiresAt || null]
  );

  return result.rows[0] || null;
}

export async function consumeProcessingAccess(userId) {
  return withTransaction(async (client) => {
    const result = await client.query("select * from users where id = $1 for update", [userId]);
    const user = result.rows[0] || null;

    if (!user) {
      return null;
    }

    if (user.processing_enabled) {
      return user;
    }

    const quota = Number(user.processing_quota || 0);
    const used = Number(user.processing_used || 0);

    if (used >= quota) {
      return null;
    }

    const updated = await client.query(
      `
        update users
        set
          processing_used = processing_used + 1,
          updated_at = now()
        where id = $1
        returning *
      `,
      [userId]
    );

    return updated.rows[0] || null;
  });
}

export async function incrementUserRecordsProcessedTotalWithClient(client, userId) {
  const result = await client.query(
    `
      update users
      set
        records_processed_total = records_processed_total + 1,
        last_processing_at = now(),
        processing_used = case
          when
            processing_enabled = false
            and (access_expires_at is null or access_expires_at <= now())
            and records_processed_total >= free_processing_limit
            and processing_used < processing_quota
          then processing_used + 1
          else processing_used
        end,
        updated_at = now()
      where id = $1
      returning *
    `,
    [userId]
  );

  return result.rows[0] || null;
}

export async function incrementUserRecordsProcessedTotal(userId) {
  return withTransaction((client) => incrementUserRecordsProcessedTotalWithClient(client, userId));
}

export async function updateUserLegalAgreement(userId, legalVersion) {
  const result = await query(
    `
      update users
      set
        legal_accepted_at = now(),
        legal_version = $2,
        updated_at = now()
      where id = $1
      returning *
    `,
    [userId, legalVersion]
  );

  return result.rows[0] || null;
}

export function mapUserForSession(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    googleId: user.google_id,
    yandexId: user.yandex_id,
    vkId: user.vk_id,
    sberId: user.sber_id,
    mtsId: user.mts_id,
    email: user.email,
    emailVerifiedAt: user.email_verified_at || null,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    createdAt: user.created_at || null,
    processingEnabled: Boolean(user.processing_enabled),
    processingQuota: Number(user.processing_quota || 0),
    processingUsed: Number(user.processing_used || 0),
    freeProcessingLimit: Number(user.free_processing_limit || 0),
    recordsProcessedTotal: Number(user.records_processed_total || 0),
    processingMode: user.processing_mode || null,
    accessExpiresAt: user.access_expires_at || null,
    legalAcceptedAt: user.legal_accepted_at || null,
    legalVersion: user.legal_version || null
  };
}
