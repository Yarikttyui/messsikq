set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a

  source "$ENV_FILE"
  set +a
fi

DB_HOST=${DB_HOST:-127.0.0.1}
DB_PORT=${DB_PORT:-3306}
DB_USER=${DB_USER:-root}
DB_PASSWORD=${DB_PASSWORD:-YarikTop12}
DB_NAME=${DB_NAME:-pink_messenger}

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "DROP DATABASE IF EXISTS \\`$DB_NAME\\`; CREATE DATABASE \\`$DB_NAME\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$ROOT_DIR/sql/init.sql"

echo "Database $DB_NAME has been reset."
