import { expect, test } from "@playwright/test";
import { sampleRemotePose } from "../../apps/client/src/remote-pose";

type Player = Parameters<typeof sampleRemotePose>[2];

test("render pose and shot tick switch together when a moving target crouches", () => {
  const standing: Player = {
    id: "target", team: "teal", x: 0, y: 0, z: 5, crouched: false, grounded: true,
    verticalSpeed: 0, eyeHeight: 1.61, spawnTick: 0, stanceChangedTick: 0,
    lastAppliedInputSeq: 0, health: 100, alive: true, ammo: 8, reloading: false,
  };
  const before = { tick: 30, players: [standing] };
  const crouched = { ...standing, z: 4.75, crouched: true, stanceChangedTick: 32 };
  const after = { tick: 33, players: [crouched] };
  expect(sampleRemotePose(after, before, crouched, 0)).toEqual({
    x: 0, y: 0, z: 4.75, crouched: true, tick: 33,
  });

  const stillCrouched = { ...crouched, z: 4.5 };
  expect(sampleRemotePose({ tick: 36, players: [stillCrouched] }, after, stillCrouched, 25))
    .toMatchObject({ z: 4.625, crouched: true, tick: 35 });

  const stoodAgain = { ...standing, z: 4.75, stanceChangedTick: 33 };
  expect(sampleRemotePose({ tick: 33, players: [stoodAgain] }, before, stoodAgain, 0))
    .toMatchObject({ z: 4.75, crouched: false, tick: 33 });
});
