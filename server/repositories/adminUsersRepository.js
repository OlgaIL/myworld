import { query } from "../db/index.js";

export const ADMIN_USERS_TIMEZONE = "Europe/Istanbul";
export const ADMIN_USERS_PAGE_SIZE = 25;

function invalid() {
  const error = new Error("INVALID_USER_FILTERS");
  error.status = 400;
  throw error;
}
function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) invalid();
  return value;
}
export function parseAdminUserFilters(input = {}) {
  const value = (key, fallback, choices) => {
    const item = input[key] ?? fallback;
    if (typeof item !== "string" || (choices && !choices.includes(item))) invalid();
    return item;
  };
  const search = value("search", "").trim();
  if (search.length > 160) invalid();
  const rawPage = value("page", "1");
  if (!/^[1-9]\d{0,5}$/.test(rawPage)) invalid();
  const filters = {
    search, page: Number(rawPage),
    payment: value("payment", "all", ["all", "paid", "unpaid"]),
    registered: value("registered", "all", ["all", "today", "7d", "30d", "custom"]),
    activity: value("activity", "all", ["all", "7d", "30d", "never"]),
    sort: value("sort", "newest", ["newest", "lastProcessing", "documents"])
  };
  if (filters.registered === "custom") {
    filters.from = date(input.from);
    filters.to = date(input.to);
    if (filters.from > filters.to) invalid();
  }
  return filters;
}

export async function listAdminUsers(filters, { execute = query } = {}) {
  const values = [];
  const param = value => { values.push(value); return `$${values.length}`; };
  const conditions = [];
  const paid = "exists (select 1 from payments where payments.user_id = users.id and payments.status = 'succeeded')";
  if (filters.search) {
    const pattern = param(`%${filters.search.replace(/[\\%_]/g, "\\$&")}%`);
    const match = `(users.email ilike ${pattern} escape E'\\\\' or users.display_name ilike ${pattern} escape E'\\\\'`;
    conditions.push(`${match}${/^\d+$/.test(filters.search) ? ` or users.id::text = ${param(filters.search)}` : ""})`);
  }
  if (filters.payment !== "all") conditions.push(`${filters.payment === "unpaid" ? "not " : ""}${paid}`);
  const today = `(now() at time zone '${ADMIN_USERS_TIMEZONE}')::date`;
  if (filters.registered === "custom") {
    conditions.push(`users.created_at >= (${param(filters.from)}::date::timestamp at time zone '${ADMIN_USERS_TIMEZONE}')`);
    conditions.push(`users.created_at < ((${param(filters.to)}::date + 1)::timestamp at time zone '${ADMIN_USERS_TIMEZONE}')`);
  } else if (filters.registered !== "all") {
    const days = { today: 0, "7d": 6, "30d": 29 }[filters.registered];
    conditions.push(`users.created_at >= ((${today} - ${param(days)}::int)::timestamp at time zone '${ADMIN_USERS_TIMEZONE}')`);
    conditions.push(`users.created_at < ((${today} + 1)::timestamp at time zone '${ADMIN_USERS_TIMEZONE}')`);
  }
  if (filters.activity === "never") {
    conditions.push("coalesce(users.records_processed_total, 0) = 0 and users.last_processing_at is null");
  } else if (filters.activity !== "all") {
    conditions.push(`users.last_processing_at >= now() - (${param(filters.activity === "7d" ? 7 : 30)}::int * interval '1 day')`);
  }
  const order = {
    newest: "created_at desc, id desc",
    lastProcessing: "last_processing_at desc nulls last, id desc",
    documents: "documents_count desc, id desc"
  }[filters.sort];
  const page = param(filters.page);
  const result = await execute(`
    with filtered as (
      select users.*, ${paid} as has_successful_purchase,
        (select count(*)::int from photos where photos.user_id = users.id) as documents_count
      from users ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
    ), totals as (
      select count(*)::int as filtered_total,
        least(${page}::int, greatest(1, ceil(count(*)::numeric / ${ADMIN_USERS_PAGE_SIZE})))::int as result_page
      from filtered
    )
    select page_users.*, totals.filtered_total, totals.result_page, stats.*
    from totals left join lateral (
      select * from filtered order by ${order}
      limit ${ADMIN_USERS_PAGE_SIZE} offset ((totals.result_page - 1) * ${ADMIN_USERS_PAGE_SIZE})
    ) page_users on true
    left join lateral (
      select count(*) filter (where photos.status = 'processed')::int as documents_processed_count,
        count(*) filter (where photos.status = 'recognized')::int as documents_recognized_count,
        count(*) filter (where photos.status = 'error')::int as documents_error_count,
        count(*) filter (where photos.status = 'no_text')::int as documents_no_text_count,
        count(*) filter (where photos.status in ('uploaded', 'processing'))::int as documents_pending_count,
        count(*) filter (where exists (select 1 from guest_documents where claimed_photo_id = photos.id
          union all select 1 from guest_document_claims where photo_id = photos.id))::int as documents_transferred_from_guest,
        max(photos.created_at) as last_document_at
      from photos where photos.user_id = page_users.id
    ) stats on true
    order by ${order}
  `, values);
  const first = result.rows[0];
  return {
    users: result.rows.filter(row => row.id !== null && row.id !== undefined),
    total: Number(first?.filtered_total || 0), page: Number(first?.result_page || 1),
    pageSize: ADMIN_USERS_PAGE_SIZE, timeZone: ADMIN_USERS_TIMEZONE
  };
}

export async function getAdminUsersSummary({ execute = query } = {}) {
  const result = await execute(`select
    (select count(*)::int from users) as users_count,
    (select count(*)::int from photos join users on users.id = photos.user_id) as documents_count`);
  return { usersCount: Number(result.rows[0].users_count), documentsCount: Number(result.rows[0].documents_count) };
}
