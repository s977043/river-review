---
id: output-format-html-en
title: HTML Output Format (Self-contained Report)
description: River Review HTML output format and its per-command support matrix.
---

River Review emits a self-contained HTML report when you pass `--output html` (CLI) or `output_format: html` (GitHub Action). The CSS is inlined in a `<style>` block and no external stylesheet or script is loaded, so the file can be stored as a CI artifact and opened directly in a browser.

## Supported commands

The CLI accepts `text|markdown|json|yaml|html` for `--output` globally, but only a few commands actually render `html`.

| Command                                                                                            | `--output html`  | Produces                                                          |
| -------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------- |
| `river run <path>`                                                                                 | Supported        | Review report (decision banner, score, findings, risk assessment) |
| `river runs diff <id1> <id2> [<id3>...]`                                                           | Supported        | Loop dashboard (loop signal, churn, oscillation timeline)         |
| `river review plan` / `river review exec`                                                          | Rejected, exit 3 | Use `json` or `markdown`                                          |
| `river evolve aggregate` / `river evolve replay` / `river evolve verify-replay`                    | Rejected, exit 1 | Use `text` or `json`                                              |
| `river skills <path>`                                                                              | Rejected, exit 1 | Use `text`, `markdown`, or `json`                                 |
| Everything else (`river review route`, `river runs list`, `river runs digest`, `river promote`, …) | Ignored          | Falls back to that command's default output                       |

The rejecting commands print:

```text
$ river review plan --output html
Error: Unsupported output format "html" for river review. Expected: json | markdown (text not yet implemented).

$ river evolve aggregate --output html
Unsupported --output for evolve aggregate: html. Use: text | json

$ river skills . --output html
Unsupported --output for skills: html. Use: text | markdown | json
```

`river skills` used to accept `yaml` and `html` and return JSON regardless (#1705). Rejecting them is the fix for that declaration mismatch, so a caller that passed `yaml` to get JSON must pass `json` instead.

## CLI

River Review is not published to npm, so the CLI is run inside the repository with `npm run river -- ...`.

```bash
npm run --silent river -- run . --output html > review-report.html
```

The `river run` header (a few lines starting with `River Review (local)`) goes to stderr for every format other than `text` (#1695). Stdout for `html` starts at `<!DOCTYPE html>` and ends at `</html>`, so redirecting it yields a valid HTML file directly.

`--silent` is needed only to suppress the `npm run` banner (`> river-review@x.y.z river`). npm writes that banner to stdout itself and River Review cannot control it. Invoking the CLI directly needs no flag:

```bash
./src/cli.mjs run . --output html > review-report.html
```

The loop dashboard is generated from two or more stored run records (`.river/runs/`). Oscillation detection needs three or more run ids; with exactly two the oscillation timeline is empty. Its stdout is likewise HTML only.

```bash
npm run --silent river -- runs diff <run-id-1> <run-id-2> --output html > loop-dashboard.html
```

## GitHub Action

```yaml
- uses: s977043/river-review/runners/github-action@v1.22.0
  with:
    output_format: html
```

The action runs `river run` and posts its stdout as the PR comment body. GitHub strips `<style>` and similar tags from comments, so an HTML document does not render as intended there. Set `comment: false` when using `html` and consume the output from the job log or an artifact instead.

## Sample output (review report)

Structure of the document produced by `formatHtmlOutput` (the inline CSS is elided).

```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>River Review Report — midstream</title>
    <style>
      /* inline CSS (elided) */
    </style>
  </head>
  <body>
    <h1>River Review Report</h1>
    <p class="meta">
      Phase: <strong>midstream</strong> &nbsp;|&nbsp; Timestamp:
      <strong>2026-04-18T00:00:00Z</strong>
    </p>
    <div class="banner" style="background: #fff8e1; border-color: #f9a825">
      ! Human Review Recommended
    </div>
    <h2>Summary</h2>
    <div class="counts">
      <span class="count-chip" style="background: #d32f2f">critical: 0</span>
      <span class="count-chip" style="background: #e65100">major: 1</span>
      <span class="count-chip" style="background: #f9a825">minor: 0</span>
      <span class="count-chip" style="background: #1565c0">info: 0</span>
    </div>
    <h2>Score</h2>
    <div class="overall-wrap"><span class="overall">96/100</span></div>
    <table>
      <tr>
        <th>Axis</th>
        <th>Score</th>
        <th style="width: 200px">Bar</th>
      </tr>
      <tr>
        <td>パフォーマンス</td>
        <td style="text-align: right">80</td>
        <td>
          <div class="score-bg"><div class="score-bar" style="width: 80%"></div></div>
        </td>
      </tr>
    </table>
    <h2>Findings</h2>
    <table>
      <tr>
        <th>Severity</th>
        <th>File:Line</th>
        <th>Title</th>
        <th>Message</th>
        <th>Suggestion</th>
      </tr>
      <tr>
        <td><span class="sev" style="background: #e65100">major</span></td>
        <td><code>src/Repository/OrderRepository.php:128</code></td>
        <td>N+1 query in loop</td>
        <td><pre>Eager load relations</pre></td>
        <td><pre>Use with()</pre></td>
      </tr>
    </table>
  </body>
</html>
```

Sections appear in this order:

- Header: `phase` and `timestamp`
- Decision banner: colour-coded `auto-approve` / `human-review-recommended` / `human-review-required`
- Summary: one count chip per severity
- Score: overall plus the five axis bars (axis labels are Japanese)
- Findings: a table of severity, `file:line`, title, message, and suggestion (or a "no findings" line)
- Risk Assessment: present only when the plan carries `riskAssessment`

## Sample output (loop dashboard)

`river runs diff --output html` calls `formatLoopDashboardHtml`, whose sections differ from the review report:

- Header: number of runs and the chain of run ids
- `suggestedLoopSignal` banner: `CONVERGED` / `REVISE_REQUIRED` / `ESCALATE_HUMAN` / `STOP_OSCILLATED` / `NO_SIGNAL`
- Churn: new / resolved / persisting / oscillated count chips
- Oscillation timeline: `●` (present) and `○` (absent) per finding across runs
- New findings / Resolved findings: severity, file, and title

## Notes

- **Self-contained**: CSS is inlined and nothing external is referenced, so the single file can be shared or archived as-is.
- **HTML escaping**: every finding-derived string (file, title, message, suggestion, run id) is escaped, so a `<script>` tag in the reviewed code does not execute when the report is opened.
- **Scores are derived**: the overall and per-axis scores come from the same deterministic scoring engine as the YAML and JSON output, not from an LLM judgement. Do not decide a merge on them alone — see the scoring model in [YAML Output Format](./output-format-yaml.en.md).
- **Japanese is hard-coded**: `<html lang="ja">` and the Japanese axis labels are fixed and are not switched by the review-language setting.

## Related

- `src/lib/output-formatters/html.mjs` — `formatHtmlOutput` / `formatLoopDashboardHtml` implementation
- [YAML Output Format](./output-format-yaml.en.md) — scoring model and verdict definitions
- [Stable interfaces](./stable-interfaces.en.md) — the CLI option list including `--output`
- [Loop convergence contract](./loop-convergence-contract.en.md) — definition of the `suggestedLoopSignal` values the dashboard renders
