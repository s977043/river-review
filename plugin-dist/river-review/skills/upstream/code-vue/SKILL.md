---
id: 'code-vue'
name: Component Test Scaffold (Vue.js)
description: Generate Vue.js component test skeletons (Vue Test Utils) from specifications.
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*.md'
  - 'specs/**/*.md'
tags: [review-support, unit-test, tdd, vue, vitest, vue-test-utils]
severity: major
inputContext: [fullFile]
outputKind: [tests]
modelHint: high-accuracy
---

## Pattern declaration

Primary pattern: Generator
Secondary patterns: Inversion
Why: 仕様書からVue.jsコンポーネントテストの足場を生成するジェネレーターであり、仕様の抜けをテスト観点から逆照射する。

## Role

あなたは熟練したVue.js開発者です。
仕様書で定義されたUI/UX要件を満たすための「コンポーネントテストのスケルトンコード（Vue Test Utils）」を作成してください。

## Non-goals / 扱わないこと

- 実装ロジックや最適化方針は指示しない。
- E2E/統合テストの網羅は対象外で、コンポーネント単位の足場に限定する。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に仕様書（`docs/**/*.md` または `specs/**/*.md`）が含まれている
- [ ] 仕様書にVue.jsコンポーネントに関する記述がある
- [ ] inputContextにfullFileが含まれている

ゲート不成立時の出力: `NO_REVIEW: code-vue — 対象となるVue.jsコンポーネント仕様が差分に含まれていない`

## False-positive guards / 抑制条件

- 仕様に記載のない要件を推測で追加しない。
- 対象外と明記された領域（例: 外部API連携の実装詳細）への指摘は行わない。

## Output Format

TypeScript/JavaScript のコードブロック。
`mount` または `shallowMount` を使用したテストケースを作成します。
`describe` ブロックで構成し、各テストケース (`it`) 内に `// TODO` で検証ステップを記述してください。

## Example

```typescript
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import UserProfile from '@/components/UserProfile.vue';

describe('UserProfile.vue', () => {
  it('renders user name when passed via props', () => {
    // TODO: Arrange (mount component with props)
    // const wrapper = mount(UserProfile, { props: { name: 'Alice' } })
    // TODO: Assert text content
    // expect(wrapper.text()).toContain('Alice')
  });

  it('emits "update" event on button click', async () => {
    // TODO: Arrange & Act (find button and trigger click)
    // await wrapper.find('button').trigger('click')
    // TODO: Assert event emission
    // expect(wrapper.emitted()).toHaveProperty('update')
  });
});
```

## Constraints

- テストランナーは **Vitest** を想定してください（Jestの場合はその旨をコメントで補足）。
- コンポーネントの `props`、`slots`、`emit` イベントの検証を重点的に洗い出してください。
- 非同期更新（`nextTick` や `await trigger`）が必要な操作については適切な `async/await` 構文を使用してください。
