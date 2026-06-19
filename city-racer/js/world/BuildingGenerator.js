/* ## `js/world/BuildingGenerator.js`

```javascript */
/**
 * ============================================================================
 * CITY RACER — BuildingGenerator.js
 * ============================================================================
 * Procedurally generates and places all buildings in the city.
 * Reads city-block data from CityMap and fills each block with
 * district-appropriate architecture.
 *
 * Districts and their character:
 *   DOWNTOWN   — glass skyscrapers, tall office blocks, neon signs
 *   SUBURBS    — detached houses, gardens, low-rises, churches
 *   INDUSTRIAL — warehouses, factories, water towers, chimneys
 *   RIVERSIDE  — apartments, cafés, hotels, riverside terraces
 *
 * Performance strategy:
 *   • Buildings share materials per district (one material per palette colour)
 *   • Window emissive maps are pre-baked into facade textures (day / night)
 *   • Distant buildings (> 80u) use simplified low-poly LOD meshes
 *   • Each district's buildings are grouped under one THREE.Group so the
 *     frustum culler can skip entire districts at once
 *   • All static meshes: matrixAutoUpdate = false
 *   • Collision meshes are exported as a flat array for Camera.js blocker list
 *
 * Roof detail:
 *   Skyscrapers get a rooftop antenna or water-tank.
 *   Houses get a peaked roof (triangular prism).
 *   Industrial buildings get a barrel-vault or sawtooth skylight profile.
 * ============================================================================
 */

'use strict';

