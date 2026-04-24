// src/main.js

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

// === BASIC SETUP ===

// Szene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Himmelblau

// Kamera
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 5, 10);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

// In HTML einfügen
document.getElementById("game-container").appendChild(renderer.domElement);


// === LICHT ===

// Sonnenlicht
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);

// Ambient Licht (damit nichts komplett schwarz ist)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);


// === BODEN ===

const groundGeometry = new THREE.PlaneGeometry(50, 50);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x3cb043 });

const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);


// === TEST OBJECT (zum sehen ob alles geht) ===

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });

const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
cube.position.y = 0.5;
scene.add(cube);


// === GAME LOOP ===

function animate() {
  requestAnimationFrame(animate);

  // Beispiel Animation
  cube.rotation.y += 0.01;

  renderer.render(scene, camera);
}

animate();


// === RESIZE HANDLING ===

window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});
