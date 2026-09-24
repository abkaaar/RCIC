# Coding Standards (RCIC)

Commenting and structure conventions for this monorepo. Prefer clarity over volume.

## Goals

- A new contributor should understand **why** sync, physics, and camera code behave the way they do.
- Comments document intent, invariants, and trade-offs — not the next line of syntax.

## File headers

Every non-trivial module starts with a short block:

```ts
/**
 * PhysicsWorld — local Matter.js simulation that writes owned poses into Yjs.
 * Yjs remains the source of truth; this layer is best-effort and may lag remotes.
 */
```

## Section banners

Use section comments for distinct phases inside large classes (init, input, tick, reconcile):

```ts
// ---------- camera ----------
```

## Do comment

- Authority / ownership models (who may write what)
- Throttle intervals and why they exist
- Race mitigations (drag vs store, awareness debounce)
- Non-obvious coordinate spaces (world vs screen, object center)

## Do not comment

- Restating `x = x + 1`
- Obvious getters/setters
- TODOs without an owner or ISSUES.md entry

## Related

- Bug history: [ISSUES.md](./ISSUES.md)
