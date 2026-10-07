# Competition graph boundary

Use `generateCompetitionGraph` from this directory's `index.ts`. It is a pure,
deterministic factory; the legacy engine remains unchanged. The four generator
modules are internal building steps and receive an owned graph accumulator.

Inputs use the validated v1 format config and explicit `{ id, seed }` teams.
Seeds must be unique and contiguous from 1 to team count, with 2–256 teams.
Input ordering does not change the graph. `slotCount` optionally reserves an
elimination capacity (at least team count, at most 256); the bracket rounds up
to a power of two. Round robin and groups use the actual team count.

Supply `hasOfficialResults` when generating from existing competition state.
Any official revision, including a draw or corrected result, must set it true.
The pure guard cannot query storage: the calling service must read this fact
and enforce it again inside its write transaction. This module does not persist
or overwrite matches and does not resolve official scores.

## Interpretation

- `matches` are in dependency order. `pending` includes unresolved participants;
  it does not mean ready or scheduled. No timestamps or public live state exist
  in this model.
- A `bye` node automatically advances its `advance` source; an `empty` node
  advances nobody. Neither consumes a playable match or produces a loser.
  Downstream sources bypass these nodes, including chained byes. Preserve the
  nodes for bracket display, but schedule only `pending` nodes.
- Match dependencies feed the exact home/away slot from a winner/loser. Their
  IDs are derived from the target match and slot. Group-rank dependencies are
  separate because they depend on resolved standings for an entire group,
  rather than a single match result. Resolve them only after qualification is
  authoritative, including any required tiebreak match.
- Round-robin rounds use circle pairing, omitting idle odd-field slots. The
  second leg reverses home and away and continues the round numbers. v1 has no
  round-robin best-of setting, so these matches use best-of one. Phase rules
  retain configured points and ordered tiebreakers for the standings service.
- Groups allocate seeds in a snake. Every group needs at least two teams and
  enough teams to fill its qualification cutline. Playoff seeds prioritize rank
  bands. Without rematch avoidance these bands alternate group direction;
  with avoidance enabled each band uses group order so complementary bracket
  seeds come from different groups for every supported v1 field size.
- Double elimination uses one grand final, with no bracket reset, matching the
  v1 config's single grand-final setting. The lower-final loser is third. A
  two-team competition has no third-place source. Single elimination creates
  the configured bronze match only when a semifinal can produce a loser.

IDs are structural within the event and are suitable for deterministic
regeneration before official results. A capacity or format change may change
the structure, so consumers must replace the pre-result graph as a whole.
