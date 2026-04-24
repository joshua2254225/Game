import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
import { Joystick } from "./controls.js";


// === SCENE ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// === CAMERA ===
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// === RENDERER ===
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("game-container").appendChild(renderer.domElement);

// === LIGHT ===
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

// === GROUND ===
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.MeshStandardMaterial({ color: 0x3cb043 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// === PLAYER ===
const player = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x0000ff })
);
player.position.y = 0.5;
scene.add(player);

const joystick = new Joystick();


// === INPUT ===
const keys = {};

window.addEventListener("keydown", (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener("keyup", (e) => keys[e.key.toLowerCase()] = false);

// === MOVEMENT SETTINGS ===
const speed = 0.1;

// === GAME LOOP ===
function animate() {
  requestAnimationFrame(animate);

  // === MOVEMENT ===

  const dir = joystick.getDirection();

player.position.x += dir.x * speed;
player.position.z += dir.y * speed;

  // === CAMERA FOLLOW ===
  camera.position.x = player.position.x;
  camera.position.z = player.position.z + 8;
  camera.position.y = player.position.y + 5;

  camera.lookAt(player.position);

  renderer.render(scene, camera);
}

animate();

// === RESIZE ===
window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});
