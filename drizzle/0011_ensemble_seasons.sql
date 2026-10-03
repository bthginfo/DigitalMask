-- Keep one actor identity across seasons. Existing catalogue entries belong to the
-- initial current roster; saved casting links also provide reliable historical membership.
-- Explicit memberships (including []) are never replaced.
WITH local_date AS (
  SELECT now() AT TIME ZONE 'Europe/Berlin' AS today
), current_season AS (
  SELECT extract(year FROM today)::integer - CASE WHEN extract(month FROM today) < 8 THEN 1 ELSE 0 END AS start_year
  FROM local_date
), production_labels AS (
  SELECT id, department_id,
    regexp_match(trim(coalesce(data->>'season', '')), '^([0-9]{4})[[:space:]]*[/–—-][[:space:]]*([0-9]{2}|[0-9]{4})$') AS parts
  FROM records WHERE kind = 'productions'
), production_years AS (
  SELECT id, department_id, parts[1]::integer AS start_year,
    CASE WHEN length(parts[2]) = 2 THEN (parts[1]::integer / 100) * 100 + parts[2]::integer ELSE parts[2]::integer END AS end_year
  FROM production_labels WHERE parts IS NOT NULL
), memberships AS (
  SELECT a.id AS actor_id, concat(s.start_year, '/', s.start_year + 1) AS season
  FROM records a CROSS JOIN current_season s
  WHERE a.kind = 'actors' AND NOT (a.data ? 'ensembleSeasons')
  UNION
  SELECT a.id AS actor_id, concat(p.start_year, '/', p.end_year) AS season
  FROM records a
  JOIN records c ON c.kind = 'casting' AND c.department_id = a.department_id AND c.data->>'actorId' = a.id
  JOIN production_years p ON p.id = c.data->>'productionId' AND p.department_id = a.department_id
  WHERE a.kind = 'actors' AND NOT (a.data ? 'ensembleSeasons') AND p.end_year = p.start_year + 1
), assigned AS (
  SELECT actor_id, jsonb_agg(season ORDER BY season DESC) AS seasons
  FROM memberships GROUP BY actor_id
)
UPDATE records a
SET data = jsonb_set(a.data, '{ensembleSeasons}', assigned.seasons),
    version = a.version + 1, updated_at = now()
FROM assigned
WHERE a.id = assigned.actor_id AND a.kind = 'actors' AND NOT (a.data ? 'ensembleSeasons');
