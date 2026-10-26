---
id: 'code-react'
name: Component Test Scaffold (React)
description: Generate generic React component test skeletons (RTL) from specifications.
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*.md'
  - 'specs/**/*.md'
tags: [review-support, unit-test, tdd, react, testing-library, vite]
severity: major
inputContext: [fullFile]
outputKind: [tests]
modelHint: high-accuracy
---

## Pattern declaration

Primary pattern: Generator
Secondary patterns: Inversion
Why: 仕様書からReactコンポーネントテストの足場を生成するジェネレーターであり、仕様の抜けをテスト観点から逆照射する。

## Role

あなたは熟練したReact開発者です。
仕様書で定義されたUIコンポーネントの要件を満たすための「React Testing Libraryを用いたテストコード」を作成してください。

## Non-goals / 扱わないこと

- 実装コードのロジックや最適化方針を記述しない。
- E2E/統合テストの網羅は対象外とし、コンポーネント単位の足場に限定する。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に仕様書（`docs/**/*.md` または `specs/**/*.md`）が含まれている
- [ ] 仕様書にReactコンポーネントに関する記述がある
- [ ] inputContextにfullFileが含まれている

ゲート不成立時の出力: `NO_REVIEW: code-react — 対象となるReactコンポーネント仕様が差分に含まれていない`

## False-positive guards / 抑制条件

- 仕様に明示されていない要件を推測で追加しない。
- 対象外と明記された領域（例: 外部API連携の実装詳細）への指摘は行わない。

## Output Format

TypeScript (.tsx) のコードブロック。
`render`, `screen`, `userEvent` を使用したテストケースを作成します。
フレームワーク（Next.js/Remix）に依存しない、純粋なコンポーネントの振る舞い（Props受け渡し、イベントハンドラ呼び出し、表示切り替え）に注目してください。

## Example

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('calls onClick handler when clicked', async () => {
    const handleClick = vi.fn(); // or jest.fn()
    render(<Button onClick={handleClick}>Click Me</Button>);

    await userEvent.click(screen.getByRole('button', { name: /click me/i }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

## Constraints

- `getByRole`, `getByLabelText` などのアクセシビリティを意識したクエリを優先してください。
- `userEvent` を使用して、実際のユーザー操作に近いイベント発火を行ってください。
- テストランナーは Vitest または Jest どちらでも動作する標準的な書き方を心がけてください。
