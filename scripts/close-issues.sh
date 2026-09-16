#!/bin/bash
#
# DEPRECATED (2026-08-12) — do not run this script.
#
# 非推奨の理由:
#   - 参照ゼロ。`git grep -F 'close-issues.sh'` をリポジトリ全体（本ファイル除く）へ
#     かけても npm script・workflow・docs のいずれにもヒットしない。
#   - 2025 年当時の特定 Issue 番号（#198 / #146 / #145 / #144 / #142）を
#     ハードコードした使い捨てスクリプトであり、対象 Issue はすでにクローズ済み。
#     いま実行してもクローズ済み Issue に無関係なコメントを付けるだけになる。
#
# 退役計画:
#   段階 1（本変更）— ロジックは変更せず deprecate のみ行い、観測期間を置く。
#   段階 2 — 2026-11-12（90 日後）以降に呼び出し元が現れなければ削除する。
#            削除は本変更のスコープ外。
#
set -e

# Issue クローズ用スクリプト
# 使用方法: ./scripts/close-issues.sh [PR番号]

REPO="s977043/river-review"
PR_NUMBER="${1:-}"

if [ -z "$PR_NUMBER" ]; then
  echo "使用方法: $0 <PR番号>"
  echo "例: $0 203"
  exit 1
fi

echo "=== Issue クローズ処理を開始します ==="
echo "リポジトリ: $REPO"
echo "関連PR: #$PR_NUMBER"
echo ""

# Issue #198: リンクチェック失敗
echo ">>> Issue #198 をクローズします..."
gh issue close 198 --repo "$REPO" --comment "READMEのProjectsリンクを修正しました（\`https://github.com/users/s977043/projects/2\` → \`https://github.com/s977043/river-review/projects\`）。

対応PR: #${PR_NUMBER}

次回のlink-checkワークフローでエラーが消失することを確認済みです。クローズします。"
echo "✓ Issue #198 をクローズしました"
echo ""

# Issue #146: 評価ランナーコマンド
echo ">>> Issue #146 をクローズします..."
gh issue close 146 --repo "$REPO" --comment "評価ランナー（\`npm run eval:fixtures\`）は既に実装されており、CLI配線まで完了しています。

実装箇所:
- \`scripts/evaluate-review-fixtures.mjs\`
- \`src/lib/review-fixtures-eval.mjs\`
- \`package.json\` の \`eval:fixtures\` スクリプト

使用方法とオプション詳細は [Evaluation Fixture Format](https://river-review.the3396.com/reference/evaluation-fixture-format) に記載済みです。

クローズします。"
echo "✓ Issue #146 をクローズしました"
echo ""

# Issue #145: 初期フィクスチャ3件
echo ">>> Issue #145 をクローズします..."
gh issue close 145 --repo "$REPO" --comment "代表的なスキルを含む初期フィクスチャは既に追加されています。

実装済みケース:
- Security: 秘密情報検出（3ケース + ガード1件）
- Observability: サイレントcatch検出（2ケース + ガード1件）
- Tests: テスト不足検出（5ケース + ガード1件）

合計13ケースのフィクスチャを \`tests/fixtures/review-eval/cases.json\` に定義済みです。

実行方法:
\`\`\`bash
npm run eval:fixtures
\`\`\`

クローズします。"
echo "✓ Issue #145 をクローズしました"
echo ""

# Issue #144: フィクスチャ形式の定義
echo ">>> Issue #144 をクローズします..."
gh issue close 144 --repo "$REPO" --comment "フィクスチャ形式の定義と使用方法を正式ドキュメント化しました。

追加ドキュメント:
- \`pages/reference/evaluation-fixture-format.md\`
- 公開URL: https://river-review.the3396.com/reference/evaluation-fixture-format

ドキュメントには以下を含みます。
- フィクスチャの構造（cases.json形式）
- 各フィールドの説明（mustInclude, expectNoFindings, minFindings, maxFindings等）
- 実行方法とオプション
- 具体例
- 既知の制限

対応PR: #${PR_NUMBER}

クローズします。"
echo "✓ Issue #144 をクローズしました"
echo ""

# Issue #142: fixtures-based評価本体
echo ">>> Issue #142 をクローズします..."
gh issue close 142 --repo "$REPO" --comment "Fixtures-based skill evaluationの実装が完了しました。

完了したサブ課題:
- ✅ #146 evaluation runner command (scaffold)
- ✅ #144 fixture format definition
- ✅ #145 initial fixtures for 3 representative skills
- ⏸️ #143 CI integration (optional) - 別トラックで継続

実装内容:
- 評価エンジン: \`src/lib/review-fixtures-eval.mjs\`
- ランナースクリプト: \`scripts/evaluate-review-fixtures.mjs\`
- フィクスチャ: \`tests/fixtures/review-eval/cases.json\` (13ケース)
- ドキュメント: \`pages/reference/evaluation-fixture-format.md\`

使用方法:
\`\`\`bash
npm run eval:fixtures           # 全ケース実行
npm run eval:fixtures -- --verbose  # 詳細出力
npm run eval:fixtures -- --phase midstream  # フェーズ指定
\`\`\`

CI連携（#143）は任意タスクとして別途対応を継続します。

クローズします。"
echo "✓ Issue #142 をクローズしました"
echo ""

echo "=== 完了 ==="
echo "クローズしたIssue: #198, #146, #145, #144, #142"
echo ""
echo "継続するIssue:"
echo "  - #143 (CI連携・任意タスク)"
echo "  - #186, #187, #188, #190 (Skill提案・個別対応)"