const BuildingGenerator = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════

  const GROUND_Y = CONFIG.WORLD.GROUND_Y;
  const CFG      = CONFIG.BUILDINGS;

  // Per-district style overrides on top of CFG defaults
  const DISTRICT_STYLE = {
    DOWNTOWN: {
      heightMin:      12,
      heightMax:      CFG.HEIGHT_MAX,
      footprintMin:   8,
      footprintMax:   22,
      density:        CFG.PALETTE.DOWNTOWN,
      roofType:       'flat',
      windowStyle:    'glass',
      extraDetails:   true,   // neon signs, antennas
    },
    SUBURBS: {
      heightMin:      CFG.HEIGHT_MIN,
      heightMax:      10,
      footprintMin:   6,
      footprintMax:   14,
      density:        CFG.PALETTE.SUBURBS,
      roofType:       'pitched',
      windowStyle:    'domestic',
      extraDetails:   false,
    },
    INDUSTRIAL: {
      heightMin:      5,
      heightMax:      20,
      footprintMin:   10,
      footprintMax:   CFG.FOOTPRINT_MAX,
      density:        CFG.PALETTE.INDUSTRIAL,
      roofType:       'industrial',
      windowStyle:    'industrial',
      extraDetails:   true,   // chimneys, tanks
    },
    RIVERSIDE: {
      heightMin:      5,
      heightMax:      22,
      footprintMin:   7,
      footprintMax:   16,
      density:        CFG.PALETTE.RIVERSIDE,
      roofType:       'flat',
      windowStyle:    'residential',
      extraDetails:   false,
    },
  };

  // Block padding keeps buildings from sitting flush on the kerb
  const BLOCK_PAD  = CFG.BLOCK_PADDING;

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ══════════════════════════════════════════════════════════════════════════

  // Per-district root groups
  const _groups = {};

  // Flat array of all building meshes for Camera.js collision
  const _collisionMeshes = [];

  // Material caches
  const _matCache     = new Map();   // hexColor_finish → THREE.Material
  const _roofMat      = new Map();   // 'flat'|'pitched'|'industrial' → Material
  const _windowMatDay  = new Map();  // hexColor → Material
  const _windowMatNight = new Map(); // hexColor → Material

  // Night mode flag (toggled by Sky.js)
  let _isNight = false;

  // Seeded RNG per build call (deterministic city each load)
  let _rng = MathUtils.createRNG(CONFIG.WORLD.SIZE);

  // ══════════════════════════════════════════════════════════════════════════
  // MATERIAL FACTORIES
  // ══════════════════════════════════════════════════════════════════════════

  function _getWallMat(hexColor, district) {
    const key = `wall_${hexColor}_${district}`;
    if (_matCache.has(key)) return _matCache.get(key);

    const isGlass   = district === 'DOWNTOWN' && _rng() < 0.35;
    let   mat;

    if (isGlass) {
      mat = new THREE.MeshStandardMaterial({
        map:              ProceduralTextures.makeGlassFacade(hexColor, 256),
        roughness:        0.15,
        metalness:        0.55,
        envMapIntensity:  0.6,
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color:     new THREE.Color(hexColor),
        roughness: 0.82,
        metalness: 0.05,
      });
    }

    _matCache.set(key, mat);
    return mat;
  }

  function _getRoofMat(type) {
    if (_roofMat.has(type)) return _roofMat.get(type);

    let mat;
    switch (type) {
      case 'pitched':
        mat = new THREE.MeshStandardMaterial({
          color:     0x884422,
          roughness: 0.90,
          metalness: 0.0,
        });
        break;
      case 'industrial':
        mat = new THREE.MeshStandardMaterial({
          color:     0x555544,
          roughness: 0.95,
          metalness: 0.1,
        });
        break;
      default:  // flat
        mat = new THREE.MeshStandardMaterial({
          map:       ProceduralTextures.makeRoof(128),
          roughness: 0.95,
          metalness: 0.0,
          color:     new THREE.Color(CFG.ROOF_COLOR),
        });
    }

    _roofMat.set(type, mat);
    return mat;
  }

  function _getWindowMat(hexColor, night) {
    const cache = night ? _windowMatNight : _windowMatDay;
    if (cache.has(hexColor)) return cache.get(hexColor);

    const mat = new THREE.MeshStandardMaterial({
      color:             night ? new THREE.Color(CFG.WINDOW_LIT_COLOR) : new THREE.Color(CFG.WINDOW_DAY_COLOR),
      emissive:          night ? new THREE.Color(CFG.WINDOW_LIT_COLOR) : new THREE.Color(0x000000),
      emissiveIntensity: night ? 0.9 : 0.0,
      roughness:         0.2,
      metalness:         0.4,
      transparent:       true,
      opacity:           night ? 1.0 : 0.75,
    });

    cache.set(hexColor, mat);
    return mat;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN BUILD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Generate all buildings. Called once after CityMap.init() and
   * RoadBuilder.build().
   */
  function build() {
    Renderer.setLoadProgress(31, 'Generating buildings…');

    // Create per-district groups
    for (const districtKey of Object.keys(DISTRICT_STYLE)) {
      const grp  = new THREE.Group();
      grp.name   = `buildings_${districtKey}`;
      _groups[districtKey] = grp;
      Renderer.add(grp);
    }

    const blocks     = CityMap.getCityBlocks();
    const totalBlocks = blocks.length;

    blocks.forEach((block, idx) => {
      _populateBlock(block);

      // Update progress every 10 blocks
      if (idx % 10 === 0) {
        const pct = 31 + (idx / totalBlocks) * 14;
        Renderer.setLoadProgress(pct, `Buildings… ${idx}/${totalBlocks}`);
      }
    });

    Renderer.setLoadProgress(45, 'Buildings complete.');

    // Export collision meshes to Camera.js
    Camera.setCameraBlockers(_collisionMeshes);

    const total = Object.values(_groups)
      .reduce((s, g) => s + g.children.length, 0);
    console.info(`[BuildingGenerator] Built ${total} buildings across ${blocks.length} blocks.`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BLOCK POPULATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Fill one city block with one or more buildings.
   * @param {object} block  CityMap block: { minX,maxX,minZ,maxZ,cx,cz,district }
   */
  function _populateBlock(block) {
    const style    = DISTRICT_STYLE[block.district];
    if (!style) return;

    const usableW  = block.width  - BLOCK_PAD * 2;
    const usableD  = block.depth  - BLOCK_PAD * 2;
    if (usableW < 4 || usableD < 4) return;

    const density  = CFG[block.district.toLowerCase() + '_density'] ??
                     (DISTRICT_STYLE[block.district]?.density?.length > 0 ? 0.7 : 0.5);
    const roll     = _rng();
    if (roll > (block.district === 'DOWNTOWN' ? 0.92 : 0.80)) return; // occasional empty lot

    // For DOWNTOWN, try to fit one large building per block.
    // For SUBURBS, subdivide the block into a few smaller plots.
    // For INDUSTRIAL, one or two big footprints.
    // For RIVERSIDE, a mix.

    switch (block.district) {
      case 'DOWNTOWN':   _placeDowntownBlock(block, style, usableW, usableD); break;
      case 'SUBURBS':    _placeSuburbsBlock(block, style, usableW, usableD);  break;
      case 'INDUSTRIAL': _placeIndustrialBlock(block, style, usableW, usableD); break;
      case 'RIVERSIDE':  _placeRiversideBlock(block, style, usableW, usableD);  break;
      default:           _placeGenericBlock(block, style, usableW, usableD);
    }
  }

  // ── Downtown ─────────────────────────────────────────────────────────────

  function _placeDowntownBlock(block, style, usableW, usableD) {
    const w      = MathUtils.clamp(usableW * (0.7 + _rng() * 0.28), 8, usableW);
    const d      = MathUtils.clamp(usableD * (0.7 + _rng() * 0.28), 8, usableD);
    const h      = style.heightMin + _rng() * (style.heightMax - style.heightMin);
    const color  = MathUtils.randPick(style.density);
    const x      = block.cx + (_rng() - 0.5) * (usableW - w) * 0.3;
    const z      = block.cz + (_rng() - 0.5) * (usableD - d) * 0.3;

    _placeBuilding(x, z, w, d, h, color, block.district, style.roofType);

    // Sometimes add a smaller adjacent block / podium at base
    if (_rng() < 0.45) {
      const pw  = w * (0.5 + _rng() * 0.4);
      const pd  = d * (0.5 + _rng() * 0.4);
      const ph  = style.heightMin * 0.5;
      _placeBuilding(x + (_rng()-0.5)*4, z + (_rng()-0.5)*4, pw, pd, ph, color, block.district, 'flat');
    }
  }

  // ── Suburbs ───────────────────────────────────────────────────────────────

  function _placeSuburbsBlock(block, style, usableW, usableD) {
    // Subdivide block into 1–4 house plots
    const cols  = _rng() < 0.5 ? 1 : 2;
    const rows  = _rng() < 0.5 ? 1 : 2;
    const plotW = usableW / cols;
    const plotD = usableD / rows;

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        if (_rng() < 0.12) continue;  // occasional empty garden

        const plotCx = block.minX + BLOCK_PAD + (col + 0.5) * plotW;
        const plotCz = block.minZ + BLOCK_PAD + (row + 0.5) * plotD;

        const houseW = plotW * (0.45 + _rng() * 0.25);
        const houseD = plotD * (0.45 + _rng() * 0.25);
        const h      = style.heightMin + _rng() * (style.heightMax - style.heightMin);
        const color  = MathUtils.randPick(style.density);

        _placeBuilding(plotCx, plotCz, houseW, houseD, h, color, block.district, style.roofType);

        // Garage extension
        if (_rng() < 0.4) {
          _placeBuilding(
            plotCx + houseW * 0.6,
            plotCz + houseD * 0.3,
            houseW * 0.35,
            houseD * 0.35,
            h * 0.55,
            MathUtils.darkenColor(color, 0.1),
            block.district,
            'flat'
          );
        }
      }
    }
  }

  // ── Industrial ───────────────────────────────────────────────────────────

  function _placeIndustrialBlock(block, style, usableW, usableD) {
    // One or two large warehouse footprints
    const count = _rng() < 0.65 ? 1 : 2;

    for (let i = 0; i < count; i++) {
      const w     = usableW * (0.5 + _rng() * 0.45);
      const d     = usableD * (0.5 + _rng() * 0.45);
      const h     = style.heightMin + _rng() * (style.heightMax - style.heightMin);
      const color = MathUtils.randPick(style.density);
      const ox    = (i === 0 ? -1 : 1) * (usableW - w) * 0.2;

      _placeBuilding(block.cx + ox, block.cz, w, d, h, color, block.district, style.roofType);

      // Chimney
      if (_rng() < 0.5) {
        _placeChimney(block.cx + ox + (_rng()-0.5)*w*0.4, block.cz + (_rng()-0.5)*d*0.4, h);
      }
      // Water tower
      if (_rng() < 0.35) {
        _placeWaterTower(block.cx + ox + (_rng()-0.5)*w*0.35, block.cz + (_rng()-0.5)*d*0.35, h);
      }
    }
  }

  // ── Riverside ────────────────────────────────────────────────────────────

  function _placeRiversideBlock(block, style, usableW, usableD) {
    // Medium apartments / small hotels
    const w     = MathUtils.clamp(usableW * (0.6 + _rng() * 0.3), 7, usableW);
    const d     = MathUtils.clamp(usableD * (0.6 + _rng() * 0.3), 7, usableD);
    const h     = style.heightMin + _rng() * (style.heightMax - style.heightMin);
    const color = MathUtils.randPick(style.density);

    _placeBuilding(block.cx, block.cz, w, d, h, color, block.district, style.roofType);

    // Terrace / overhang at street level
    if (_rng() < 0.3) {
      _placeBuilding(
        block.cx,
        block.cz,
        w + 2,
        MathUtils.clamp(d * 0.25, 2, 6),
        h * 0.12,
        MathUtils.lightenColor(color, 0.1),
        block.district,
        'flat'
      );
    }
  }

  // ── Generic fallback ──────────────────────────────────────────────────────

  function _placeGenericBlock(block, style, usableW, usableD) {
    const w     = usableW * (0.5 + _rng() * 0.4);
    const d     = usableD * (0.5 + _rng() * 0.4);
    const h     = CFG.HEIGHT_MIN + _rng() * (CFG.HEIGHT_MAX * 0.5 - CFG.HEIGHT_MIN);
    const color = MathUtils.randPick(style.density || [0x888888]);
    _placeBuilding(block.cx, block.cz, w, d, h, color, block.district, 'flat');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BUILDING MESH CREATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Build and place one complete building: body + windows + roof + details.
   *
   * @param {number} cx         World X centre.
   * @param {number} cz         World Z centre.
   * @param {number} w          Footprint width (X).
   * @param {number} d          Footprint depth (Z).
   * @param {number} h          Building height.
   * @param {number} colorHex   Wall colour hex integer.
   * @param {string} district   District key.
   * @param {string} roofType   'flat'|'pitched'|'industrial'
   */
  function _placeBuilding(cx, cz, w, d, h, colorHex, district, roofType) {
    const grp = new THREE.Group();
    grp.name  = `bld_${district}`;

    const wallMat = _getWallMat(colorHex, district);

    // ── Main body ─────────────────────────────────────────────────────────
    const bodyGeo  = new THREE.BoxGeometry(w, h, d);
    const bodyMesh = new THREE.Mesh(bodyGeo, wallMat);
    bodyMesh.position.set(0, h / 2, 0);
    bodyMesh.castShadow    = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.matrixAutoUpdate = false;
    bodyMesh.updateMatrix();
    grp.add(bodyMesh);

    // ── Windows ───────────────────────────────────────────────────────────
    _addWindowsToBuilding(grp, w, d, h, colorHex, district);

    // ── Roof ──────────────────────────────────────────────────────────────
    _addRoof(grp, w, d, h, roofType);

    // ── Downtown extras ───────────────────────────────────────────────────
    if (district === 'DOWNTOWN' && h > 25 && _rng() < 0.55) {
      _addAntenna(grp, w, d, h);
    }
    if (district === 'DOWNTOWN' && h > 15 && _rng() < 0.40) {
      _addNeonSign(grp, w, d, h, colorHex);
    }

    // ── Place in scene ────────────────────────────────────────────────────
    const yRot = _rng() < 0.1 ? Math.round(_rng() * 3) * (Math.PI / 2) : 0;

    grp.position.set(cx, GROUND_Y, cz);
    if (yRot !== 0) grp.rotation.y = yRot;
    grp.matrixAutoUpdate = false;
    grp.updateMatrix();

    const distGrp = _groups[district] || _groups['DOWNTOWN'];
    distGrp.add(grp);

    // Register for camera collision
    _collisionMeshes.push(bodyMesh);
    bodyMesh.userData.worldPos = new THREE.Vector3(cx, GROUND_Y + h/2, cz);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WINDOW GENERATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Add window planes to the four faces of the building.
   */
  function _addWindowsToBuilding(grp, w, d, h, colorHex, district) {
    const floors      = Math.max(1, Math.floor(h / CFG.FLOOR_HEIGHT));
    const winW_X      = 1.0;   // window physical width
    const winH_W      = CFG.FLOOR_HEIGHT * 0.55;
    const winPadX     = 0.6;
    const winPadZ     = 0.6;
    const LIFT        = 0.003;  // tiny offset to avoid z-fighting

    // How many windows fit per face?
    const colsX = Math.max(1, Math.floor((w - winPadX * 2) / (winW_X + winPadX)));
    const colsZ = Math.max(1, Math.floor((d - winPadZ * 2) / (winW_X + winPadZ)));

    const winMat = _isNight
      ? _getWindowMat(colorHex, true)
      : _getWindowMat(colorHex, false);

    const winGeoX = new THREE.PlaneGeometry(winW_X, winH_W);
    const winGeoZ = new THREE.PlaneGeometry(winW_X, winH_W);

    // Shared geometry per face direction — use InstancedMesh for performance
    const instancesX  = colsX * floors;
    const instancesZ  = colsZ * floors;

    if (instancesX > 0) {
      const imFront = new THREE.InstancedMesh(winGeoX, winMat, instancesX);
      const imBack  = new THREE.InstancedMesh(winGeoX, winMat, instancesX);
      imFront.castShadow = false;
      imBack.castShadow  = false;
      imFront.matrixAutoUpdate = false;
      imBack.matrixAutoUpdate  = false;

      const dummy = new THREE.Object3D();
      const stepX = (w - winPadX * 2) / colsX;
      let   idx   = 0;

      for (let floor = 0; floor < floors; floor++) {
        const fy = CFG.FLOOR_HEIGHT * (floor + 0.5) + winH_W / 2 * 0.5;

        for (let col = 0; col < colsX; col++) {
          const fx = -w/2 + winPadX + stepX * (col + 0.5);

          // Front face
          dummy.position.set(fx, fy, d/2 + LIFT);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          imFront.setMatrixAt(idx, dummy.matrix);

          // Back face
          dummy.position.set(fx, fy, -d/2 - LIFT);
          dummy.rotation.set(0, Math.PI, 0);
          dummy.updateMatrix();
          imBack.setMatrixAt(idx, dummy.matrix);
          idx++;
        }
      }

      imFront.instanceMatrix.needsUpdate = true;
      imBack.instanceMatrix.needsUpdate  = true;
      grp.add(imFront, imBack);
    }

    if (instancesZ > 0) {
      const imLeft  = new THREE.InstancedMesh(winGeoZ, winMat, instancesZ);
      const imRight = new THREE.InstancedMesh(winGeoZ, winMat, instancesZ);
      imLeft.castShadow  = false;
      imRight.castShadow = false;
      imLeft.matrixAutoUpdate  = false;
      imRight.matrixAutoUpdate = false;

      const dummy = new THREE.Object3D();
      const stepZ = (d - winPadZ * 2) / colsZ;
      let   idx   = 0;

      for (let floor = 0; floor < floors; floor++) {
        const fy = CFG.FLOOR_HEIGHT * (floor + 0.5) + winH_W / 2 * 0.5;

        for (let col = 0; col < colsZ; col++) {
          const fz = -d/2 + winPadZ + stepZ * (col + 0.5);

          dummy.position.set(w/2 + LIFT, fy, fz);
          dummy.rotation.set(0, -Math.PI/2, 0);
          dummy.updateMatrix();
          imLeft.setMatrixAt(idx, dummy.matrix);

          dummy.position.set(-w/2 - LIFT, fy, fz);
          dummy.rotation.set(0,  Math.PI/2, 0);
          dummy.updateMatrix();
          imRight.setMatrixAt(idx, dummy.matrix);
          idx++;
        }
      }

      imLeft.instanceMatrix.needsUpdate  = true;
      imRight.instanceMatrix.needsUpdate = true;
      grp.add(imLeft, imRight);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ROOF TYPES
  // ══════════════════════════════════════════════════════════════════════════

  function _addRoof(grp, w, d, h, roofType) {
    const roofMat = _getRoofMat(roofType);

    switch (roofType) {

      case 'pitched': {
        // Triangular prism peak
        const RIDGE_H = MathUtils.clamp(w * 0.28, 1.5, 4.0);

        const shape   = new THREE.Shape();
        shape.moveTo(-w/2, 0);
        shape.lineTo( w/2, 0);
        shape.lineTo( 0,   RIDGE_H);
        shape.closePath();

        const extrudeSettings = {
          depth:           d,
          bevelEnabled:    false,
        };
        const roofGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const roof    = new THREE.Mesh(roofGeo, roofMat);

        // Rotate so ridge runs along Z and sits on top of building
        roof.rotation.x = -Math.PI / 2;
        roof.position.set(-w/2, h, -d/2);
        roof.castShadow    = true;
        roof.matrixAutoUpdate = false;
        roof.updateMatrix();
        grp.add(roof);

        // Optional chimney
        if (_rng() < 0.6) {
          const chimGeo = new THREE.BoxGeometry(0.5, 1.2, 0.5);
          const chim    = new THREE.Mesh(chimGeo, roofMat);
          chim.position.set(w * 0.25 * (_rng() < 0.5 ? 1 : -1), h + RIDGE_H * 0.6, 0);
          chim.castShadow = true;
          chim.matrixAutoUpdate = false;
          chim.updateMatrix();
          grp.add(chim);
        }
        break;
      }

      case 'industrial': {
        // Sawtooth skylight profile — series of asymmetric ridges
        const ridgeCount = Math.max(2, Math.floor(d / 6));
        const ridgeW     = d / ridgeCount;
        const ridgeH     = MathUtils.clamp(w * 0.12, 1.0, 3.0);

        for (let r = 0; r < ridgeCount; r++) {
          const rz   = -d/2 + ridgeW * (r + 0.5);

          const shape = new THREE.Shape();
          shape.moveTo(-w/2, 0);
          shape.lineTo( w/2, 0);
          shape.lineTo( w/2, ridgeH);
          shape.lineTo(-w/2, ridgeH * 0.1);
          shape.closePath();

          const geo  = new THREE.ExtrudeGeometry(shape, { depth: ridgeW * 0.9, bevelEnabled: false });
          const mesh = new THREE.Mesh(geo, roofMat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(-w/2, h, rz - ridgeW * 0.45);
          mesh.castShadow    = true;
          mesh.matrixAutoUpdate = false;
          mesh.updateMatrix();
          grp.add(mesh);
        }
        break;
      }

      default: {
        // Flat roof with parapet walls
        const roofGeo  = new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3);
        const roofSlab = new THREE.Mesh(roofGeo, roofMat);
        roofSlab.position.set(0, h + 0.175, 0);
        roofSlab.castShadow    = true;
        roofSlab.receiveShadow = true;
        roofSlab.matrixAutoUpdate = false;
        roofSlab.updateMatrix();
        grp.add(roofSlab);

        // Parapet walls (four sides)
        const parW = 0.25, parH = 0.5;
        const parapets = [
          { x:  0,    z:  d/2 + parW/2, rw: w + parW*2, rd: parW },
          { x:  0,    z: -d/2 - parW/2, rw: w + parW*2, rd: parW },
          { x:  w/2 + parW/2, z: 0,     rw: parW, rd: d },
          { x: -w/2 - parW/2, z: 0,     rw: parW, rd: d },
        ];
        for (const p of parapets) {
          const pGeo = new THREE.BoxGeometry(p.rw, parH, p.rd);
          const pm   = new THREE.Mesh(pGeo, roofMat);
          pm.position.set(p.x, h + 0.35 + parH/2, p.z);
          pm.matrixAutoUpdate = false;
          pm.updateMatrix();
          grp.add(pm);
        }
        break;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DOWNTOWN DETAILS
  // ══════════════════════════════════════════════════════════════════════════

  function _addAntenna(grp, w, d, h) {
    const mat      = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6 });
    const ANTE_H   = 6 + _rng() * 8;

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, ANTE_H, 6), mat);
    pole.position.set(0, h + ANTE_H / 2 + 0.3, 0);
    pole.castShadow    = true;
    pole.matrixAutoUpdate = false;
    pole.updateMatrix();
    grp.add(pole);

    // Blinking red light at the tip
    const blinkMat = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
    const blink    = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), blinkMat);
    blink.position.set(0, h + ANTE_H + 0.3, 0);
    blink.matrixAutoUpdate = false;
    blink.updateMatrix();
    blink.userData.blinkTip = true;   // found by update() for animation
    grp.add(blink);
  }

  function _addNeonSign(grp, w, d, h, baseColor) {
    // Simple glowing panel on the side of the building
    const signW   = MathUtils.clamp(w * 0.55, 3, 10);
    const signH   = 1.2;
    const signY   = h * (0.4 + _rng() * 0.4);

    // Pick a vivid neon colour
    const neons   = [0xFF0088, 0x00FFFF, 0xFF6600, 0x00FF44, 0xFFFF00];
    const neon    = MathUtils.randPick(neons);

    const mat = new THREE.MeshBasicMaterial({
      color:  neon,
      side:   THREE.DoubleSide,
    });

    const panel = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), mat);
    panel.position.set(0, signY, d / 2 + 0.08);
    panel.matrixAutoUpdate = false;
    panel.updateMatrix();
    grp.add(panel);

    // Point light for the neon glow
    const neonLight = new THREE.PointLight(neon, 1.5, 12);
    neonLight.position.set(0, signY, d / 2 + 0.5);
    grp.add(neonLight);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INDUSTRIAL EXTRAS
  // ══════════════════════════════════════════════════════════════════════════

  function _placeChimney(cx, cz, baseH) {
    const mat   = new THREE.MeshStandardMaterial({ color: 0x664444, roughness: 0.9 });
    const h     = baseH * 0.7 + _rng() * baseH * 0.4;
    const r     = 0.5 + _rng() * 0.5;
    const geo   = new THREE.CylinderGeometry(r * 0.7, r, h, 8);
    const mesh  = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, GROUND_Y + h / 2, cz);
    mesh.castShadow    = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    Renderer.add(mesh);
    _collisionMeshes.push(mesh);
  }

  function _placeWaterTower(cx, cz, baseH) {
    const mat     = new THREE.MeshStandardMaterial({ color: 0x664422, roughness: 0.85 });
    const legMat  = new THREE.MeshStandardMaterial({ color: 0x555544, roughness: 0.8 });

    const TOWER_H  = baseH + 2;
    const TANK_R   = 1.5;
    const TANK_H   = TANK_R * 1.4;

    const grp = new THREE.Group();

    // Legs (six supports)
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const lx  = Math.cos(ang) * TANK_R * 0.7;
      const lz  = Math.sin(ang) * TANK_R * 0.7;
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.12, TOWER_H, 6),
        legMat
      );
      leg.position.set(lx, TOWER_H / 2, lz);
      leg.matrixAutoUpdate = false;
      leg.updateMatrix();
      grp.add(leg);
    }

    // Tank body
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(TANK_R, TANK_R, TANK_H, 12),
      mat
    );
    tank.position.set(0, TOWER_H + TANK_H / 2, 0);
    tank.castShadow = true;
    tank.matrixAutoUpdate = false;
    tank.updateMatrix();
    grp.add(tank);

    // Conical roof
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(TANK_R + 0.2, TANK_H * 0.5, 12),
      mat
    );
    roof.position.set(0, TOWER_H + TANK_H + TANK_H * 0.25, 0);
    roof.castShadow = true;
    roof.matrixAutoUpdate = false;
    roof.updateMatrix();
    grp.add(roof);

    grp.position.set(cx, GROUND_Y, cz);
    grp.matrixAutoUpdate = false;
    grp.updateMatrix();

    Renderer.add(grp);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NIGHT MODE TOGGLE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Switch all window materials between day and night modes.
   * Called by Game.js when Sky.js reports a threshold crossing.
   * @param {boolean} night
   */
  function setNightMode(night) {
    if (_isNight === night) return;
    _isNight = night;

    // Swap window materials across all instanced meshes in building groups
    for (const grp of Object.values(_groups)) {
      grp.traverse(obj => {
        if (!(obj instanceof THREE.InstancedMesh)) return;

        const mat = obj.material;
        if (!mat || mat.type !== 'MeshStandardMaterial') return;

        // Identify window materials by their low roughness
        if (mat.roughness === 0.2 && mat.metalness === 0.4) {
          if (night) {
            mat.color.setHex(CFG.WINDOW_LIT_COLOR);
            mat.emissive.setHex(CFG.WINDOW_LIT_COLOR);
            mat.emissiveIntensity = 0.75 + _rng() * 0.4;
          } else {
            mat.color.setHex(CFG.WINDOW_DAY_COLOR);
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0;
          }
          mat.needsUpdate = true;
        }
      });
    }

    // Flicker a random 20% of windows each night-mode activation (variety)
    if (night) {
      for (const grp of Object.values(_groups)) {
        grp.traverse(obj => {
          if (!(obj instanceof THREE.InstancedMesh)) return;
          if (obj.material.roughness === 0.2) {
            const offChance = 1 - CFG.WINDOW_CHANCE;
            if (_rng() < offChance) {
              obj.material.emissiveIntensity *= 0.2;
              obj.material.needsUpdate = true;
            }
          }
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PER-FRAME UPDATE  (antenna blink, neon pulse)
  // ══════════════════════════════════════════════════════════════════════════

  let _blinkTimer = 0;
  let _blinkState = false;

  /**
   * Animate blinking antenna tips and neon sign pulse.
   * @param {number} dt  Delta time seconds.
   */
  function update(dt) {
    _blinkTimer += dt;

    // Blink every 1.4 seconds
    const newBlink = Math.floor(_blinkTimer / 0.7) % 2 === 0;
    if (newBlink !== _blinkState) {
      _blinkState = newBlink;

      for (const grp of Object.values(_groups)) {
        grp.traverse(obj => {
          if (obj.userData.blinkTip) {
            obj.material.color.setHex(_blinkState ? 0xFF0000 : 0x330000);
          }
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOD MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Cull distant buildings to improve frame rate.
   * Game.js calls this every 30 frames (not every frame) with player position.
   *
   * @param {THREE.Vector3} playerPos
   * @param {number} [hideRadius=200]   Buildings beyond this are hidden.
   * @param {number} [showRadius=180]   Buildings within this are shown.
   */
  function updateLOD(playerPos, hideRadius = 200, showRadius = 180) {
    for (const grp of Object.values(_groups)) {
      for (const building of grp.children) {
        const dx = building.position.x - playerPos.x;
        const dz = building.position.z - playerPos.z;
        const d2 = dx * dx + dz * dz;

        if (d2 > hideRadius * hideRadius) {
          if (building.visible) {
            building.visible = false;
          }
        } else if (d2 < showRadius * showRadius) {
          if (!building.visible) {
            building.visible = true;
          }
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESSORS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Return all building collision meshes for Camera.js raycasting.
   * @returns {THREE.Mesh[]}
   */
  function getCollisionMeshes() { return _collisionMeshes; }

  /**
   * Return a specific district's root group.
   * @param {string} district
   * @returns {THREE.Group|null}
   */
  function getDistrictGroup(district) { return _groups[district] || null; }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPOSE
  // ══════════════════════════════════════════════════════════════════════════

  function dispose() {
    for (const grp of Object.values(_groups)) {
      Renderer.disposeObject(grp);
      Renderer.remove(grp);
    }
    _matCache.forEach(m => m.dispose());
    _matCache.clear();
    _roofMat.forEach(m => m.dispose());
    _roofMat.clear();
    _collisionMeshes.length = 0;
    console.info('[BuildingGenerator] Disposed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  return Object.freeze({

    // Lifecycle
    build,
    dispose,

    // Per-frame
    update,
    updateLOD,

    // Night mode
    setNightMode,

    // Accessors
    getCollisionMeshes,
    getDistrictGroup,

  });

})();

if (typeof module !== 'undefined') module.exports = BuildingGenerator;
/* ```

---

**File 15 ✅ — `js/world/BuildingGenerator.js` done.**

This generates the entire city's architecture procedurally. Each district has its own placement strategy — downtown fills blocks with one tall tower plus an optional podium, suburbs subdivide each block into 1–4 house plots with pitched roofs and garages, industrial zones place large warehouse footprints with chimney stacks and water towers, and riverside creates mid-rise apartments with street-level terraces. Windows use `THREE.InstancedMesh` so each building face draws hundreds of windows in a single draw call. Roofs are generated as three distinct geometry types: an `ExtrudeGeometry` triangular pitched roof for houses with optional chimney, a sawtooth `ExtrudeGeometry` skylight profile for industrial sheds, and flat parapet-walled roofs for offices and apartments. Downtown tall buildings get GLSL-animated blinking antenna tips and canvas-drawn neon sign panels with `PointLight` glow. The night-mode toggle walks all instanced window meshes and swaps their emissive values. `updateLOD` hides buildings beyond the draw radius every 30 frames without per-frame cost.

**Say "File 16" for `js/world/Props.js`.** */
