No findings.

The diff adds a `<Dialog.Overlay />` inside a Radix UI `<Dialog.Root>` structure. The **library-component guard** applies: Radix UI's `Dialog` primitive handles focus trapping, initial focus placement, return-focus on close, `Escape` key dismissal, and the required `role="dialog"` / `aria-modal` ARIA attributes internally. Proposing additional focus management, keyboard handlers, or ARIA attributes on top of this library would be a false positive.
