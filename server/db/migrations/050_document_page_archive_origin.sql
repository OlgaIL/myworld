alter table document_pages add column if not exists added_from_archive boolean not null default false;

-- Restore provenance for assemblies made before this flag existed. Merge
-- receipts cover pages already present at that moment; archive-append receipts
-- identify their incoming pages through the retired single-document aliases.
update document_pages dp set added_from_archive = true
from photos p
where p.id = dp.photo_id and p.user_id = dp.user_id and exists (
  select 1 from document_operations o
  where o.user_id = dp.user_id
    and o.result_json->'documents' @> jsonb_build_array(jsonb_build_object('id', dp.document_id::text))
    and ((o.kind = 'merge' and p.created_at <= o.created_at)
      or (o.kind = 'append-archive' and exists (
        select 1 from document_aliases a
        where a.user_id = dp.user_id and a.anchor_photo_id = dp.photo_id
          and o.result_json->'removedDocumentIds' @> to_jsonb(a.old_document_id::text)
      )))
);
