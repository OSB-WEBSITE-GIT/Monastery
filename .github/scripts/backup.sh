#!/usr/bin/env bash
# Weekly full backup (run by .github/workflows/weekly-backup.yml).
# Produces backup-YYYY-MM-DD.7z, encrypted with BACKUP_PASSWORD, containing:
#   data.sql        all website content, drafts and change history (restore: see RECOVERY.md)
#   full.sql        the complete public schema with data (for reference)
#   users.csv       who has access and their roles (people are re-invited after a restore)
#   schema.sql      the database setup script at the time of the backup
#   photos/         every photo referenced anywhere in the content or its history
# Needs: SUPABASE_DB_URL (database connection string), BACKUP_PASSWORD. Optional: PG_DUMP (command to run pg_dump/psql).
set -euo pipefail
ROOT="${1:-.}"; OUT="${2:-backup-out}"
: "${SUPABASE_DB_URL:?Backups are not set up: add the SUPABASE_DB_URL secret (see README, step 9).}"
: "${BACKUP_PASSWORD:?Backups are not set up: add the BACKUP_PASSWORD secret (see README, step 9).}"
PGD="${PG_DUMP:-pg_dump}"; PSQL="${PSQL:-psql}"
WORK="$(mktemp -d)"; mkdir -p "$WORK/b/photos" "$OUT"; chmod -R a+rwx "$WORK"   # the database tools may run as another user
OUT="$(cd "$OUT" && pwd)"

echo "Saving the database…"
$PGD "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges -f "$WORK/b/full.sql"
# data.sql uses plain INSERT statements, so it can be pasted into Supabase's SQL Editor to restore.
$PGD "$SUPABASE_DB_URL" --schema=public --data-only --no-owner --no-privileges --inserts --rows-per-insert=100 \
     --exclude-table-data=public.profiles --exclude-table-data=public.site_meta -f "$WORK/b/data.body.sql"
{ echo "-- Website content restore. Run AFTER schema.sql, in the SQL Editor or with psql."
  echo "SET session_replication_role = replica;  -- load rows in any order without firing triggers"
  grep -v -E '^(SET |SELECT pg_catalog\.set_config)' "$WORK/b/data.body.sql"
  echo "SET session_replication_role = origin;"
  echo "UPDATE public.site_meta SET content_version = content_version + 1, changed_at = now() WHERE id = 1;"
} > "$WORK/b/data.sql"; rm "$WORK/b/data.body.sql"
$PSQL "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -c "\copy (select u.email, coalesce(p.role,'') as role, coalesce(p.full_name,'') as name from auth.users u left join public.profiles p on p.id = u.id order by u.email) to '$WORK/b/users.csv' csv header"
cp "$ROOT/supabase/schema.sql" "$WORK/b/schema.sql"

echo "Saving photos…"
URL=$(grep -oE 'supabaseUrl:[[:space:]]*"[^"]*"' "$ROOT/assets/js/config.js" | sed -E 's/.*"([^"]*)"/\1/' | sed 's#/*$##')
PREFIX="$URL/storage/v1/object/public/media/"
count=0; missing=0
# every storage address in the content (including old versions in the history), with each published size
grep -oE "${PREFIX//./\\.}[^[:space:]\"'\\\\]+" "$WORK/b/data.sql" | sort -u | while read -r u; do
  rel="${u#"$PREFIX"}"; path="${rel%%#*}"; frag="${rel#*#}"; [ "$frag" = "$rel" ] && frag=""
  widths=$(printf '%s' "$frag" | tr '&' '\n' | sed -n 's/^w=//p' | tr ',' ' ')
  if [[ "$path" =~ ^(.*)\.[0-9]+\.jpg$ ]] && [ -n "$widths" ]; then files=""; for w in $widths; do files="$files ${BASH_REMATCH[1]}.$w.jpg"; done; else files="$path"; fi
  for f in $files; do
    dest="$WORK/b/photos/$f"; [ -f "$dest" ] && continue; mkdir -p "$(dirname "$dest")"
    if curl --fail --silent --show-error --max-time 60 -o "$dest" "$PREFIX$f"; then count=$((count+1)); else rm -f "$dest"; missing=$((missing+1)); echo "  could not save $f"; fi
  done
done
echo "Photos saved: $(find "$WORK/b/photos" -type f | wc -l)"

NAME="backup-$(date -u +%Y-%m-%d).7z"
echo "Encrypting…"
( cd "$WORK/b" && 7z a -t7z -mhe=on -mx=5 -p"$BACKUP_PASSWORD" "$OUT/$NAME" . >/dev/null )
echo "Created $OUT/$NAME ($(du -h "$OUT/$NAME" | cut -f1))."
rm -rf "$WORK"
