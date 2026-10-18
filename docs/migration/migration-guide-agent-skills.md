# Agent Skills 対応 移行ガイド (v0.8.0)

River Review v0.8.0 では、標準化されたレビュー体験を提供するため、Agent Skills 公式仕様への完全準拠を行いました。

## 主な変更点

1. **ディレクトリ構造の変更**:
   - `skills/` 直下に置かれていたスキルファイル群（フラット構成）に加え、標準化された `skills/agent-skills/` ディレクトリが導入されました。
   - 一般ユーザーは `skills/agent-skills/river-review/SKILL.md` を入口スキルとして使用することが推奨される。

2. **ルーティング機能の導入**:
   - `river-review` 入口スキルが導入され、レビュー依頼の内容に応じて専門スキルへ自動的にルーティングされる。
   - 例: 「セキュリティ」という言葉が含まれる場合 → `river-review-security` スキルへ

3. **バリデーションの厳格化**:
   - `npm run agent-skills:validate` コマンドが追加され、公式仕様（YAML Frontmatter, ファイル命名規則など）への準拠が CI/pre-commit でチェックされる。

## 開発者向け: 新しいスキルの追加方法

新しいスキルを追加する場合は、以下のテンプレートを使用してください:

```bash
# テンプレートから新しいスキルを作成
cp templates/SKILL.md.template skills/agent-skills/my-new-skill/SKILL.md
cp -r templates/references/ skills/agent-skills/my-new-skill/references/
```

- **SKILL.md**: スキルの定義（100行以内推奨）
- **references/**: チェックリストや詳細例（Progressive Disclosure）

## 既存スキルの移行

既存の `skills/*.md` ファイルは引き続き動作しますが、今後は `skills/agent-skills/` への移行を推奨します。移行手順は以下の通りです:

1. `skills/agent-skills/<skill-name>/` ディレクトリを作成
2. 既存ファイルを `SKILL.md` にリネームして移動
3. YAML Frontmatter を公式仕様に合わせて更新（`phase`, `applyTo` などのカスタムフィールドは `metadata` セクションへ移動）
4. 長い説明文は `references/` 以下の別ファイルに切り出し

## コマンドの変更

- **バリデーション**: `npm run agent-skills:validate`
- **スキル監査**: `node scripts/skills-audit.mjs`

詳細は [CONTRIBUTING.md](../../.github/CONTRIBUTING.md) を参照してください。
