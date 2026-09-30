CREATE UNIQUE INDEX "calendar_category_key_idx" ON "records" USING btree ("department_id",("data"->>'key')) WHERE "records"."kind"='calendarCategories';
--> statement-breakpoint
-- One-time defaults: deleted categories are never recreated on reads.
WITH defaults(data) AS (VALUES ('{"key":"service","name":"Dienst","color":"#377a68","allDay":false}'::jsonb),
('{"key":"rehearsal","name":"Probe","color":"#537fba","allDay":false}'::jsonb),
('{"key":"performance","name":"Vorstellung","color":"#ad698b","allDay":false}'::jsonb),
('{"key":"preparation","name":"Vorbereitung","color":"#ac8235","allDay":false}'::jsonb),
('{"key":"absence","name":"Abwesenheit","color":"#77818e","allDay":true}'::jsonb),
('{"key":"sick","name":"Krank","color":"#b86d73","allDay":true}'::jsonb),
('{"key":"abf","name":"ABF","color":"#8c74ad","allDay":true}'::jsonb),
('{"key":"rest","name":"Ruhetag","color":"#758f8a","allDay":true}'::jsonb),
('{"key":"half-day-off","name":"Halber freier Tag","color":"#ba9560","allDay":true}'::jsonb),
('{"key":"vacation","name":"Urlaub","color":"#5c92a8","allDay":true}'::jsonb))
INSERT INTO records (id,kind,organization_id,department_id,created_by,data)
SELECT 'category:' || d.id || ':' || (defaults.data->>'key'), 'calendarCategories', d.organization_id, d.id, m.user_id, defaults.data
FROM departments d CROSS JOIN defaults
JOIN LATERAL (SELECT user_id FROM memberships WHERE department_id=d.id AND status='active' ORDER BY CASE role WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END LIMIT 1) m ON true
ON CONFLICT DO NOTHING;
