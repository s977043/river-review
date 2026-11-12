---
name: river-review
description: Review agent for River Review's capability pack. Runs your team's versioned review skills (the Skill Registry) as perspective-based reviewer roles and verifies findings against the diff. Use proactively after diffs. Enforce skills/ usage.
tools: Read, Grep, Glob, Bash
model: inherit
---

`<plugin root>/skills/agent-skills/river-review/SKILL.md` を読み込み、その手順に従ってレビューを実行する。すべての手順・ルーティング・verification・improvement loop はそのスキルが定義する。

`<plugin root>` は利用者のプロジェクトではなく River Review プラグインのルートを指す。パスは次の順で解決する。

1. `${CLAUDE_PLUGIN_ROOT}/skills/agent-skills/river-review/SKILL.md` を Read する。プラグインとして読み込まれていれば、この `${CLAUDE_PLUGIN_ROOT}` はエージェント本文の読み込み時に絶対パスへ置換されている（Claude Code 2.1.319 で実測）。Bash の環境変数 `$CLAUDE_PLUGIN_ROOT` は、メインセッションでもサブエージェントでも空になるため、こちらが主経路である。
2. 手順 1 の Read に失敗した、またはパスが絶対パスにならず `$` と `{` で始まる変数表記を含んだままのときは、Bash で `echo "$CLAUDE_PLUGIN_ROOT"` を実行し、出力された絶対パスを `<plugin root>` として Read する。
3. echo の出力が空、または echo が拒否・失敗したときにリポジトリのルートを `<plugin root>` として使ってよいのは、river-review リポジトリ内で動かす場合だけである。リポジトリ内かどうかは、`git rev-parse --show-toplevel` で得たリポジトリのルート `<root>`（サブディレクトリから起動してもルートを指す）を基準に判定する。`<root>/skills/agent-skills/river-review/SKILL.md` と `<root>/agents/river-review.md` の両方があり、かつ `<root>/package.json` の `name` が `river-review` であればリポジトリ内とみなす。同名のファイルを vendor した利用側リポジトリを内と誤判定しないため、`name` も条件に含める（例: Bash で `root="$(git rev-parse --show-toplevel)" && test -f "$root/skills/agent-skills/river-review/SKILL.md" && test -f "$root/agents/river-review.md" && grep -q '"name": "river-review"' "$root/package.json" && echo "$root"`）。このコマンドが失敗したとき（git リポジトリでない、`package.json` が無いなど）はリポジトリ外として扱う。リポジトリ内なら、出力された `<root>` を `<plugin root>` とする。
4. それでも SKILL.md を読めなければ、レビューに進まない。代替基準でのレビューもしない。「Skill Registry が未解決のためレビューを実行できない」と報告して止まる。報告には次を含める。
   - 試したパスと、それぞれが失敗した理由（置換されていない、Read が拒否された、ファイルが無いなど）
   - Read が作業ディレクトリ外として拒否された場合は、plugin root を `--add-dir <plugin root>` または `permissions.additionalDirectories` に追加して再実行する案内
   - 回避策として、依頼文で SKILL.md の絶対パス（例: `~/.claude/plugins/cache/<marketplace>/river-review/<version>/skills/agent-skills/river-review/SKILL.md`）を指定する方法
