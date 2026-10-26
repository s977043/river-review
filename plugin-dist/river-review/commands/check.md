---
description: 'Pre-review harness check: run lint/tests and summarize failures and risks'
---

対象プロジェクトに存在するチェックのみをこの順で実行して、失敗したら原因と修正案を出して：

1. lint（`package.json` に `lint` スクリプトがあれば `npm run lint`。なければプロジェクトの lint コマンドに読み替えるか省略する）
2. test（`package.json` に `test` スクリプトがあれば `npm test`。なければプロジェクトのテストコマンドに読み替えるか省略する）

> 注: このコマンドは Node プロジェクトの `npm run lint` / `npm test` を想定しています。スクリプトが無い場合は `Missing script` エラーにせず、該当コマンドへ読み替えてください。

成功したら、変更の要点とリスクを 3 点でまとめて：

- 後方互換性
- 性能への影響
- セキュリティ考慮
