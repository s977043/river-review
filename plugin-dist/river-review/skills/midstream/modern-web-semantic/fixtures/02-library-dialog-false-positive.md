# Fixture 02 — Library Dialog (False-Positive Guard)

## Description

A wrapper around an existing library component (`@radix-ui/react-dialog`). The
diff only changes the open trigger label. The skill should **not** flag this:
the library boundary guard applies (suggesting `<dialog>` would force a
framework swap, which is out of scope).

## Input Diff

```diff
diff --git a/src/components/SettingsDialog.tsx b/src/components/SettingsDialog.tsx
@@ -5,8 +5,8 @@ import * as Dialog from '@radix-ui/react-dialog';

 export function SettingsDialog() {
   return (
     <Dialog.Root>
-      <Dialog.Trigger>Open</Dialog.Trigger>
+      <Dialog.Trigger>Settings</Dialog.Trigger>
       <Dialog.Portal>
         <Dialog.Content>...</Dialog.Content>
       </Dialog.Portal>
```

## Expected Behavior

- No finding. The skill should respond "No findings" and reference the
  library-component false-positive guard.
- If the skill produces a finding here, that is a false-positive regression.
