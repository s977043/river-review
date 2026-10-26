# Project-specific Review Rules Template / プロジェクト固有ルール テンプレート

<!--
このファイルにプロジェクト専用のレビュー方針を記載します。
ルールは River Review のプロンプトに自動で注入されます。
-->

## Architecture / アーキテクチャ方針

<!-- 例: Next.js App Router を使用し、サーバーコンポーネント優先 -->

## Coding Guidelines / コーディング規約

<!-- 例: TypeScript strict モード必須、eslint/prettier に準拠 -->

## Forbidden Patterns / 禁止パターン

<!-- 例: any の使用、直接的な localStorage アクセス、同期的な fs 呼び出し -->

## Recommended Libraries / 推奨ライブラリ

<!-- 例: HTTP クライアントは fetch/ky を使用、状態管理は Zustand/Recoil -->

## Security Requirements / セキュリティ要件

<!-- 例: 入力バリデーション必須、CSRF トークンチェック、SQL はプリペアドステートメント -->

## Performance Requirements / パフォーマンス要件

<!-- 例: SSR ページは LCP 2.5s 以内、不要な再レンダリング防止に memo/useMemo を検討 -->

## Testing Requirements / テスト要件

<!-- 例: 主要なユースケースは E2E テスト必須、サービス層はユニットテストを追加 -->

---

### Examples / 記入例

- Next.js: Prefer Server Components, avoid `pages/`, colocate data-fetching in React Server Actions.
- API: Ensure 4xx/5xx エラーハンドリングと型安全なレスポンススキーマ。
- Security: Do not log secrets; mask tokens; validate all external inputs with Zod.
