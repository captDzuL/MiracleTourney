# Remove Vercel + Neon Footer Badge

## Goal

Remove the infrastructure-status badge labeled “Vercel + Neon ready” from the global application footer.

## Scope

- Remove only the shield icon and `nav.footer.ready` text from `AppShell`.
- Keep the footer container and the multi-game community tournament tagline unchanged.
- Remove imports and translation entries that become unused because of this change.
- Do not change navigation, authentication controls, locale switching, footer spacing, or other page content.

## Implementation

Update the existing global shell rather than hiding the badge with CSS. This keeps the rendered markup and bundle free of obsolete UI. Remove the now-unused English translation key; Indonesian already has no corresponding key.

## Verification

- Add a regression assertion that the shell no longer references the status badge or its icon.
- Confirm the footer tagline is still rendered.
- Run the focused test, type check, and relevant project test suite.

