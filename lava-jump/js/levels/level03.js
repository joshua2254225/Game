/* =========================================================
FILE 41: js/levels/level03.js

This file defines the third playable level.

Purpose:

- Introduce a tougher route with more jumps and hazards
- Add a more advanced layout to show progression
- Keep the level data-driven and easy to extend
- Give the game a stronger mid-campaign challenge

This level is designed to feel more dangerous than the
first two levels. It adds narrower platforms, more traps,
and a few enemies to make movement more interesting.
========================================================= */

import { vec3 } from "../utils/math.js";
import { normalizeLevel } from "./levelTemplate.js";

const level03 = normalizeLevel({
id: "level03",
name: "Molten Run",
description: "A narrow lava route with tougher jumps and active threats.",
objective: "Reach the end while avoiding traps, enemies, and lava.",

spawn: vec3(0, 2, 0),

metadata: {
theme: "molten",
difficulty: "hard",
author: "OpenAI",
version: "1.0.0"
},

goals: {
targetScore: 420,
targetTime: 180,
requiredCoins: 9,
requireAllCheckpoints: true
},

world: {
gravity: -22,
lavaHeight: -6,
fog: null,
ambientLight: 0.72,
skyColor: "#140f18"
},

platforms: [
{
id: "l3_p01_start",
name: "Start Platform",
position: vec3(0, 0, 0),
size: vec3(7, 1, 7),
theme: "starter",
solid: true
},
{
id: "l3_p02",
name: "Thin Step 1",
position: vec3(6, 0.4, -1),
size: vec3(3, 1, 3),
theme: "molten",
solid: true
},
{
id: "l3_p03",
name: "Thin Step 2",
position: vec3(11, 0.8, 1),
size: vec3(3, 1, 3),
theme: "molten",
solid: true
},
{
id: "l3_p04",
name: "Left Ridge",
position: vec3(17, 1.1, -2),
size: vec3(3.5, 1, 3.5),
theme: "molten",
solid: true
},
{
id: "l3_p05",
name: "Center Bridge",
position: vec3(24, 1.6, 0),
size: vec3(5, 1, 3),
theme: "bridge",
solid: true
},
{
id: "l3_p06",
name: "Right Ridge",
position: vec3(31, 2.0, 2),
size: vec3(3.5, 1, 3.5),
theme: "molten",
solid: true
},
{
id: "l3_p07",
name: "Broken Path",
position: vec3(38, 2.2, -1),
size: vec3(4, 1, 3),
theme: "molten",
solid: true
},
{
id: "l3_p08",
name: "Final Approach",
position: vec3(46, 2.6, 0),
size: vec3(6, 1, 4),
theme: "bridge",
solid: true
},
{
id: "l3_p09_finish",
name: "Finish Platform",
position: vec3(56, 3.0, 0),
size: vec3(8, 1, 8),
theme: "finish",
solid: true
}
],

lava: [
{
id: "l3_lava_main",
name: "Main Lava",
height: -6,
damagePerSecond: 42,
color: "#ff4a1c",
glowColor: "#ff8a3d",
bounds: {
minX: -140,
maxX: 140,
minY: -6,
maxY: 100,
minZ: -140,
maxZ: 140
}
}
],

lavaZones: [
{
id: "l3_lava_gap_1",
name: "Molten Gap 1",
bounds: {
minX: 2,
maxX: 9,
minY: -6,
maxY: 100,
minZ: -5,
maxZ: 5
}
},
{
id: "l3_lava_gap_2",
name: "Molten Gap 2",
bounds: {
minX: 14,
maxX: 20,
minY: -6,
maxY: 100,
minZ: -5,
maxZ: 5
}
},
{
id: "l3_lava_gap_3",
name: "Molten Gap 3",
bounds: {
minX: 27,
maxX: 34,
minY: -6,
maxY: 100,
minZ: -5,
maxZ: 5
}
},
{
id: "l3_lava_gap_4",
name: "Molten Gap 4",
bounds: {
minX: 41,
maxX: 49,
minY: -6,
maxY: 100,
minZ: -5,
maxZ: 5
}
}
],

coins: [
{
id: "l3_c01",
position: vec3(6, 1.2, -1),
value: 10
},
{
id: "l3_c02",
position: vec3(11, 1.6, 1),
value: 10
},
{
id: "l3_c03",
position: vec3(17, 1.9, -2),
value: 10
},
{
id: "l3_c04",
position: vec3(24, 2.4, 0),
value: 10
},
{
id: "l3_c05",
position: vec3(31, 2.8, 2),
value: 10
},
{
id: "l3_c06",
position: vec3(38, 3.0, -1),
value: 10
},
{
id: "l3_c07",
position: vec3(46, 3.3, 0),
value: 10
},
{
id: "l3_c08",
position: vec3(56, 3.7, 0),
value: 10
},
{
id: "l3_c09",
position: vec3(24, 2.1, 0),
value: 20
}
],

checkpoints: [
{
id: "l3_cp_mid",
name: "Midway Beacon",
position: vec3(31, 2.0, 2),
radius: 1.5,
oneTimeUse: true,
scoreReward: 125,
respawnOffsetY: 1.2
}
],

obstacles: [
{
id: "l3_ob01",
name: "Spike Wall",
type: "spike",
position: vec3(20, 1.0, 0),
size: vec3(2, 2, 2),
damage: 30,
damageType: "spike",
active: true,
visible: true
},
{
id: "l3_ob02",
name: "Fire Jet",
type: "fire",
position: vec3(41, 2.0, 0),
size: vec3(1.5, 2.5, 1.5),
damage: 25,
damageType: "fire",
active: true,
visible: true
},
{
id: "l3_ob03",
name: "Falling Rock",
type: "rock",
position: vec3(49, 2.5, 0),
size: vec3(1.8, 1.8, 1.8),
damage: 20,
damageType: "impact",
active: true,
visible: true,
falling: true
}
],

enemies: [
{
id: "l3_en01",
name: "Magma Scout",
type: "patrol",
position: vec3(24, 2.0, 1.3),
size: vec3(1.2, 1.8, 1.2),
damage: 18,
health: 2,
patrol: true,
patrolSpeed: 1.15,
patrolStart: vec3(22, 2.0, 1.3),
patrolEnd: vec3(26, 2.0, 1.3),
active: true,
visible: true,
solid: true
},
{
id: "l3_en02",
name: "Heat Warden",
type: "chase",
position: vec3(46, 2.6, -1),
size: vec3(1.4, 2.0, 1.4),
damage: 22,
health: 3,
chase: true,
active: true,
visible: true,
solid: true
}
],

events: [],
scripts: [],

notes: [
"This is the first level where the path feels genuinely tight.",
"A mix of hazards, enemies, and narrow platforms increases tension.",
"The checkpoint is placed before the final section for fair recovery."
]
});

export default level03;
