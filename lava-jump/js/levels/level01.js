/* =========================================================
FILE 39: js/levels/level01.js

This file defines the first playable level.

Purpose:

- Provide the first real level layout for the game
- Demonstrate how level data should be structured
- Keep the level fully data-driven
- Make it easy to add more levels later by copying this file

This level is intentionally simple and beginner-friendly.
It gives the project a clean starting point for gameplay,
movement testing, and level builder work.
========================================================= */

import { vec3 } from "../utils/math.js";
import { normalizeLevel } from "./levelTemplate.js";

const level01 = normalizeLevel({
id: "level01",
name: "First Steps",
description: "Learn the basics of jumping across lava platforms.",
objective: "Reach the finish platform without falling into the lava.",

spawn: vec3(0, 2, 0),

metadata: {
theme: "starter",
difficulty: "easy",
author: "OpenAI",
version: "1.0.0"
},

goals: {
targetScore: 150,
targetTime: 120,
requiredCoins: 5,
requireAllCheckpoints: false
},

world: {
gravity: -22,
lavaHeight: -6,
fog: null,
ambientLight: 0.85,
skyColor: "#1b1b2a"
},

/*
Platforms are placed as simple safe stepping stones.
Each platform has:
- id
- position
- size
- optional metadata
*/
platforms: [
{
id: "p01_start",
name: "Start Platform",
position: vec3(0, 0, 0),
size: vec3(6, 1, 6),
theme: "starter",
solid: true
},
{
id: "p02",
name: "Stone 1",
position: vec3(7, 0, 0),
size: vec3(4, 1, 4),
theme: "starter",
solid: true
},
{
id: "p03",
name: "Stone 2",
position: vec3(14, 0.5, -1),
size: vec3(4, 1, 4),
theme: "starter",
solid: true
},
{
id: "p04",
name: "Stone 3",
position: vec3(21, 1.0, 1),
size: vec3(4, 1, 4),
theme: "starter",
solid: true
},
{
id: "p05",
name: "Wide Rest",
position: vec3(30, 1.0, 0),
size: vec3(7, 1, 7),
theme: "starter",
solid: true
},
{
id: "p06",
name: "Final Stretch",
position: vec3(39, 1.5, -1),
size: vec3(4, 1, 4),
theme: "starter",
solid: true
},
{
id: "p07_finish",
name: "Finish Platform",
position: vec3(48, 2.0, 0),
size: vec3(8, 1, 8),
theme: "finish",
solid: true
}
],

/*
Lava is represented as a continuous hazard below the platforms.
The LavaSystem can read this later and turn it into an active
damage surface.
*/
lava: [
{
id: "lava_main",
name: "Main Lava",
height: -6,
damagePerSecond: 35,
color: "#ff4a1c",
glowColor: "#ff8a3d",
bounds: {
minX: -100,
maxX: 100,
minY: -6,
maxY: 100,
minZ: -100,
maxZ: 100
}
}
],

/*
Lava zones can be used later for special hazard sections.
They are separate from the base lava surface so the game can
support different hazard patterns.
*/
lavaZones: [
{
id: "lava_zone_gap_1",
name: "Gap Lava 1",
bounds: {
minX: 3,
maxX: 11,
minY: -6,
maxY: 100,
minZ: -4,
maxZ: 4
}
},
{
id: "lava_zone_gap_2",
name: "Gap Lava 2",
bounds: {
minX: 16,
maxX: 24,
minY: -6,
maxY: 100,
minZ: -4,
maxZ: 4
}
},
{
id: "lava_zone_gap_3",
name: "Gap Lava 3",
bounds: {
minX: 33,
maxX: 43,
minY: -6,
maxY: 100,
minZ: -4,
maxZ: 4
}
}
],

/*
Coins guide the player along the path and reward exploration.
*/
coins: [
{
id: "c01",
position: vec3(7, 1.4, 0),
value: 10
},
{
id: "c02",
position: vec3(14, 1.8, -1),
value: 10
},
{
id: "c03",
position: vec3(21, 2.2, 1),
value: 10
},
{
id: "c04",
position: vec3(30, 2.2, 0),
value: 10
},
{
id: "c05",
position: vec3(39, 2.6, -1),
value: 10
}
],

/*
The first level includes a single checkpoint in the middle.
That way the player can practice reaching a safer respawn point.
*/
checkpoints: [
{
id: "cp_mid",
name: "Middle Checkpoint",
position: vec3(30, 1.5, 0),
radius: 1.4,
oneTimeUse: true,
scoreReward: 100,
respawnOffsetY: 1.2
}
],

/*
Obstacles are kept minimal in the first level.
This file can be expanded later with spikes, moving hazards,
falling blocks, or fire jets.
*/
obstacles: [
{
id: "ob01",
name: "Spike Trap",
type: "spike",
position: vec3(24, 0.5, 0),
size: vec3(1.5, 1.5, 1.5),
damage: 25,
damageType: "spike",
active: true,
visible: true
}
],

/*
The first level has no enemies yet, but the structure is here
so future levels can add them immediately.
*/
enemies: [],

/*
Events and scripts are placeholders for future progression logic.
They are not required for the first playable version.
*/
events: [],
scripts: [],

notes: [
"This level is designed to be the first tutorial-style stage.",
"The path gradually rises to introduce jump timing.",
"Coins guide the player along the intended route."
]
});

export default level01;
