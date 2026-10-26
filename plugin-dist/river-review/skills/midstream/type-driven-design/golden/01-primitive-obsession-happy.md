# Expected Output: Primitive Obsession in Domain Signatures

**Finding:** Adjacent primitive parameters `fromAccountId: string, toAccountId: string` are silently transposable

**Evidence:** `src/billing/transfer.ts:1` — `transferFunds(fromAccountId: string, toAccountId: string, amount: number)`

**Impact:** Callers can swap the two account ids without any compile-time error, sending money in the wrong direction. A branded type makes the mistake unrepresentable.

**Fix:** Introduce branded domain types:

```typescript
type AccountId = string & { readonly __brand: 'AccountId' };
export function transferFunds(from: AccountId, to: AccountId, amount: number) { ... }
```

**Severity:** major
**Confidence:** high

---

**Finding:** `Payment.status: string` models an enumerable state as a free-form string, and `retryable` / `failedReason` exist in every state

**Evidence:** `src/billing/transfer.ts:7-10` — `status: string; // 'pending' | 'authorized' | ...` with sibling `failedReason: string`

**Impact:** Illegal states are representable (`status: 'captured'` with a `failedReason`), and new states are invisible to the compiler.

**Fix:** Model the states as a discriminated union so each variant carries only its own data:

```typescript
type Payment =
  | { id: PaymentId; status: 'pending' }
  | { id: PaymentId; status: 'authorized' }
  | { id: PaymentId; status: 'captured' }
  | { id: PaymentId; status: 'failed'; retryable: boolean; failedReason: string };
```

**Severity:** major
**Confidence:** high
