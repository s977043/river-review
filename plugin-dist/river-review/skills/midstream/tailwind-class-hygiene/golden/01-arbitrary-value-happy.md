# Expected Output: Arbitrary Value Overuse and Conflicting Utilities

**Finding:** スケールを迂回する任意値（`w-[437px]` `mt-[13px]`）と任意カラー直書き（`text-[#1a2b3c]` `bg-[#ffffff]`）の濫用、および同一要素での競合ユーティリティ（`px-2 px-4`）が混在している

**Evidence:** `src/components/Card.tsx` — `className="w-[437px] px-2 px-4 mt-[13px] text-[#1a2b3c]"` および `className="bg-[#ffffff]"`

**Impact:** 任意値はスペーシング/カラースケールを逸脱して一貫性を下げ、`px-2 px-4` は後勝ちで `px-2` が無効化され意図しない padding になる。任意カラーはトークンを迂回するためテーマ一括変更が効かない。

**Fix:** theme スケール/トークンへ寄せ、競合は片方を削除する:

```tsx
<div className="w-110 px-4 mt-3 text-slate-800">
  <p className="bg-white">content</p>
</div>
```

**Severity:** minor
**Confidence:** medium
