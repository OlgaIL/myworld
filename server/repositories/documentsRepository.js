import { query } from "../db/index.js";

const activityColumns = `exists(select 1 from document_upload_batches b
    where b.target_document_id = d.id and b.user_id = d.user_id
      and b.state = 'active' and b.lease_until > now()) as upload_active,
  exists(select 1 from document_pages dp join photos p on p.id = dp.photo_id
    where dp.document_id = d.id and (p.status = 'processing' or p.table_status = 'processing')) as processing_active,
  exists(select 1 from document_pages dp join recognition_improvement_requests r on r.photo_id = dp.photo_id
    where dp.document_id = d.id and r.status = 'in_review') as review_active`;

// One statement gives header and pages from the same committed snapshot.
export async function loadDocuments(userId, ids = null, execute = query) {
  const result = await execute(`select d.*, ${activityColumns}, coalesce((
    select jsonb_agg(to_jsonb(p) || jsonb_build_object('id', p.id::text, 'position', dp.position, 'addedFromArchive', dp.added_from_archive) order by dp.position)
    from document_pages dp join photos p on p.id = dp.photo_id and p.user_id = dp.user_id
    where dp.document_id = d.id and dp.user_id = d.user_id
  ), '[]'::jsonb) as pages, (
    select jsonb_build_object('batchId', b.id, 'mode', b.mode,
      'state', case when b.state = 'active' and b.lease_until <= now() then 'expired' else b.state end,
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'itemId', i.item_id, 'ordinal', i.ordinal, 'state',
        case when i.state = 'stored' and i.photo_id is null then 'removed' else i.state end,
        'photoId', i.photo_id::text, 'filename', p.filename) order by i.ordinal), '[]'::jsonb)
        from document_upload_items i left join photos p on p.id = i.photo_id where i.batch_id = b.id))
    from document_upload_batches b where b.target_document_id = d.id and b.user_id = d.user_id
      and b.mode in ('group', 'append') order by b.created_at desc, b.id desc limit 1
  ) as upload_progress from documents d
    where d.user_id = $1 and ($2::uuid[] is null or d.id = any($2::uuid[]))
    order by d.archive_at desc, d.id`, [userId, ids]);
  return result.rows;
}

export async function loadDocumentActivity(userId, ids, execute = query) {
  return (await execute(`select d.id, ${activityColumns} from documents d
    where d.user_id = $1 and d.id = any($2::uuid[])`, [userId, ids])).rows;
}

export async function countDocumentStorage(userId, execute = query) {
  const result = await execute(`select
    (select count(*)::int from documents where user_id = $1) as documents_stored,
    (select count(*)::int from photos where user_id = $1) as pages_stored`, [userId]);
  return { documentsStored: result.rows[0].documents_stored, pagesStored: result.rows[0].pages_stored };
}

export async function resolveDocumentLocation(userId, { filename, documentId }, execute = query) {
  const result = await execute(`select dp.document_id, dp.photo_id, dp.position,
      d.structure_version, p.filename
    from document_pages dp join photos p on p.id = dp.photo_id and p.user_id = dp.user_id
    join documents d on d.id = dp.document_id and d.user_id = dp.user_id
    where dp.user_id = $1 and (
      ($2::text is not null and p.filename = $2) or
      ($3::uuid is not null and dp.photo_id = (
        select anchor_photo_id from document_aliases where old_document_id = $3 and user_id = $1)))
    order by dp.photo_id limit 1`, [userId, filename ?? null, documentId ?? null]);
  return result.rows[0] || null;
}

export async function lockDocumentRows(client, userId, ids) {
  const documents = await client.query(`select * from documents where user_id = $1
    and id = any($2::uuid[]) order by id for update`, [userId, ids]);
  await client.query(`select p.id from photos p join document_pages dp on dp.photo_id = p.id
    where dp.user_id = $1 and dp.document_id = any($2::uuid[]) order by p.id for update of p`, [userId, ids]);
  return documents.rows;
}

export async function createDocumentForPage(client, userId, photoId) {
  const result = await client.query(`insert into documents(user_id, title, display_title,
      summary, category, section, topic, tags, metadata_source_photo_id,
      metadata_state, created_at, archive_at)
    select user_id, title, display_title, summary, category, section, topic, tags, id,
      case when status in ('processed', 'no_text') then 'ready' else 'pending' end,
      created_at, created_at from photos where id = $1 and user_id = $2 returning id`, [photoId, userId]);
  return result.rows[0].id;
}
