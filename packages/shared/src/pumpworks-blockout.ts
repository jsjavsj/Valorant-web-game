import type { ArenaBox } from "./movement.js";

// Centers and dimensions are in meters, with +Y up. These boxes also define the visual blockout.
const maintenanceStairs: ArenaBox[] = [];
for (let index = 0; index < 5; index++) {
  const height = (index + 1) * 0.18;
  maintenanceStairs.push(
    { name: `south maintenance step ${index + 1}`, center: [5, height / 2, 4.5 - index],
      size: [2.4, height, 1] },
    { name: `north maintenance step ${index + 1}`, center: [5, height / 2, -7.5 + index],
      size: [2.4, height, 1] },
  );
}

const boxes: readonly ArenaBox[] = [
  { name: "station floor", center: [0, -0.15, 0], size: [22, 0.3, 24] },
  { name: "north perimeter", center: [0, 1.6, -12], size: [22, 3.2, 0.3] },
  { name: "south perimeter", center: [0, 1.6, 12], size: [22, 3.2, 0.3] },
  { name: "west perimeter", center: [-11, 1.6, 0], size: [0.3, 3.2, 24] },
  { name: "east perimeter", center: [11, 1.6, 0], size: [0.3, 3.2, 24] },
  { name: "south bulkhead", center: [0, 1.4, 3], size: [7.2, 2.8, 0.4] },
  { name: "service tunnel west wall", center: [-6.2, 0.8, 2.5], size: [0.25, 1.6, 5] },
  { name: "service tunnel east wall", center: [-3.8, 0.8, 2.5], size: [0.25, 1.6, 5] },
  { name: "service tunnel roof", center: [-5, 1.55, 2.5], size: [2.65, 0.3, 5] },
  { name: "maintenance catwalk", center: [5, 0.54, -1.5], size: [2.4, 1.08, 3] },
  ...maintenanceStairs,
  { name: "pump bank", center: [0, 0.75, -4.6], size: [2.8, 1.5, 1.5] },
  { name: "rear corridor west wall", center: [-2.5, 1.2, -8.5], size: [0.3, 2.4, 4] },
  { name: "rear corridor east wall", center: [2.5, 1.2, -8.5], size: [0.3, 2.4, 4] },
];

export const PUMPWORKS_BLOCKOUT = {
  boxes,
  spawns: {
    attackers: { x: 0, y: 0.04, z: 9 },
    defenders: { x: 0, y: 0.04, z: -10.5 },
  },
  relay: { x: 0, y: 0, z: -1.75, radius: 0.85 },
  callouts: {
    serviceTunnel: { x: -5, y: 0, z: 2.5 },
    maintenanceCatwalk: { x: 5, y: 1.08, z: -1.5 },
    pumpHall: { x: 0, y: 0, z: -1.75 },
    rearCorridor: { x: 0, y: 0, z: -8.5 },
  },
} as const;
