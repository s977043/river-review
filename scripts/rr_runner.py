#!/usr/bin/env python3
"""構造化されたレビュー出力を組み立てる軽量 Runner プロトタイプ。"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Iterable
from uuid import uuid4

if importlib.util.find_spec("jsonschema") is None:  # pragma: no cover - 依存の事前チェック
  print("jsonschema が必要です。`pip install jsonschema` を実行してください。", file=sys.stderr)
  sys.exit(1)

from jsonschema import Draft202012Validator, RefResolver

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_SCHEMA_PATH = ROOT / "schemas" / "output.schema.json"
REVIEW_COVERAGE_SCHEMA_PATH = ROOT / "schemas" / "review-coverage.schema.json"
DEFAULT_ARTIFACT_PATH = ROOT / "artifacts" / "river-review-output.json"
VALID_PHASES = {"upstream", "midstream", "downstream"}


class RiverbedMemory:
  """Riverbed Memory のインターフェース (v1 用の空実装)。"""

  def load_context(self) -> dict | None:  # pragma: no cover - まだ無効化
    """以前のレビュー結果をロードする。現時点では no-op。"""
    return None

  def persist(self, payload: dict) -> None:  # pragma: no cover - まだ無効化
    """レビュー結果を保存する。現時点では no-op。"""


class NullRiverbedMemory(RiverbedMemory):
  """明示的に何もしないメモリ実装。"""

  pass


def load_schema_validator(path: Path) -> Draft202012Validator:
  """JSON Schema をローカル参照込みで読み込み、バリデータを返す。"""
  schema = json.loads(path.read_text(encoding="utf-8"))
  schema_store: dict[str, dict] = {}

  # output.schema.json は Review Coverage の詳細契約を $id 参照する。
  # Runner は offline でも動作する必要があるため、対応する schema を
  # ローカル store に明示登録して remote fetch を発生させない。
  if REVIEW_COVERAGE_SCHEMA_PATH.exists():
    review_coverage_schema = json.loads(REVIEW_COVERAGE_SCHEMA_PATH.read_text(encoding="utf-8"))
    schema_id = review_coverage_schema.get("$id")
    if schema_id:
      schema_store[str(schema_id)] = review_coverage_schema

  resolver = RefResolver.from_schema(schema, store=schema_store)
  return Draft202012Validator(schema, resolver=resolver)


def normalize_issue(raw_issue: dict, default_phase: str | None = None) -> dict:
  """LLM からの素の出力をスキーマ準拠の辞書に整形する。"""
  rule_id = str(raw_issue.get("ruleId", "")).strip()
  title = str(raw_issue.get("title", "")).strip()
  message = str(raw_issue.get("message", "")).strip()
  severity = str(raw_issue.get("severity", "")).strip().lower() or "info"
  phase = str(raw_issue.get("phase") or default_phase or "").strip().lower()
  file_path = str(raw_issue.get("file", "")).strip()

  if not rule_id:
    raise ValueError("ruleId が空です")
  if not title:
    raise ValueError("title が空です")
  if not message:
    raise ValueError("message が空です")
  if severity not in {"info", "minor", "major", "critical"}:
    raise ValueError(f"severity '{severity}' は許可されていません")
  if phase not in VALID_PHASES:
    raise ValueError(f"phase '{phase}' は {VALID_PHASES} のいずれかである必要があります")
  if not file_path:
    raise ValueError("file が空です")

  normalized = {
    "id": raw_issue.get("id") or f"issue-{uuid4()}",
    "ruleId": rule_id,
    "title": title,
    "message": message,
    "severity": severity,
    "phase": phase,
    "file": file_path,
  }

  if "line" in raw_issue and raw_issue["line"] is not None:
    try:
      normalized["line"] = int(raw_issue["line"])
    except (TypeError, ValueError) as exc:  # pragma: no cover - ガードのみ
      raise ValueError("line は整数である必要があります") from exc
  if raw_issue.get("suggestion"):
    normalized["suggestion"] = str(raw_issue["suggestion"]).strip()

  return normalized


def build_summary(issues: Iterable[dict]) -> dict:
  """severity / phase ごとの件数を集計する。"""
  severity_counts = {"info": 0, "minor": 0, "major": 0, "critical": 0}
  phase_counts = {"upstream": 0, "midstream": 0, "downstream": 0}

  for issue in issues:
    severity_counts[issue["severity"]] += 1
    phase_counts[issue["phase"]] += 1

  return {
    "issueCountBySeverity": severity_counts,
    "issueCountByPhase": phase_counts,
  }


def build_review_output(raw_issues: list[dict], default_phase: str | None = None) -> dict:
  """出力スキーマに沿ったレビュー結果を構築する。"""
  normalized_issues = [normalize_issue(issue, default_phase=default_phase) for issue in raw_issues]
  summary = build_summary(normalized_issues)
  return {"issues": normalized_issues, "summary": summary}


def parse_llm_output(path: Path) -> list[dict]:
  """LLM の JSON 出力を読み込み、issues 配列を返す。"""
  payload = json.loads(path.read_text(encoding="utf-8"))
  if isinstance(payload, dict) and "issues" in payload:
    if not isinstance(payload["issues"], list):
      raise ValueError("issues は配列である必要があります")
    return payload["issues"]
  if isinstance(payload, list):
    return payload
  raise ValueError("LLM 出力は配列、または issues キーを持つオブジェクトである必要があります")


def write_artifact(output: dict, path: Path) -> None:
  """成果物ディレクトリを作成し、JSON を書き出す。"""
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
  parser = argparse.ArgumentParser(description="River Reviewer Runner (structured output)")
  parser.add_argument("--input", required=True, help="LLM からの構造化出力 JSON パス")
  parser.add_argument("--output", default=str(DEFAULT_ARTIFACT_PATH), help="出力先 JSON パス")
  parser.add_argument("--phase", choices=sorted(VALID_PHASES), help="phase が欠けている場合のデフォルト値")
  args = parser.parse_args()

  validator = load_schema_validator(OUTPUT_SCHEMA_PATH)
  raw_issues = parse_llm_output(Path(args.input))

  memory = NullRiverbedMemory()
  _ = memory.load_context()  # 将来のメモリ統合に備えた no-op 呼び出し

  try:
    review_output = build_review_output(raw_issues, default_phase=args.phase)
  except ValueError as exc:
    print(f"入力をスキーマに整形できませんでした: {exc}", file=sys.stderr)
    return 1

  errors = sorted({err.message for err in validator.iter_errors(review_output)})
  if errors:
    print("出力がスキーマに合致しません:", file=sys.stderr)
    for err in errors:
      print(f"- {err}", file=sys.stderr)
    return 1

  write_artifact(review_output, Path(args.output))
  memory.persist(review_output)
  print(f"Structured output written to {args.output}")
  return 0


if __name__ == "__main__":
  sys.exit(main())
