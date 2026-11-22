import { MOVEMENT_STEP } from "@pumpworks/shared";
import type { MatchPlayer, MatchSnapshot } from "@pumpworks/shared";

export function sampleRemotePose(
  latest: MatchSnapshot,
  previous: MatchSnapshot | undefined,
  player: MatchPlayer,
  elapsedMs: number,
) {
  const { x, y, z, crouched } = player;
  const current = { x, y, z, crouched, tick: latest.tick };
  if (!previous || previous.party?.started !== latest.party?.started) return current;
  const ticks = latest.tick - previous.tick;
  if (ticks <= 0 || ticks > 6) return current;
  const from = previous.players.find((entry) => entry.id === player.id);
  // A stance change is discrete. Render the whole newer pose and aim at that same tick.
  if (!from?.alive || from.spawnTick !== player.spawnTick || from.team !== player.team ||
      from.crouched !== crouched || player.stanceChangedTick > previous.tick) return current;

  const fraction = Math.min(1, Math.max(0, elapsedMs / (ticks * MOVEMENT_STEP * 1000)));
  return {
    x: from.x + (x - from.x) * fraction,
    y: from.y + (y - from.y) * fraction,
    z: from.z + (z - from.z) * fraction,
    crouched,
    tick: previous.tick + Math.round(ticks * fraction),
  };
}
