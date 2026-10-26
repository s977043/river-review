# Expected Output: Immediate Reduce and Release

NO_ISSUES

The large data (`rawText`, parsed documents, `entries`) is reduced into a compact `Map` inside
the function and no closure or returned object captures the enclosing scope. The large locals
become unreachable once the function returns, so nothing is retained and no finding is emitted.
