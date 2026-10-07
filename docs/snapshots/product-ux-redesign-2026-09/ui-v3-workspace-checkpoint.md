# UI v3 — wizard approval and draft workspace proposal

Recorded: 5 September 2026.

## Decision status

- User is satisfied with the contextual event-creation mockup. Treat it as the accepted visual and interaction reference for the creation flow, not authorization to ship production changes.
- User requested the next mockup: Event Workspace / Ringkasan for an event that is still a draft. The workspace proposal is awaiting review.
- Preserve existing tournament, ownership, payment, and roster rules. This phase is UI brainstorming with standalone local prototypes.

## Accepted creation reference

`public/miracle-organizer-v3-contextual-mockup.html`

- Five-step wizard with live public preview remains the creation model.
- Contextual guidance adds visible help and expandable examples inside the existing wizard.
- Montserrat, dark default, organizer light/dark toggle, and a palette derived from the Miracle logo.
- Registration opening and closing dates/times each have visible placeholders, then display the entered values and selected timezone.
- Prize information and organizer contact are separate sections. Contact is emphasized and has a copy action.
- Logo and poster remain distinct. Footer copyright belongs to Miracle.

## Draft workspace proposal

`public/miracle-organizer-v3-workspace-mockup.html`

- Event name, Draft status, game, format, and capacity establish context.
- The main action identifies incomplete information and resumes the relevant wizard step.
- Readiness checklist groups identity, format/schedule, registration/fee, organizer contact, and prizes. Each group links to its actual editor fields.
- A side summary keeps the event start, venue/channel, registration opening/closing, and fee visible, including missing-value placeholders.
- Preview is available even while required information is incomplete.
- Review-link creation, viewing, and revocation are explicitly local simulations. The `.example` URL is not a functioning public review link.
- Tinjau & terbitkan opens the wizard's final simulated review after the displayed checklist is complete. No production event is published.
- Workspace, embedded wizard, and public preview share the existing prototype draft storage key. Existing saved sample data is retained.
- Navigation to participant, match, and result areas shows scope explanations; those screens have not been designed here.

## Verification and limits

Browser checks covered returning from the wizard, readiness updates, persistence across reload, preview without editor fields, simulated review creation/revocation, light mode, and mobile layout. A helper-script collision with the Draft badge and narrow datetime fields were corrected.

Mockup field checks are illustrative, not a finalized production validation contract. Public review authentication, revocation, server autosave, and publication gates still require implementation design and server enforcement.

## Next conversation

Review the draft Ringkasan mockup: whether the next action is obvious, the readiness checklist is useful, and the split between main work and supporting information feels right. After acceptance, continue with the registration-open state of the workspace using existing operational rules.
