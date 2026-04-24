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
camera.position.set(0, 5, 10);
// Zielposition der Kamera
const targetPosition = player.position.clone().add(cameraOffset);

// Smooth folgen (lerp)
camera.position.lerp(targetPosition, 0.1);

// Immer auf Spieler schauen
camera.lookAt(player.position);

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

const velocity = { x: 0, z: 0 };
const acceleration = 0.02;
const friction = 0.9;


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

// Beschleunigung
velocity.x += dir.x * acceleration;
velocity.z += dir.y * acceleration;

// Reibung (langsames Stoppen)
velocity.x *= friction;
velocity.z *= friction;

// Position updaten
player.position.x += velocity.x;
player.position.z += velocity.z;

// === ROTATION (in Bewegungsrichtung schauen) ===
if (Math.abs(velocity.x) > 0.001 || Math.abs(velocity.z) > 0.001) {
  const angle = Math.atan2(velocity.x, velocity.z);
  player.rotation.y = angle;
  }



  // === CAMERA FOLLOW animate() ===
  const cameraOffset = new THREE.Vector3(0, 5, 8);
const targetPosition = player.position.clone().add(cameraOffset);

// Smooth follow
camera.position.lerp(targetPosition, 0.1);

// Look at player
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
