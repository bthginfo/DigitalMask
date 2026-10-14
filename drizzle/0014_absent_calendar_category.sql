-- Neutral category storage, without changing dates, people, working-time credits or stable IDs.
-- Older open clients are accepted by the application and canonicalized before saving.
-- Only category fields and generated calendar notices are changed; free-text chats stay intact.
SELECT pg_advisory_xact_lock(hashtext(department_id || ':calendar'))
FROM (SELECT DISTINCT department_id FROM records WHERE kind = 'calendarCategories') departments
ORDER BY department_id;
--> statement-breakpoint
CREATE FUNCTION pg_temp.digitalmask_absent_label(label text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN regexp_replace(lower(label), '[^a-z0-9]', '', 'g') IN (
    'sick', 'krank', 'krankmitattest', 'krankohneattest', 'krankmitohneattest',
    'krankmitoderohneattest', 'sickwithcertificate', 'sickwithoutcertificate'
  ) THEN 'Absent' ELSE label END;
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.digitalmask_absent_data(record_kind text, document jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE result jsonb := document;
BEGIN
  IF document IS NULL THEN RETURN document; END IF;
  IF record_kind = 'calendarCategories' AND document->>'key' = 'sick' THEN
    result := result || '{"key":"absent","name":"Absent"}'::jsonb;
  ELSIF record_kind = 'calendarCategories' AND document->>'key' = 'absent'
    AND pg_temp.digitalmask_absent_label(document->>'name') IS DISTINCT FROM document->>'name' THEN
    result := jsonb_set(result, '{name}', to_jsonb(pg_temp.digitalmask_absent_label(document->>'name')));
  ELSIF record_kind = 'events' AND document->>'category' IN ('sick', 'absent') THEN
    result := jsonb_set(result, '{category}', '"absent"'::jsonb);
    IF pg_temp.digitalmask_absent_label(document->>'title') IS DISTINCT FROM document->>'title' THEN
      result := jsonb_set(result, '{title}', to_jsonb(pg_temp.digitalmask_absent_label(document->>'title')));
    END IF;
  ELSIF record_kind = 'notifications' AND document->>'type' = 'ServiceChangedV1'
    AND pg_temp.digitalmask_absent_label(document->>'body') IS DISTINCT FROM document->>'body' THEN
    result := jsonb_set(result, '{body}', to_jsonb(pg_temp.digitalmask_absent_label(document->>'body')));
  END IF;
  RETURN result;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.digitalmask_absent_snapshot(record_kind text, document jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(document->'data') = 'object'
    THEN jsonb_set(document, '{data}', pg_temp.digitalmask_absent_data(record_kind, document->'data'))
    ELSE pg_temp.digitalmask_absent_data(record_kind, document) END;
$$;
--> statement-breakpoint
-- Abort rather than overwrite an independently created category in the same department.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM records legacy JOIN records target ON legacy.department_id = target.department_id
    WHERE legacy.kind = 'calendarCategories' AND legacy.data->>'key' = 'sick'
      AND target.kind = 'calendarCategories' AND target.data->>'key' = 'absent'
  ) THEN RAISE EXCEPTION 'Calendar category migration requires resolving a key collision first'; END IF;
END;
$$;
--> statement-breakpoint
-- This is an encoding rename, not a user edit: keep record versions and timestamps stable.
UPDATE records
SET data = pg_temp.digitalmask_absent_data(kind, data)
WHERE kind IN ('calendarCategories', 'events', 'notifications')
  AND data IS DISTINCT FROM pg_temp.digitalmask_absent_data(kind, data);
--> statement-breakpoint
UPDATE record_history history
SET data = pg_temp.digitalmask_absent_data(record.kind, history.data)
FROM records record
WHERE history.record_id = record.id
  AND record.kind IN ('calendarCategories', 'events', 'notifications')
  AND history.data IS DISTINCT FROM pg_temp.digitalmask_absent_data(record.kind, history.data);
--> statement-breakpoint
UPDATE record_operations
SET before_data = pg_temp.digitalmask_absent_snapshot(kind, before_data),
    after_data = pg_temp.digitalmask_absent_snapshot(kind, after_data),
    undo_payload = pg_temp.digitalmask_absent_snapshot(kind, undo_payload)
WHERE kind IN ('calendarCategories', 'events', 'notifications') AND (
  before_data IS DISTINCT FROM pg_temp.digitalmask_absent_snapshot(kind, before_data)
  OR after_data IS DISTINCT FROM pg_temp.digitalmask_absent_snapshot(kind, after_data)
  OR undo_payload IS DISTINCT FROM pg_temp.digitalmask_absent_snapshot(kind, undo_payload)
);
--> statement-breakpoint
UPDATE outbox
SET payload = jsonb_set(payload, '{body}', to_jsonb(pg_temp.digitalmask_absent_label(payload->>'body')))
WHERE type = 'ServiceChangedV1'
  AND payload->>'body' IS DISTINCT FROM pg_temp.digitalmask_absent_label(payload->>'body');
--> statement-breakpoint
DROP FUNCTION pg_temp.digitalmask_absent_snapshot(text, jsonb);
--> statement-breakpoint
DROP FUNCTION pg_temp.digitalmask_absent_data(text, jsonb);
--> statement-breakpoint
DROP FUNCTION pg_temp.digitalmask_absent_label(text);
