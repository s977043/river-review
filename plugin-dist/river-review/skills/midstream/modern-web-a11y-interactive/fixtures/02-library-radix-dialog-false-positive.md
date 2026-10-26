# Fixture 02 — Library-provided dialog (False-Positive Guard)

## Description

Diff uses Radix UI's `<Dialog>` which provides focus management internally.
The skill must NOT propose adding focus traps or key handlers — the
library-component guard applies.

## Input Diff

```diff
diff --git a/src/components/SettingsDialog.tsx b/src/components/SettingsDialog.tsx
@@ -3,10 +3,11 @@ import * as Dialog from '@radix-ui/react-dialog';
 export function SettingsDialog() {
   return (
     <Dialog.Root>
       <Dialog.Trigger>Open Settings</Dialog.Trigger>
+      <Dialog.Overlay />
       <Dialog.Content>
         <Dialog.Title>Settings</Dialog.Title>
       </Dialog.Content>
     </Dialog.Root>
   );
 }
```

## Expected Behavior

- No finding. Library boundary guard applies; Radix Dialog handles focus,
  Esc, and ARIA roles internally.
- Output references the library-component guard explicitly.
