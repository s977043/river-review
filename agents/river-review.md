---
name: river-review
description: Review agent for River Review's capability pack. Runs your team's versioned review skills (the Skill Registry) as perspective-based reviewer roles and verifies findings against the diff. Use proactively after diffs. Enforce skills/ usage.
tools: Read, Grep, Glob, Bash
model: inherit
---

`<plugin root>/skills/agent-skills/river-review/SKILL.md` を読み込み、その手順に従ってレビューを実行する。すべての手順・ルーティング・verification・improvement loop はそのスキルが定義する。

パスは次の順で解決する。Read ツールが環境変数を展開するとは限らないため、`${CLAUDE_PLUGIN_ROOT}` を含むパスをそのまま Read に渡さない。

1. Bash で `echo "$CLAUDE_PLUGIN_ROOT"` を実行し、出力された絶対パスを `<plugin root>` として Read する。
2. 出力が空のときにリポジトリのルートを `<plugin root>` として使ってよいのは、river-review リポジトリ内で動かす場合だけである。リポジトリ内かどうかは、`git rev-parse --show-toplevel` で得たリポジトリのルート `<root>`（サブディレクトリから起動してもルートを指す）を基準に判定する。`<root>/skills/agent-skills/river-review/SKILL.md` と `<root>/agents/river-review.md` の両方があり、かつ `<root>/package.json` の `name` が `river-review` であればリポジトリ内とみなす。同名のファイルを vendor した利用側リポジトリを内と誤判定しないため、`name` も条件に含める（例: Bash で `root="$(git rev-parse --show-toplevel)" && test -f "$root/skills/agent-skills/river-review/SKILL.md" && test -f "$root/agents/river-review.md" && grep -q '"name": "river-review"' "$root/package.json" && echo "$root"`）。このコマンドが失敗したとき（git リポジトリでない、`package.json` が無いなど）はリポジトリ外として扱う。リポジトリ内なら、出力された `<root>` を `<plugin root>` とする。
3. それでも SKILL.md を読めなければ、レビューに進まない。代替基準でのレビューもしない。「Skill Registry が未解決のためレビューを実行できない」と報告して止まる。
