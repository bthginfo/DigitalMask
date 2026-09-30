-- Preserve each external production contact as its own directory entry. Names are not used as an identity.
WITH contacts AS (
  SELECT r.id AS production_id, r.organization_id, r.department_id, r.created_by, r.created_at, c.value AS contact
  FROM records r CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.data->'contacts','[]'::jsonb)) c(value)
  WHERE r.kind='productions' AND coalesce(c.value->>'memberId','')=''
    AND coalesce(c.value->>'personId','')='' AND coalesce(c.value->>'name','')<>''
)
INSERT INTO records (id,kind,organization_id,department_id,created_by,created_at,data)
SELECT 'person:legacy:' || md5(production_id || ':' || (contact->>'id')), 'people', organization_id, department_id, created_by, created_at,
  jsonb_build_object('name', contact->>'name', 'position', coalesce(contact->>'role',''), 'organization','','email','','phone','','notes','')
FROM contacts ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE records r SET data=jsonb_set(r.data,'{contacts}',(
  SELECT jsonb_agg(CASE WHEN coalesce(c.value->>'memberId','')='' AND coalesce(c.value->>'personId','')='' AND coalesce(c.value->>'name','')<>''
    THEN c.value || jsonb_build_object('personId','person:legacy:' || md5(r.id || ':' || (c.value->>'id'))) ELSE c.value END ORDER BY c.ordinality)
  FROM jsonb_array_elements(r.data->'contacts') WITH ORDINALITY c(value,ordinality)
)), version=version+1,updated_at=now()
WHERE r.kind='productions' AND EXISTS(
  SELECT 1 FROM jsonb_array_elements(coalesce(r.data->'contacts','[]'::jsonb)) c(value)
  WHERE coalesce(c.value->>'memberId','')='' AND coalesce(c.value->>'personId','')='' AND coalesce(c.value->>'name','')<>''
);
--> statement-breakpoint
-- Dienstuebergaben become global. Preserve the original context internally for history.
UPDATE records SET data=data || jsonb_build_object('legacyProductionId',data->>'productionId','productionId',''),
  production_id=null, version=version+1, updated_at=now()
WHERE kind='handovers' AND coalesce(data->>'productionId','')<>'';

--> statement-breakpoint
-- Files follow the now-global handover, so an old production link cannot block archiving/deletion.
UPDATE records f SET data=f.data || jsonb_build_object('productionId',''), production_id=null, version=version+1, updated_at=now()
WHERE f.kind='files' AND (f.production_id IS NOT NULL OR coalesce(f.data->>'productionId','')<>'') AND EXISTS(
  SELECT 1 FROM records h WHERE h.kind='handovers' AND h.id=f.data->>'recordId' AND h.department_id=f.department_id AND h.production_id IS NULL
);
