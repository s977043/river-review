# Expected Output: Debug Output Redacted At Storage Site (Canary)

NO_ISSUES

The new debug output path (`debug.rawProviderResponse`) applies `redactSecrets`
at the storage site, matching the masking already applied to `parsed` via
`redacted`. No unmasked-secret exposure path is introduced.
