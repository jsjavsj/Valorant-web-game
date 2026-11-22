# Pumpworks arena blockout

This is the original flood-control station from the [gameplay specification](gameplay-spec.md). All dimensions are initial playtest choices. The shared source in `packages/shared/src/pumpworks-blockout.ts` defines the geometry in meters with Y up.

Attackers spawn south of the pump hall. The west approach is a low service tunnel with 1.4 m of clearance. The east approach climbs maintenance stairs to a 1.08 m catwalk and descends toward the rear of the hall. Defenders approach from the north service corridor. The pump bank provides hard cover near the relay.

The movement suite drives the real character capsule from each spawn along all three routes and into relay range. The catwalk test also checks the achieved height. The published practice arena continues to use its current geometry. Open the courtyard from the home page or use `?map=courtyard` to walk the layout locally. The overhead button shows the full blockout. The preview renders the shared collider geometry with original sandstone, flagstone, and floodgate details. Multiplayer room integration and objective interactions remain follow-up work.
