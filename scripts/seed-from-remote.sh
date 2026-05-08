#!/bin/bash
# 本番D1から全データをローカルD1にコピーするスクリプト
# 使い方: bash scripts/seed-from-remote.sh
set -euo pipefail

DB_NAME="shirankedo"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -W)"
DUMP_FILE="$SCRIPT_DIR/.seed-dump.json"
SQL_FILE="$SCRIPT_DIR/.seed-insert.sql"

TABLES="articles tracking_repos repo_stats releases llm_models subscription_plans weekly_summaries page_comments llm_model_history subscription_plan_history"

echo "📡 本番D1から全テーブルをダンプ中..."

# 全テーブルを1回のクエリで取得
QUERY=""
for tbl in $TABLES; do
  QUERY+="SELECT '${tbl}' as _table, * FROM ${tbl};"
done

bunx wrangler d1 execute "$DB_NAME" --remote --command "$QUERY" > "$DUMP_FILE" 2>/dev/null

# JSONをパースしてINSERT SQLを生成
python -c "
import json

TABLES = '$TABLES'.split()

with open(r'$DUMP_FILE', encoding='utf-8', errors='replace') as f:
    text = f.read()

start = text.index('[')
results = json.loads(text[start:])

sqls = []
total = 0
for i, tbl in enumerate(TABLES):
    rows = results[i].get('results', [])
    total += len(rows)
    sqls.append(f'DELETE FROM {tbl};')
    for row in rows:
        cols = [k for k in row.keys() if k != '_table']
        vals = []
        for c in cols:
            v = row[c]
            if v is None:
                vals.append('NULL')
            elif isinstance(v, (int, float)):
                vals.append(str(v))
            else:
                escaped = str(v).replace(\"'\", \"''\")
                vals.append(f\"'{escaped}'\")
        col_str = ', '.join(cols)
        val_str = ', '.join(vals)
        sqls.append(f'INSERT INTO {tbl} ({col_str}) VALUES ({val_str});')

with open(r'$SQL_FILE', 'w', encoding='utf-8') as f:
    f.write('\n'.join(sqls))

print(f'  {total} 行を取得')
"

echo "💾 ローカルD1に書き込み中..."
bunx wrangler d1 execute "$DB_NAME" --local --file="$SQL_FILE" > /dev/null 2>&1

# 一時ファイル削除
rm -f "$DUMP_FILE" "$SQL_FILE"

echo "✅ シード完了"
