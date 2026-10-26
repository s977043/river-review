# Expected Output: SQL Injection Detection

**Finding:** SQL injection vulnerability in user lookup query

**Evidence:** Line 13: `const user = await db.query(\`SELECT \* FROM users WHERE id = ${id}\`);`

**Impact:** Attacker could execute arbitrary SQL commands by manipulating the id parameter. This could lead to unauthorized data access, data manipulation, or complete database compromise.

**Fix:** Use parameterized queries to safely handle user input:

```typescript
const user = await db.query('SELECT * FROM users WHERE id = ?', [id]);
```

**Severity:** major

**Confidence:** high
