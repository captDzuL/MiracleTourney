# Player game scores and sortable Flashpeak leaderboard

Date: 13 September 2026  
Status: Approved design; implementation not started.

## Objective

Add a 0.0–10.0 player score for every individual game in a Flashpeak series, preserve those scores inside the existing `PlayerStat.stats` JSON, and make every public leaderboard parameter sortable. The stored data must support a later MVP of Tournament or all-time MVP calculation without implementing either award policy in this change.

## Persistence contract

No database migration or new table is required. `PlayerStat` remains unique by `matchId + playerId`. Its `stats` JSON stores one ordered score array for the individual games represented by that match:

```json
{
  "scores": [7.6, 8.1, 9.1],
  "goal": 3,
  "assist": 4,
  "passing": 28,
  "defense": 12
}
```

The array is positional: its first entry belongs to Game 1, the second to Game 2, and so on. A BO1 match therefore stores a one-item array. A `null` entry means that the player did not play or was not rated in that game, for example `"scores": [null, 8.1, 9.1]`. Empty form controls persist as `null`, never as zero.

Every numeric score must be finite, between 0.0 and 10.0 inclusive, and have at most one decimal place. The array length must equal the number of completed `MatchGame` rows. A legacy completed BO1 match without a `MatchGame` row exposes exactly one score slot. No other missing game-result state may be guessed by the statistics form.

`goal`, `assist`, `passing`, and `defense` are the canonical Flashpeak numeric statistics going forward. New forms no longer accept `blocks` or `tackles`. Historical JSON is retained without destructive cleanup. Per historical row, a valid canonical `goal` or `assist` takes precedence; otherwise the reader falls back to legacy `goals` or `assists`. The aliases are never added together, preventing double counting. Historical `blocks` and `tackles` are not converted into the new organizer-supplied `defense` value.

The application boundary must parse Prisma JSON into a Flashpeak stat payload that explicitly permits `scores: Array<number | null>`. The existing generic numeric-stat merge must not receive the score array; score aggregation has its own validated path.

## Submission and approval

Player game scores follow the existing statistics workflow:

- Captains can submit a score for each player in each recorded game alongside the other Flashpeak statistics.
- Organizer/admin editors can enter or amend the same values directly.
- Captain submissions remain pending and have no public effect until approved.
- Approval persists the score array into `PlayerStat.stats` through the same path as the other approved statistics.
- Rejecting or replacing a pending submission must not erase previously approved values.

The input UI groups scores by Game 1, Game 2, and subsequent games from the match result. Each player/game score can be left blank when the player did not participate. Inputs use a numeric control with `min=0`, `max=10`, and `step=0.1`, plus server-side validation using the same constraints. Invalid arrays are rejected as a whole; partial writes are not allowed.

## Aggregation

For each player across the selected event:

- **Game** is the number of valid numeric score entries across all approved `PlayerStat` rows, not the number of series or the positional array length.
- **Skor** is the arithmetic mean of all valid per-game scores, displayed with one decimal place.
- **Gol**, **Assist**, **Umpan**, and **Defense** are the sums of their canonical numeric values across approved rows.
- A player with approved statistics but no valid game score displays an em dash for Skor and zero games. Such a player sorts below scored players when ordering by Skor.

Aggregation must not sum score averages. It concatenates validated per-game values first and calculates one average from the complete set. This avoids weighting a BO1 and BO5 series equally.

## Public leaderboard ordering

The public table exposes these columns in this order: Rank, Player, Position, Game, Skor, Gol, Assist, Umpan, Defense.

Game, Skor, Gol, Assist, Umpan, and Defense are interactive column headers:

- First activation sorts the selected parameter descending.
- Activating the same header toggles ascending and descending.
- Activating a different header begins in descending order.
- The active header shows a directional indicator and exposes `aria-sort="ascending"` or `aria-sort="descending"`.
- Sorting applies after search/team/position filtering so the visible row order always matches the active header.
- Equal values use player nickname A–Z as the stable final tie-breaker.

The rank numbers are recalculated for the current ordering rather than preserving the rank from a different metric. On narrow screens, the table remains horizontally scrollable and sortable headers retain usable keyboard and touch targets.

The default ordering is Skor descending, then Game descending, then nickname A–Z. Leader cards above the table follow the same active ordering and metric rather than maintaining a separate ranking.

## MVP boundary

This change records and aggregates the evidence needed for awards but does not automatically choose an MVP. A later award rule can use average score plus an eligibility threshold such as a minimum number of games. Keeping that policy separate prevents a one-game high score or an unapproved statistic from silently becoming an official award.

## Mockup alignment

The connected V3 mockup leaderboard will use the same columns, default ordering, sorting interactions, labels, score precision, and missing-score treatment. The Finished event page continues to link its individual awards to the final leaderboard and certificate previews.

## Verification

Automated tests must cover:

- valid boundary scores 0.0 and 10.0, one-decimal values, nullable non-participation slots, and BO1/BO3/BO5 arrays;
- rejection of negative, over-10, non-finite, over-precision, overlong, and malformed score values;
- captain pending/rejected submissions not affecting public aggregation;
- approved and organizer-entered scores producing the same stored shape;
- arithmetic mean across differently sized series;
- legacy singular/plural goal and assist aliases without counting `blocks` or `tackles` as Defense;
- descending and ascending ordering for all six sortable parameters;
- deterministic nickname tie-breaking, empty results, and missing scores;
- keyboard-accessible sortable headers and responsive table overflow;
- connected mockup behavior in Ongoing and Finished phases.
