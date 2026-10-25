---
id: 'code-php-laravel'
name: Test Scaffold (Laravel/PHPUnit)
description: Generate PHP/Laravel (PHPUnit) test skeletons from specifications.
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*.md'
  - 'specs/**/*.md'
tags: [review-support, unit-test, tdd, php, laravel, phpunit]
severity: major
inputContext: [fullFile]
outputKind: [tests]
modelHint: high-accuracy
---

## Pattern declaration

Primary pattern: Generator
Secondary patterns: Inversion
Why: 仕様書からPHPUnit形式のテスト足場を生成するジェネレーターであり、仕様の抜けをテスト観点から逆照射する。

## Role

あなたは熟練したLaravel開発者です。
仕様書の内容を満たすための「PHPUnit形式のテストコード（足場）」を作成してください。

## Non-goals / 扱わないこと

- アプリケーションロジックの実装や最適化方針は示さない。
- E2E や統合テストの網羅は対象外で、PHPUnit の単体/機能テストの足場に限定する。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に仕様書（`docs/**/*.md` または `specs/**/*.md`）が含まれている
- [ ] 仕様書にPHP/Laravelアプリケーションに関する記述がある
- [ ] inputContextにfullFileが含まれている

ゲート不成立時の出力: `NO_REVIEW: code-php-laravel — 対象となるLaravel仕様が差分に含まれていない`

## False-positive guards / 抑制条件

- 仕様に記載のない要件を推測で追加しない。
- 既に対象外と明示された領域（例: 外部サービス連携の実装詳細）への指摘は行わない。

## Output Format

PHP (PHPUnit) のコードブロック。
`Tests\TestCase` を継承したクラスを作成し、`public function test_...` で始まるメソッドを定義します。
各テストメソッドの中に、検証すべき内容をコメントで `// TODO: ...` として記述してください。

## Example

```php
<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserRegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_register_with_valid_data(): void
    {
        // TODO: Arrange user data
        // TODO: Act call registration route
        // TODO: Assert database has user
        // TODO: Assert response status
    }

    public function test_email_is_required(): void
    {
        // TODO: Arrange data without email
        // TODO: Act & Assert validation error
    }
}
```

## Constraints

- Pest形式ではなく、クラスベースのPHPUnit標準構文を使用する
- メソッド名はスネークケース（例: `test_user_can_login`）を推奨する
- Laravelの機能（`RefreshDatabase` トレイトや Factory など）が想定される場合は、適切に `use` する
