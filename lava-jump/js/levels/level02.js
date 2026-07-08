/* =========================================================
FILE 40: js/levels/level02.js

This file defines the second playable level.

Purpose:

- Introduce slightly harder jumps and spacing
- Add more variety to the platform path
- Show how a follow-up level can build on the first one
- Keep the level data-driven and easy to edit later

This level is a little more challenging than level01.
It adds tighter jumps, a few hazards, and a longer path
so the player starts to feel real progression.
========================================================= */

import { vec3 } from "../utils/math.js";
import { normalizeLevel } from "./levelTemplate.js";

const level02 = normalizeLevel({
id: "level02",
name: "Heat Wave Crossing",
description: "A longer route with sharper jumps and more risk.",
objective: "Cross the lava field and reach the far platform.",

spawn: vec3(0, 2, 0),

metadata: {
theme: "lava_field",
difficulty: "medium",
author: "OpenAI",
version: "1.0.0"
},

goals: {
targetScore: 260,
targetTime: 150,
requiredCoins: 7,
requireAllCheckpoints: true
},

world: {
gravity: -22,
lavaHeight: -6,
fog: null,
ambientLight: 0.78,
skyColor: "#201625"
},

platforms: [
{
id: "l2_p01_start",
name: "Start Platform",
position: vec3(0, 0, 0),
size: vec3(7, 1, 7),
theme: "starter",
solid: true
},
{
id: "l2_p02",
name: "First Step",
position: vec3(6, 0.4, 1),
size: vec3(3.5, 1, 3.5),
theme: "lava",
solid: true
},
{
id: "l2_p03",
name: "Second Step",
position: vec3(12, 0.7, -1),
size: vec3(3.5, 1, 3.5),
theme: "lava",
solid: true
},
{
id: "l2_p04",
name: "Wide Bridge",
position: vec3(19, 1.1, 0),
size: vec3(6, 1, 4),
theme: "bridge",
solid: true
},
{
id: "l2_p05",
name: "Corner Rock",
position: vec3(28, 1.4, 2),
size: vec3(3.5, 1, 3.5),
theme: "lava",
solid: true
},
{
id: "l2_p06",
name: "Left Turn",
position: vec3(35, 1.8, -2),
size: vec3(4, 1, 4),
theme: "lava",
solid: true
},
{
id: "l2_p07",
name: "Long Stretch",
position: vec3(44, 2.0, 0),
size: vec3(7, 1, 4),
theme: "bridge",
solid: true
},
{
id: "l2_p08_finish",
name: "Finish Platform",
position: vec3(54, 2.5, 0),
size: vec3(8, 1, 8),
theme: "finish",
solid: true
}
],

lava: [
{
id: "l2_lava_main",
name: "Main Lava",
height: -6,
damagePerSecond: 38,
color: "#ff4a1c",
glowColor: "#ff8a3d",
bounds: {
minX: -120,
maxX: 120,
minY: -6,
maxY: 100,
minZ: -120,
maxZ: 120
}
}
],

lavaZones: [
{
id: "l2_lava_gap_1",
name: "Gap One",
bounds: {
minX: 2,
maxX: 10,
minY: -6,
maxY: 100,
minZ: -5,
maxZ: 5
}
},
{
id: "l2_lava_gap_2",
name: "Gap Two",
bounds: {
minX: 15,
maxX: 24,
minY: -6,
maxY: 100,
minZ: -5,
maxZ: 5
}
},
{
id: "l2_lava_gap_3",
name: "Gap Three",
bounds: {
minX: 31,
maxX: 39,
minY: -6,
maxY: 100,
minZ: -5,
maxZ: 5
}
},
{
id: "l2_lava_gap_4",
name: "Gap Four",
bounds: {
minX: 48,
maxX: 52,
minY: -6,
maxY: 100,
minZ: -5,
maxZ: 5
}
}
],

coins: [
{
id: "l2_c01",
position: vec3(6, 1.2, 1),
value: 10
},
{
id: "l2_c02",
position: vec3(12, 1.5, -1),
value: 10
},
{
id: "l2_c03",
position: vec3(19, 1.9, 0),
value: 10
},
{
id: "l2_c04",
position: vec3(28, 2.2, 2),
value: 10
},
{
id: "l2_c05",
position: vec3(35, 2.5, -2),
value: 10
},
{
id: "l2_c06",
position: vec3(44, 2.7, 0),
value: 10
},
{
id: "l2_c07",
position: vec3(54, 3.0, 0),
value: 10
}
],

checkpoints: [
{
id: "l2_cp_mid",
name: "Midway Checkpoint",
position: vec3(35, 2.0, -2),
radius: 1.5,
oneTimeUse: true,
scoreReward: 100,
respawnOffsetY: 1.2
}
],

obstacles: [
{
id: "l2_ob01",
name: "Spike Cluster",
type: "spike",
position: vec3(24, 0.5, 0),
size: vec3(2, 1.5, 2),
damage: 30,
damageType: "spike",
active: true,
visible: true
},
{
id: "l2_ob02",
name: "Heat Vent",
type: "fire",
position: vec3(40, 1.0, 0),
size: vec3(1.5, 2, 1.5),
damage: 20,
damageType: "fire",
active: true,
visible: true
}
],

enemies: [
{
id: "l2_en01",
name: "Lava Sentry",
type: "patrol",
position: vec3(44, 2.0, 1.5),
size: vec3(1.2, 1.8, 1.2),
damage: 15,
health: 2,
patrol: true,
patrolSpeed: 1.0,
patrolStart: vec3(42, 2.0, 1.5),
patrolEnd: vec3(46, 2.0, 1.5),
active: true,
visible: true,
solid: true
}
],

events: [],
scripts: [],

notes: [
"This stage is meant to feel like a proper second step up.",
"Jumps are a bit tighter, and the path is longer.",
"The checkpoint helps the player practice recovery."
]
});

export default level02;
