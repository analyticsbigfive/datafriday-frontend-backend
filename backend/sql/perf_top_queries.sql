-- Suivi perf (lecture seule) : top requêtes depuis le dernier pg_stat_statements_reset()
-- (remis à zéro le 2026-09-21 après le chantier IOwait). À relancer après un live :
--   psql "$DATABASE_URL_DIRECT" -f backend/sql/perf_top_queries.sql
-- Lecture : disk_kblk = blocs lus sur disque (x8 Ko), rows_call = lignes renvoyées à Node (RAM).
SELECT (SELECT stats_reset FROM pg_stat_statements_info) AS since;

SELECT calls,
       round(total_exec_time / 1000)            AS total_s,
       round(mean_exec_time)                    AS mean_ms,
       round(max_exec_time)                     AS max_ms,
       round(shared_blks_read / 1000)           AS disk_kblk,
       round(rows::numeric / GREATEST(calls,1)) AS rows_call,
       left(regexp_replace(query, '\s+', ' ', 'g'), 160) AS query
FROM pg_stat_statements
WHERE query NOT ILIKE 'explain%' AND query NOT ILIKE '%pg_stat%'
ORDER BY total_exec_time DESC
LIMIT 25;
