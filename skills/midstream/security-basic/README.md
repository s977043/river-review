# Baseline Security Checks

セキュリティレビューの基本的なチェックを行うスキルです。
スキル定義: `skills/midstream/security-basic/SKILL.md`（YAML frontmatter + Markdown）。

## 概要

このスキルは、コードの差分（diff）を分析し、一般的なセキュリティ脆弱性を検出します：

- **SQLインジェクション**: 文字列連結によるクエリ構築
- **XSS (Cross-Site Scripting)**: 未サニタイズの HTML 出力
- **秘密情報の漏洩**: ハードコードされた API キーやパスワード
- **入力バリデーション**: 外部入力の検証不足
- **認証・認可**: アクセス制御の欠如

## 使用方法

### 対象ファイル

以下のパターンにマッチするファイルが対象：

```text
**/{api,routes,db,ui,components,auth,security,config}/**/*.{ts,tsx,js,jsx}
```

### 実行

```bash
# バリデーション
npm run skills:validate

# promptfoo での評価（設定完了後）
cd skills/midstream/security-basic
npx promptfoo eval
```

## 出力例

```text
**Finding:** SQL injection vulnerability in user lookup query
**Evidence:** Line 42: `db.query(\`SELECT * FROM users WHERE id = ${userId}\`)`
**Impact:** Attacker could execute arbitrary SQL commands
**Fix:** Use parameterized queries: `db.query('SELECT * FROM users WHERE id = ?', [userId])`
**Severity:** major
**Confidence:** high
```

## テストケース

### Happy Path (fixtures/01-sql-injection-happy.md)

安全なコード例：

- パラメータ化されたクエリ
- 適切なサニタイゼーション
- 環境変数からの秘密情報読み込み

### Edge Case (fixtures/02-false-positive-test.md)

偽陽性を避けるケース：

- テストファイル内のダミー値
- 環境変数参照
- 短い文字列定数

### Happy Path (fixtures/03-open-redirect-backslash-happy.md)

検出するケース：

- PHP `parse_url` でホスト一致を判定しているが、`\` を含む戻り先 URL を拒否していない

### Edge Case (fixtures/04-open-redirect-relative-path-allowlist-guard.md)

偽陽性を避けるケース：

- 戻り先 URL を、単一の `/` で始まり `\` と制御文字を含まない相対パスだけに制限している

### Happy Path (fixtures/05-open-redirect-null-host-bypass-happy.md)

検出するケース：

- `\` / `%5C` は拒否しているが、`parse_url` のホストが無い値（`http:evil.example` など）を素通ししている

## 設計判断

### なぜ midstream?

コード実装時のレビューとして最も効果的。upstream では具体的なコードがなく、downstream では修正コストが高い。

### なぜ major severity?

セキュリティ脆弱性は本番環境での事故に直結するため、高優先度で対応すべき。

### なぜ code_search dependency?

コンテキスト検索により、周辺コードの認証・認可実装を参照し、より正確な判断が可能。

## 改善履歴

- v0.1.0 (2025-12-29): 初版リリース（legacy 形式から移植）

## 関連スキル

- `typescript-strict`: 型安全性によるセキュリティ向上
- `logging-observability`: セキュリティイベントのロギング

## 参考資料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE - Common Weakness Enumeration](https://cwe.mitre.org/)
