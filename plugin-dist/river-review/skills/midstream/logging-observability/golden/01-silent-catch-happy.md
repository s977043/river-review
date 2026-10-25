# Expected Output: Silent Exception Catch

## Findings

- `src/services/user.ts:16`: 例外が握りつぶされています。障害時に原因追跡が困難になります。Fix: logger.error でエラーをログし、throw error で再送出するか、適切にハンドルしてください。
