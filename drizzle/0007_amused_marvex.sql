CREATE UNIQUE INDEX "domain_category_key_idx" ON "records" USING btree ("department_id",("data"->>'scope'),("data"->>'key')) WHERE "records"."kind"='categories';
--> statement-breakpoint
-- One-time domain categories; no inserts occur on workspace reads.
WITH defaults(data) AS (VALUES ('{"scope":"time","key":"production","name":"Produktion","color":"#377a68","order":0}'::jsonb),
('{"scope":"time","key":"office","name":"Büro","color":"#537fba","order":1}'::jsonb),
('{"scope":"time","key":"cleaning","name":"Aufräumen","color":"#ac8235","order":2}'::jsonb),
('{"scope":"time","key":"other","name":"Sonstiges","color":"#77818e","order":3}'::jsonb),
('{"scope":"materials","key":"wig","name":"Perücke","color":"#8c74ad","order":0}'::jsonb),
('{"scope":"materials","key":"makeup","name":"Makeup","color":"#ad698b","order":1}'::jsonb),
('{"scope":"materials","key":"tool","name":"Werkzeug","color":"#ac8235","order":2}'::jsonb),
('{"scope":"materials","key":"other","name":"Sonstiges","color":"#77818e","order":3}'::jsonb),
('{"scope":"looks","key":"preparation","name":"Vorbereitung","color":"#377a68","order":0}'::jsonb),
('{"scope":"looks","key":"makeup","name":"Makeup","color":"#377a68","order":1}'::jsonb),
('{"scope":"looks","key":"hair","name":"Haare","color":"#377a68","order":2}'::jsonb),
('{"scope":"looks","key":"wigs-beards","name":"Perücken und Bärte","color":"#377a68","order":3}'::jsonb),
('{"scope":"looks","key":"changeover","name":"Umbau & Wechsel","color":"#377a68","order":4}'::jsonb),
('{"scope":"looks","key":"setup","name":"Einrichten","color":"#377a68","order":5}'::jsonb),
('{"scope":"handovers","key":"care","name":"Worauf muss ich achten","color":"#377a68","order":0}'::jsonb),
('{"scope":"handovers","key":"notes","name":"Allgemeine Hinweise","color":"#377a68","order":1}'::jsonb))
INSERT INTO records (id,kind,organization_id,department_id,created_by,data)
SELECT 'domain-category:' || d.id || ':' || (defaults.data->>'scope') || ':' || (defaults.data->>'key'), 'categories', d.organization_id, d.id, m.user_id, defaults.data
FROM departments d CROSS JOIN defaults
JOIN LATERAL (SELECT user_id FROM memberships WHERE department_id=d.id AND status='active' ORDER BY CASE role WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END LIMIT 1) m ON true
ON CONFLICT DO NOTHING;
