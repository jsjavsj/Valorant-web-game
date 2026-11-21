# Gameplay specification v0.1

Status: proposed baseline for the first playable browser build. Review against GitHub issue #2. All numerical values below are original prototype choices pending playtesting.

## First playable build

Two desktop browsers join a private room by code and play a complete 1v1 round in an original test arena. Both clients agree on positions, hits, health, elimination, and the round result. The host can add a basic bot when a second player is unavailable. Support 2v2 after the 1v1 flow works reliably.

## Match rules

| Rule | v0.1 baseline |
| --- | --- |
| Round flow | Ready → 15-second buy phase → 75-second active phase → result |
| Objective | Attackers activate one relay by holding Interact for 3 seconds. Defenders deactivate it by holding Interact for 5 seconds. An active relay resolves in 25 seconds and replaces the active-phase countdown. |
| Win conditions | Before activation, surviving attackers win on defender elimination. Defenders win on attacker elimination or active-phase timeout. After activation, defenders must deactivate the relay. Attackers win if the relay resolves or all defenders are eliminated. |
| Match format | Four regulation rounds with a side swap after two. First to three wins. At 2–2, play one deciding round. The server randomly assigns sides and resets both players to 600 credits and empty inventories before issuing their free sidearms. |
| Interaction | Releasing Interact, moving out of range, or being eliminated cancels progress. An attacker who is eliminated drops the relay device before activation. |
| Timing | The server resolves transitions. At an exact tie, relay expiry or phase timeout beats interaction completion. |

## Equipment and economy

| Item | Cost | Hit damage or effect |
| --- | ---: | --- |
| Sidearm | Free on spawn if no sidearm is carried | 25 damage per hit |
| Burst carbine | 550 credits | 18 damage per hit, up to three rounds per burst |
| Shield | 250 credits | Adds 30 shield points. Damage depletes shield before health. |

Players start with 100 health and 600 credits. Each completed round awards 300 credits to every player, plus 100 to each winner, up to a balance of 2,000. Purchases are allowed only in the buy phase. Surviving players keep their weapons into the next round. Shields reset every round. Eliminated players lose purchased weapons. Use uniform hit damage for the prototype. Decide weapon range, magazine size, reload timing, and fire cadence before the combat implementation.

## Arena and characters

- **Pumpworks** is a compact flood-control station with one relay in the central pump hall. Attackers reach it through a low service tunnel or a maintenance ramp to an upper catwalk. Defenders enter from a separate rear corridor. Build the hall, two approaches, and both spawns from simple geometry. Measure route travel times and cover gaps in the blockout.
- Use neutral player capsules with clear team colors for the first build. Later, test four original roles: a Scout who places a sensor that reports nearby movement direction, a Mechanic who temporarily disables a door, a Runner who places a team sprint strip, and a Technician who marks a traversable route through the map for teammates.
- Allow duplicate roles in future 5v5 custom rooms. Offer unique picks within each team for optional 4v4. Character models, ability tuning, and full-room balance follow the prototype.

## Interface and multiplayer

- Title screen offers Play and Settings. The lobby shows room code, team slots, ready status, and bot slots. The match view shows phase time, score, health, shields, ammo, and credits. The shop is a compact list with prices and available credits. Create an original layout and visual style.
- Start with keyboard movement, mouse aim, interact, reload, and shop actions. Store action bindings locally and show their current keys in prompts. Release pointer lock in menus and clear held actions on focus loss.
- The server owns round timers, team and player state, movement and hit validation, purchases, and relay state. Clients send input and display confirmed outcomes. Use a separate host credential for privileged room actions. Bots issue input through the same rules as players.

## Acceptance checks

1. Join by code from a second browser. Verify each player sees the other move and both receive the same health, elimination, score, and phase outcomes.
2. Complete rounds by elimination, timer expiry, relay activation and resolution, and relay deactivation. Verify a tied match reaches the deciding round.
3. Buy a shield and carbine, confirm the balance and damage order in both clients, and confirm purchases stop when the buy phase ends.
4. Repeat the room flow with one player and one bot. Confirm bot actions obey the same round rules.

## Open questions

Arena scale and travel times, movement feel, weapon handling, bot difficulty, latency performance, and the ability roster require prototype measurements. Record observed results before promoting any proposed settings to a release baseline.
