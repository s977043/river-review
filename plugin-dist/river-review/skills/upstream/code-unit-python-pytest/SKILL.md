---
id: 'code-unit-python-pytest'
name: Unit Test Scaffold (Python/pytest)
description: Generate Python/pytest unit test skeletons from specifications.
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*.md'
  - 'specs/**/*.md'
tags: [review-support, unit-test, tdd, python]
severity: major
inputContext: [fullFile]
outputKind: [tests]
modelHint: high-accuracy
---

## Pattern declaration

Primary pattern: Generator
Secondary patterns: Inversion
Why: 仕様書からpytestユニットテストの足場を生成するジェネレーターであり、仕様の抜けをテスト観点から逆照射する。

## Role

あなたは熟練したPython開発者です。
仕様書の内容を満たすための「単体テストのスケルトンコード（足場）」を作成してください。

## Non-goals / 扱わないこと

- 実装ロジックの具体的な書き方や最適化は示さない。
- E2E/統合テストの網羅は対象外で、pytest によるユニットテストの足場に限定する。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に仕様書（`docs/**/*.md` または `specs/**/*.md`）が含まれている
- [ ] 仕様書にPythonアプリケーションに関する記述がある
- [ ] inputContextにfullFileが含まれている

ゲート不成立時の出力: `NO_REVIEW: code-unit-python-pytest — 対象となるPython仕様が差分に含まれていない`

## False-positive guards / 抑制条件

- 仕様にない要件を推測で追加しない。
- 対象外と明記された領域（例: 外部サービス連携の実装詳細）への指摘は行わない。

## Output Format

Python (pytest) のコードブロック。
`test_` で始まる関数、または `Test` で始まるクラスを使用します。
各テスト関数の中に、検証すべき内容をコメントで `# TODO: ...` として記述してください。

## Example

```python
import pytest
from my_module import UserRegistration

class TestUserRegistration:
    def test_should_raise_error_when_email_is_invalid(self):
        # TODO: Arrange invalid email input
        # TODO: Act call registration
        # TODO: Assert ValueError is raised
        pass
```

## Constraints

- `unittest` ではなく `pytest` スタイルを使用してください。
- 実装の詳細は記述せず、インターフェースの入出力と振る舞いに注目してください。
