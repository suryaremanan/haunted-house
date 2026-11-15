# HUI-S0: upstream composition harness

Spec: `.kiro/specs/house-ui-and-accessibility` task 1.1.

The House UI is a presentation layer over four upstream specs. Before it
composes them, this harness proves what it may rely on, and fails closed when
one of those facts stops being true.

## What it runs

`app/ui/scripts-tests/house-ui-upstream-contract.test.ts` (it lives beside the
other repo-script tests because Vitest resolves `vitest` and the UI sources from
`app/ui`; a test file under `spikes/` cannot resolve them).

```bash
cd app/ui
bunx vitest run scripts-tests/house-ui-upstream-contract
# after an intended upstream change, re-record the scrubbed fixture:
HUI_S0_RECORD=1 bunx vitest run scripts-tests/house-ui-upstream-contract
```

## What it proves

| Claim | How |
|---|---|
| Every seam exists | Static imports of the public seams of `mansion-lifecycle`, `seance-log-and-ghost-state`, `doors-and-guardrails` and `room-ghosts`. A missing module fails the import. |
| One owner per kind of state | A source scan of `app/ui/src/core`: exactly one file declares each of `foldGhostEvents`, `reduceGhostSnapshot`, `foldWorkflow`, `parseWorkflowProjection`, `deriveAuthority`, `authorizeCommand`, `authorizeRoomCommand`, `needsYou`, `joinRoomProjection`, `foldReplay`. A second owner fails. |
| The House UI core adds no authority | `house-registry.ts`, `house-projection.ts`, `motion-policy.ts` and `interruption-policy.ts` import only sibling core modules and contain no fold, command, transport, clock, timer, storage, DOM, or audio reference. |
| One Mansion identity | The Mansion name, `WorkflowProjection.mansionId`, `RoomGhosts.mansionId` and `GhostSnapshot.mansion_id` are one value; a projection or ghost of another Mansion is refused. |
| One decision selection | The House Projection's decisions are exactly `house-view.needsYou`; its only addition is a failed run the Room Ghosts answer offers to retry. |
| Mutation follows upstream gates | A room's `mutatingActionsEnabled` equals the Spec 5 gate of its joined projection. |
| No success before validation | A document the backend has not validated is never `valid`, and a working ghost is shown as working. |
| One replay fold | `foldLive` and `foldReplay` of `fixtures/replay/demo.jsonl` are equal, and a replayed workflow is read-only at the upstream gate. |

## Fixture

`spikes/fixtures/house-ui-upstream-contract.json` holds field names and type
categories of synthetic values only. No path, credential, digest, or recorded
content.

## Not covered here

- The Crew host hooks `useTheme`, `useNotify`, `useNavBadge` (HUI-S1) need an
  installed app page in a running dashboard.
- Rendered reflow at 320 CSS pixels and 200 percent text (HUI-S2) needs a
  browser runner.
- The backend half of each upstream contract is owned and tested by its own spec.
