# Expected Output: False Positive Avoidance

No security findings.

**Rationale:** The changes are in a test file (`tests/auth.test.ts`) and contain mock/dummy data for testing purposes. Hardcoded test credentials are expected and acceptable in test contexts when they are clearly not production secrets.

**Note:** If this were production code, the `apiKey` and `password` values would require using environment variables or a secrets management system.
