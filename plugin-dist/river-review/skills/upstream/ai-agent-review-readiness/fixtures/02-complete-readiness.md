# Task: Implement user authentication

We'll use Claude Code to implement the auth module. This is an AI-assisted task.

## Success criteria

- Login endpoint returns JWT on valid credentials
- Invalid credentials return 401 with no token leakage
- Token expiry is enforced at 24h

## Non-goals

- OAuth/SSO support (tracked in #456)
- Rate limiting (separate task)

## Required context

- Architecture: see docs/architecture/auth-design.md
- Security requirements: see docs/security/requirements.md
- API contract: see openapi/auth.yaml

## Review perspectives

- Security: token storage, expiry handling, brute force protection
- Correctness: edge cases for expired/invalid tokens
- Testability: unit + integration coverage

## Review loop

1. Claude Code implements → self-reviews against this spec
2. Human reviews diff with security lens (required — auth is a judgment boundary)
3. Revise based on review

## Human approval required

This task touches authentication. Human review and explicit approval are required before merge.

## Feedback capture

Review findings will be recorded in `docs/memory/auth-implementation-review.md` and promoted to a reusable skill if a recurring pattern is identified.

<!-- expected:
findings: []
reason: 5 つの readiness 条件（成功基準・コンテキスト参照・レビューループ・人間承認・フィードバック記録）がすべて明示されている
-->
