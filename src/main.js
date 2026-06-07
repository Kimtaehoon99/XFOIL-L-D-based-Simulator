import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LD_POLAR, LD_STATS } from "./ldData.js";
import { BASELINE_AIRFOIL_COORDS } from "./baselineAirfoilCoordinates.js";
import { KYFOIL_COORDS } from "./kyfoilCoordinates.js";

const AIRCRAFT_SPEC = {
  name: "Star-X VTOL-4910HP",
  dataLinkRangeLabel: "50-200 km",
  cruiseMinKmh: 80,
  cruiseKmh: 100,
  cruiseMaxKmh: 110,
  maxSpeedKmh: 130,
  enduranceHours: 12,
  wingspanM: 4.91,
  lengthM: 2.84,
  mtowKg: 64,
  payloadLabel: "5-20 kg",
  propulsionLabel: "120-170cc EFI / 중유 엔진",
  sourceLabel: "첨부 재원표"
};

const MAP_CONFIG = {
  centerLon: 130.6,
  centerLat: 33.55,
  worldScale: 13.5,
  osmZoom: 7,
  bounds: {
    west: 125.15,
    east: 135.85,
    south: 26.35,
    north: 38.85
  }
};

const KOREA_MAINLAND_LON_LAT = [
  [126.15, 38.56],
  [126.7, 38.5],
  [127.2, 38.32],
  [127.74, 38.43],
  [128.3, 38.31],
  [128.62, 38.03],
  [128.42, 37.63],
  [128.75, 37.16],
  [129.1, 36.76],
  [129.35, 36.18],
  [129.48, 35.66],
  [129.34, 35.23],
  [128.91, 35.06],
  [128.48, 35.08],
  [128.07, 34.82],
  [127.55, 34.55],
  [127.08, 34.44],
  [126.62, 34.28],
  [126.18, 34.52],
  [126.03, 34.94],
  [125.78, 35.25],
  [126.03, 35.62],
  [125.78, 36.06],
  [126.19, 36.4],
  [126.1, 36.85],
  [126.43, 37.16],
  [126.2, 37.55],
  [126.53, 37.82],
  [126.13, 38.18]
];

const state = {
  baselineKm: getBaselineKm(),
  gainPct: LD_STATS.gainPct,
  speed: 1,
  paused: false,
  elapsed: 0,
  progress: 0,
  cameraFollow: true,
  showAirfoil: false
};

const dom = {
  sceneRoot: document.querySelector("#scene-root"),
  topBaseline: document.querySelector("#topBaseline"),
  topOptimized: document.querySelector("#topOptimized"),
  topGain: document.querySelector("#topGain"),
  playToggle: document.querySelector("#playToggle"),
  playIcon: document.querySelector("#playIcon"),
  resetSim: document.querySelector("#resetSim"),
  resetView: document.querySelector("#resetView"),
  simStatus: document.querySelector("#simStatus"),
  aircraftName: document.querySelector("#aircraftName"),
  specRange: document.querySelector("#specRange"),
  specCruise: document.querySelector("#specCruise"),
  specMtow: document.querySelector("#specMtow"),
  specEndurance: document.querySelector("#specEndurance"),
  specPayload: document.querySelector("#specPayload"),
  specDatalink: document.querySelector("#specDatalink"),
  specSize: document.querySelector("#specSize"),
  specPropulsion: document.querySelector("#specPropulsion"),
  deltaRange: document.querySelector("#deltaRange"),
  deltaEndurance: document.querySelector("#deltaEndurance"),
  modelNote: document.querySelector("#modelNote"),
  gainRange: document.querySelector("#gainRange"),
  gainNumber: document.querySelector("#gainNumber"),
  speedRange: document.querySelector("#speedRange"),
  speedReadout: document.querySelector("#speedReadout"),
  cameraFollow: document.querySelector("#cameraFollow"),
  showAirfoil: document.querySelector("#showAirfoil"),
  baselineBar: document.querySelector("#baselineBar"),
  optimizedBar: document.querySelector("#optimizedBar"),
  baselineProgressText: document.querySelector("#baselineProgressText"),
  optimizedProgressText: document.querySelector("#optimizedProgressText"),
  airfoilSvg: document.querySelector("#airfoilSvg")
};

const colors = {
  baseline: 0x50a7ff,
  optimized: 0xe84134,
  terrain: 0x4f8b62,
  terrainDark: 0x244b38,
  water: 0x527a7c,
  runway: 0x2c3432,
  red: 0xe45d4f,
  text: "#f4f7f4"
};

let renderer;
let scene;
let camera;
let controls;
let clock;
let world;
let routeGroup;
let baselinePlane;
let optimizedPlane;
let baselineLabel;
let optimizedLabel;
let baselineLimitMarker;
let optimizedLimitMarker;
let airfoilCompareGroup;
let mainRouteCurve;
let baselineCurve;
let optimizedCurve;
let cameraTarget = new THREE.Vector3(0, 0, 0);

init();

function init() {
  setupThree();
  createWorld();
  createAircraft();
  createAirfoilComparison();
  buildRoutes();
  drawAirfoilSvg();
  syncInitialGainInputs();
  bindControls();
  updateMetrics();
  renderer.setAnimationLoop(animate);
}

function syncInitialGainInputs() {
  const value = state.gainPct.toFixed(1);
  dom.gainRange.value = value;
  dom.gainNumber.value = value;
}

function setupThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdbe4df);
  scene.fog = new THREE.Fog(0xdbe4df, 165, 420);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(dom.sceneRoot.clientWidth, dom.sceneRoot.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  dom.sceneRoot.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(
    48,
    dom.sceneRoot.clientWidth / dom.sceneRoot.clientHeight,
    0.1,
    500
  );
  resetCamera();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 52;
  controls.maxDistance = 340;
  controls.target.set(-12, 0, 4);

  const hemi = new THREE.HemisphereLight(0xf4fbff, 0x375a46, 2.4);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 3.2);
  sun.position.set(-36, 78, 42);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  scene.add(sun);

  clock = new THREE.Clock();
  window.addEventListener("resize", handleResize);
}

function resetCamera() {
  camera.position.set(-26, 138, 188);
  camera.lookAt(-10, 0, 6);
  cameraTarget.set(-10, 0, 6);
}

function createWorld() {
  world = new THREE.Group();
  scene.add(world);

  const mapSpan = getMapWorldSpan();
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(mapSpan.width + 64, mapSpan.height + 64, 1, 1),
    new THREE.MeshStandardMaterial({
      color: colors.water,
      roughness: 0.76,
      metalness: 0.08
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -2.55;
  water.receiveShadow = true;
  world.add(water);

  const grid = new THREE.GridHelper(Math.max(mapSpan.width, mapSpan.height) + 54, 28, 0xc4d3cd, 0x8ba29a);
  grid.position.y = -2.48;
  grid.material.opacity = 0.12;
  grid.material.transparent = true;
  world.add(grid);

  createOsmMapLayer();
  createMainland();
  createIsland("제주", 126.53, 33.38, 4.7, 2.1, 0.55);
  createCityMarkers();
  createMapDetails();
  createCompass();
}

function getMapWorldSpan() {
  const bounds = MAP_CONFIG.bounds;
  return {
    width: (bounds.east - bounds.west) * MAP_CONFIG.worldScale,
    height: (bounds.north - bounds.south) * MAP_CONFIG.worldScale
  };
}

function createOsmMapLayer() {
  const canvas = createFallbackMapCanvas();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const bounds = MAP_CONFIG.bounds;
  const west = lonLatToWorld(bounds.west, MAP_CONFIG.centerLat);
  const east = lonLatToWorld(bounds.east, MAP_CONFIG.centerLat);
  const north = lonLatToWorld(MAP_CONFIG.centerLon, bounds.north);
  const south = lonLatToWorld(MAP_CONFIG.centerLon, bounds.south);

  const map = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.abs(east.x - west.x), Math.abs(south.z - north.z)),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.96,
      depthWrite: false
    })
  );
  map.rotation.x = -Math.PI / 2;
  map.position.set((west.x + east.x) * 0.5, 0.06, (north.z + south.z) * 0.5);
  map.renderOrder = 0;
  world.add(map);

  loadOsmTilesToCanvas(canvas, texture);
}

function createFallbackMapCanvas() {
  const bounds = MAP_CONFIG.bounds;
  const canvas = document.createElement("canvas");
  const worldWidth = (bounds.east - bounds.west) * MAP_CONFIG.worldScale;
  const worldHeight = (bounds.north - bounds.south) * MAP_CONFIG.worldScale;
  canvas.width = 1280;
  canvas.height = Math.round(canvas.width * (worldHeight / worldWidth));

  const context = canvas.getContext("2d");
  const toCanvas = (lon, lat) => lonLatToCanvas(lon, lat, canvas);

  context.fillStyle = "#8ed4df";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const coastGradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  coastGradient.addColorStop(0, "#e8ecd9");
  coastGradient.addColorStop(0.42, "#cce8c8");
  coastGradient.addColorStop(1, "#a8d3b5");
  context.fillStyle = coastGradient;
  drawCanvasPolygon(context, KOREA_MAINLAND_LON_LAT.map(([lon, lat]) => toCanvas(lon, lat)));
  context.fill();
  context.strokeStyle = "rgba(72, 107, 96, 0.75)";
  context.lineWidth = 3;
  context.stroke();

  drawCanvasIsland(context, 126.53, 33.38, 0.33, 0.16, canvas, "#bedfac");

  [
    [[126.98, 37.57], [127.38, 36.35], [128.6, 35.87], [129.08, 35.18]],
    [[126.63, 37.46], [126.72, 36.68], [126.72, 35.96], [126.62, 35.23], [126.39, 34.81]],
    [[126.98, 37.57], [127.93, 37.34], [128.73, 36.89], [128.6, 35.87]],
    [[127.38, 36.35], [127.15, 35.82], [126.85, 35.16], [126.39, 34.81]],
    [[128.6, 35.87], [129.08, 35.18], [129.35, 35.54], [129.37, 36.41]]
  ].forEach((road) => drawCanvasPath(context, road, canvas, "#d8d4c5", 5, 0.9));

  [
    [[126.5, 37.52], [126.98, 37.57], [127.45, 37.54], [127.8, 37.47]],
    [[127.35, 36.68], [127.38, 36.35], [126.92, 36.0], [126.72, 35.82]],
    [[128.78, 36.55], [128.6, 35.87], [128.62, 35.4], [128.88, 35.12]]
  ].forEach((river) => drawCanvasPath(context, river, canvas, "#65b8d8", 4, 0.8));

  [
    ["서울", 126.98, 37.57],
    ["대전", 127.38, 36.35],
    ["대구", 128.6, 35.87],
    ["부산", 129.08, 35.18],
    ["광주", 126.85, 35.16],
    ["제주", 126.53, 33.38]
  ].forEach(([name, lon, lat]) => drawCanvasCityLabel(context, name, lon, lat, canvas));

  return canvas;
}

function loadOsmTilesToCanvas(canvas, texture) {
  const bounds = MAP_CONFIG.bounds;
  const zoom = MAP_CONFIG.osmZoom;
  const minX = lonToTileX(bounds.west, zoom);
  const maxX = lonToTileX(bounds.east, zoom);
  const minY = latToTileY(bounds.north, zoom);
  const maxY = latToTileY(bounds.south, zoom);
  const context = canvas.getContext("2d");

  for (let tileX = minX; tileX <= maxX; tileX += 1) {
    for (let tileY = minY; tileY <= maxY; tileY += 1) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        const west = tileXToLon(tileX, zoom);
        const east = tileXToLon(tileX + 1, zoom);
        const north = tileYToLat(tileY, zoom);
        const south = tileYToLat(tileY + 1, zoom);
        const topLeft = lonLatToCanvas(west, north, canvas);
        const bottomRight = lonLatToCanvas(east, south, canvas);
        context.drawImage(
          image,
          topLeft.x,
          topLeft.y,
          bottomRight.x - topLeft.x,
          bottomRight.y - topLeft.y
        );
        texture.needsUpdate = true;
      };
      image.src = `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;
    }
  }
}

function lonLatToCanvas(lon, lat, canvas) {
  const bounds = MAP_CONFIG.bounds;
  return {
    x: ((lon - bounds.west) / (bounds.east - bounds.west)) * canvas.width,
    y: ((bounds.north - lat) / (bounds.north - bounds.south)) * canvas.height
  };
}

function drawCanvasPolygon(context, points) {
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.closePath();
}

function drawCanvasIsland(context, lon, lat, radiusLon, radiusLat, canvas, fill) {
  const center = lonLatToCanvas(lon, lat, canvas);
  const radius = lonLatToCanvas(lon + radiusLon, lat - radiusLat, canvas);
  context.beginPath();
  context.ellipse(
    center.x,
    center.y,
    Math.abs(radius.x - center.x),
    Math.abs(radius.y - center.y),
    -0.08,
    0,
    Math.PI * 2
  );
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = "rgba(72, 107, 96, 0.62)";
  context.lineWidth = 2;
  context.stroke();
}

function drawCanvasPath(context, lonLatPoints, canvas, color, width, opacity) {
  context.save();
  context.globalAlpha = opacity;
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  lonLatPoints.forEach(([lon, lat], index) => {
    const point = lonLatToCanvas(lon, lat, canvas);
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.stroke();
  context.restore();
}

function drawCanvasCityLabel(context, name, lon, lat, canvas) {
  const point = lonLatToCanvas(lon, lat, canvas);
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(point.x, point.y, 5, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(48, 61, 56, 0.7)";
  context.lineWidth = 2;
  context.stroke();

  context.font = "700 24px Inter, system-ui, sans-serif";
  context.lineWidth = 5;
  context.strokeStyle = "rgba(255, 255, 255, 0.9)";
  context.fillStyle = "#26362f";
  context.strokeText(name, point.x + 10, point.y - 8);
  context.fillText(name, point.x + 10, point.y - 8);
}

function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat, zoom) {
  const rad = THREE.MathUtils.degToRad(lat);
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom);
}

function tileXToLon(x, zoom) {
  return (x / 2 ** zoom) * 360 - 180;
}

function tileYToLat(y, zoom) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
  return THREE.MathUtils.radToDeg(Math.atan(Math.sinh(n)));
}

function createMainland() {
  const mainlandLonLat = KOREA_MAINLAND_LON_LAT;

  const worldPoints = mainlandLonLat.map(([lon, lat]) => lonLatToWorld(lon, lat));
  const shape = makeShape(worldPoints);
  const terrain = new THREE.ShapeGeometry(shape, 18);
  const pos = terrain.attributes.position;

  for (let index = 0; index < pos.count; index += 1) {
    const x = pos.getX(index);
    const z = -pos.getY(index);
    pos.setZ(index, terrainHeight(x, z));
  }

  terrain.rotateX(-Math.PI / 2);
  terrain.computeVertexNormals();

  const top = new THREE.Mesh(
    terrain,
    new THREE.MeshStandardMaterial({
      color: colors.terrain,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      roughness: 0.72,
      metalness: 0.04
    })
  );
  top.receiveShadow = true;
  top.castShadow = true;
  world.add(top);

  const base = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 2.4,
      bevelEnabled: false,
      curveSegments: 1
    }),
    new THREE.MeshStandardMaterial({
      color: colors.terrainDark,
      roughness: 0.8
    })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -2.4;
  base.receiveShadow = true;
  world.add(base);

  const coast = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(worldPoints.map((p) => new THREE.Vector3(p.x, 0.32, p.z))),
    new THREE.LineBasicMaterial({ color: 0xf3f4d2, transparent: true, opacity: 0.8 })
  );
  world.add(coast);

  addMountainRidge();
}

function createIsland(name, lon, lat, radiusX, radiusZ, height) {
  const center = lonLatToWorld(lon, lat);
  const points = [];
  const segments = 36;

  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const wobble = 1 + Math.sin(angle * 3.2 + lon) * 0.08;
    points.push({
      x: center.x + Math.cos(angle) * radiusX * wobble,
      z: center.z + Math.sin(angle) * radiusZ * wobble
    });
  }

  const shape = makeShape(points);
  const geometry = new THREE.ShapeGeometry(shape, 8);
  const pos = geometry.attributes.position;

  for (let index = 0; index < pos.count; index += 1) {
    const x = pos.getX(index);
    const z = -pos.getY(index);
    const dx = (x - center.x) / radiusX;
    const dz = (z - center.z) / radiusZ;
    pos.setZ(index, Math.max(0.2, (1 - Math.min(1, dx * dx + dz * dz)) * height + 0.25));
  }

  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  const top = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0x4a8258, roughness: 0.75 })
  );
  top.castShadow = true;
  top.receiveShadow = true;
  world.add(top);

  const edge = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, 0.2, p.z))),
    new THREE.LineBasicMaterial({ color: 0xf3f4d2, transparent: true, opacity: 0.7 })
  );
  world.add(edge);

  if (radiusX > 0.5) {
    addLabel(name, new THREE.Vector3(center.x, 3.2 + height, center.z), 0xf4f7f4, 5.6);
  }
}

function addMountainRidge() {
  const ridgeLonLat = [
    [128.1, 38.0, 4.8],
    [128.32, 37.55, 5.2],
    [128.36, 37.1, 4.9],
    [128.55, 36.72, 4.4],
    [128.36, 36.2, 3.9],
    [128.2, 35.82, 3.3]
  ];

  ridgeLonLat.forEach(([lon, lat, height]) => {
    const p = lonLatToWorld(lon, lat);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(height * 0.72, height, 5),
      new THREE.MeshStandardMaterial({ color: 0x6e9468, roughness: 0.86 })
    );
    cone.position.set(p.x, height * 0.5 + 0.6, p.z);
    cone.rotation.y = Math.random() * Math.PI;
    cone.castShadow = true;
    cone.receiveShadow = true;
    world.add(cone);
  });
}

function createCityMarkers() {
  [
    ["서울", 126.98, 37.57],
    ["대전", 127.38, 36.35],
    ["대구", 128.6, 35.87],
    ["부산", 129.08, 35.18],
    ["광주", 126.85, 35.16]
  ].forEach(([name, lon, lat]) => {
    const p = lonLatToWorld(lon, lat);
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 1.3, 18),
      new THREE.MeshStandardMaterial({ color: 0xf4f7f4, roughness: 0.5 })
    );
    marker.position.set(p.x, 1.15, p.z);
    marker.castShadow = true;
    world.add(marker);
    addLabel(name, new THREE.Vector3(p.x, 4.5, p.z), 0x203029, 4.8);
  });
}

function createMapDetails() {
  const roadColor = 0xc5cad2;
  const expressColor = 0x9aa9c4;
  const riverColor = 0x5fb8df;

  [
    [[126.98, 37.57], [127.38, 36.35], [128.6, 35.87], [129.08, 35.18]],
    [[126.63, 37.46], [126.72, 36.68], [126.72, 35.96], [126.62, 35.23], [126.39, 34.81]],
    [[126.98, 37.57], [127.93, 37.34], [128.73, 36.89], [128.73, 36.57], [128.6, 35.87]],
    [[127.38, 36.35], [127.15, 35.82], [126.85, 35.16], [126.39, 34.81]],
    [[129.08, 35.18], [129.32, 35.54], [129.36, 36.0], [129.37, 36.41]],
    [[127.38, 36.35], [127.72, 36.72], [128.25, 36.58], [129.37, 36.41]]
  ].forEach((road) => addGroundPolyline(road, roadColor, 0.055, 1.25));

  [
    [[126.98, 37.57], [127.15, 37.0], [127.38, 36.35], [127.93, 36.02], [128.6, 35.87], [129.08, 35.18]],
    [[126.98, 37.57], [127.22, 37.85], [128.2, 37.76], [128.9, 37.75]],
    [[127.38, 36.35], [126.97, 35.82], [126.85, 35.16], [126.39, 34.81]],
    [[128.6, 35.87], [129.11, 35.99], [129.37, 36.41]]
  ].forEach((road) => addGroundPolyline(road, expressColor, 0.055, 1.22));

  [
    [[126.5, 37.52], [126.98, 37.57], [127.45, 37.54], [127.8, 37.47]],
    [[127.35, 36.68], [127.38, 36.35], [126.92, 36.0], [126.72, 35.82]],
    [[128.78, 36.55], [128.6, 35.87], [128.62, 35.4], [128.88, 35.12]]
  ].forEach((river) => addGroundPolyline(river, riverColor, 0.05, 1.32, 0.82));

  [
    ["서울", 126.98, 37.57, 5.6],
    ["인천", 126.63, 37.46, 4.4],
    ["수원", 127.03, 37.26, 4.2],
    ["춘천", 127.73, 37.88, 4.2],
    ["강릉", 128.9, 37.75, 4.4],
    ["청주", 127.49, 36.64, 4.4],
    ["대전", 127.38, 36.35, 5.0],
    ["전주", 127.15, 35.82, 4.5],
    ["광주", 126.85, 35.16, 5.0],
    ["목포", 126.39, 34.81, 4.3],
    ["대구", 128.6, 35.87, 5.0],
    ["포항", 129.37, 36.03, 4.5],
    ["울산", 129.31, 35.54, 4.4],
    ["창원", 128.68, 35.23, 4.3],
    ["부산", 129.08, 35.18, 5.2],
    ["여수", 127.66, 34.76, 4.2],
    ["제주", 126.53, 33.38, 4.5]
  ].forEach(([name, lon, lat, scale]) => addMapPointLabel(name, lon, lat, scale));
}

function addGroundPolyline(lonLatPoints, color, radius = 0.05, y = 1.2, opacity = 0.72) {
  const points = lonLatPoints.map(([lon, lat]) => {
    const p = lonLatToWorld(lon, lat);
    return new THREE.Vector3(p.x, y, p.z);
  });
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.18);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(24, points.length * 18), radius, 6, false),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity })
  );
  world.add(mesh);
}

function addMapPointLabel(name, lon, lat, scale = 4.5) {
  const p = lonLatToWorld(lon, lat);
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.65, 12),
    new THREE.MeshBasicMaterial({ color: 0xf5f7f2 })
  );
  marker.position.set(p.x, 1.45, p.z);
  world.add(marker);
  addLabel(name, new THREE.Vector3(p.x, 4.2, p.z), 0x26362f, scale);
}

function createCompass() {
  const group = new THREE.Group();
  group.position.set(47, 0.4, -64);
  world.add(group);

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 7),
      new THREE.Vector3(0, 0, -7)
    ]),
    new THREE.LineBasicMaterial({ color: 0xf4f7f4, transparent: true, opacity: 0.74 })
  );
  group.add(line);

  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, 3.6, 3),
    new THREE.MeshBasicMaterial({ color: 0xf4f7f4 })
  );
  arrow.position.z = -8.3;
  arrow.rotation.x = Math.PI / 2;
  group.add(arrow);
  addLabel("N", new THREE.Vector3(47, 5.5, -75), 0xf4f7f4, 4.6);
}

function lonLatToWorld(lon, lat) {
  return {
    x: (lon - MAP_CONFIG.centerLon) * MAP_CONFIG.worldScale,
    z: -(lat - MAP_CONFIG.centerLat) * MAP_CONFIG.worldScale
  };
}

function makeShape(points) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, -points[0].z);

  for (let index = 1; index < points.length; index += 1) {
    shape.lineTo(points[index].x, -points[index].z);
  }

  shape.closePath();
  return shape;
}

function terrainHeight(x, z) {
  const eastLift = THREE.MathUtils.smoothstep(x, -18, 28);
  const centralBand = Math.exp(-Math.pow((x - 4) / 28, 2)) * Math.exp(-Math.pow((z + 6) / 55, 2));
  const wave = Math.sin(x * 0.21 + z * 0.08) * 0.4 + Math.cos(z * 0.17) * 0.28;
  return 0.55 + eastLift * 1.15 + centralBand * 1.05 + wave;
}

function createAircraft() {
  baselinePlane = makeAircraft(colors.baseline, 0x284f72, {
    optimizedWing: false,
    label: "Star-X Baseline"
  });
  optimizedPlane = makeAircraft(colors.optimized, 0x7b1f1f, {
    optimizedWing: true,
    label: "Optimized airfoil"
  });
  scene.add(baselinePlane, optimizedPlane);

  baselineLabel = addLabel("Baseline", new THREE.Vector3(0, 0, 0), colors.baseline, 5.4, scene);
  optimizedLabel = addLabel("Optimized", new THREE.Vector3(0, 0, 0), colors.optimized, 5.4, scene);
}

function makeAircraft(primary, secondary, options = {}) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.31, 4.7, 18),
    new THREE.MeshStandardMaterial({ color: primary, roughness: 0.36, metalness: 0.22 })
  );
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  group.add(body);

  const avionicsFairing = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.34, 1.05),
    new THREE.MeshStandardMaterial({ color: 0xf2f0df, roughness: 0.48, metalness: 0.06 })
  );
  avionicsFairing.position.set(0, 0.28, 0.54);
  avionicsFairing.castShadow = true;
  group.add(avionicsFairing);

  const payloadPod = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.28, 0.86),
    new THREE.MeshStandardMaterial({ color: 0x29332f, roughness: 0.5, metalness: 0.16 })
  );
  payloadPod.position.set(0, -0.25, 0.25);
  payloadPod.castShadow = true;
  group.add(payloadPod);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.31, 0.75, 18),
    new THREE.MeshStandardMaterial({ color: 0xf7f5e8, roughness: 0.32, metalness: 0.18 })
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 2.72;
  nose.castShadow = true;
  group.add(nose);

  const wing = makeWingMesh(primary, options.optimizedWing);
  wing.position.set(0, 0.72, 0.1);
  group.add(wing);

  const leftBoom = makeStrut(new THREE.Vector3(-1.55, 0.46, -0.15), new THREE.Vector3(-1.42, 0.28, -2.62), secondary, 0.045);
  const rightBoom = makeStrut(new THREE.Vector3(1.55, 0.46, -0.15), new THREE.Vector3(1.42, 0.28, -2.62), secondary, 0.045);
  const leftRotorRail = makeStrut(new THREE.Vector3(-3.16, 0.88, -1.16), new THREE.Vector3(-3.16, 0.88, 1.24), secondary, 0.05);
  const rightRotorRail = makeStrut(new THREE.Vector3(3.16, 0.88, -1.16), new THREE.Vector3(3.16, 0.88, 1.24), secondary, 0.05);
  group.add(leftBoom, rightBoom, leftRotorRail, rightRotorRail);

  const tailWing = new THREE.Mesh(
    new THREE.BoxGeometry(2.85, 0.1, 0.46),
    new THREE.MeshStandardMaterial({ color: secondary, roughness: 0.46, metalness: 0.18 })
  );
  tailWing.position.set(0, 0.3, -2.62);
  tailWing.castShadow = true;
  group.add(tailWing);

  [-1, 1].forEach((side) => {
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.78, 0.42),
      new THREE.MeshStandardMaterial({ color: secondary, roughness: 0.5, metalness: 0.18 })
    );
    fin.position.set(side * 1.42, 0.68, -2.62);
    fin.castShadow = true;
    group.add(fin);
  });

  [-1, 1].forEach((side) => {
    [-1, 1].forEach((foreAft) => {
      const rotor = makeVtolRotor(primary, secondary);
      rotor.position.set(side * 3.16, 1.02, foreAft * 1.18);
      group.add(rotor);
    });
  });

  const pusherProp = makePusherPropeller(secondary);
  pusherProp.position.set(0, 0, -2.92);
  group.add(pusherProp);

  const tailCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.25, 0.52, 18),
    new THREE.MeshStandardMaterial({ color: secondary, roughness: 0.5, metalness: 0.18 })
  );
  tailCone.rotation.x = -Math.PI / 2;
  tailCone.position.z = -2.36;
  tailCone.castShadow = true;
  group.add(tailCone);

  group.scale.setScalar(1.12);
  return group;
}

function makeWingMesh(color, optimizedWing) {
  const profile = optimizedWing ? KYFOIL_COORDS : BASELINE_AIRFOIL_COORDS;
  const spanSegments = 8;
  const span = 7.55;
  const chord = optimizedWing ? 1.42 : 1.28;
  const yScale = optimizedWing ? 4.8 : 4.2;
  const vertices = [];
  const indices = [];

  for (let s = 0; s <= spanSegments; s += 1) {
    const u = s / spanSegments;
    const x = (u - 0.5) * span;
    const taper = 1 - Math.abs(u - 0.5) * 0.18;
    const dihedral = Math.abs(x) * 0.035;

    profile.forEach((point) => {
      vertices.push(
        x,
        point.y * chord * yScale + dihedral,
        (0.5 - point.x) * chord * taper
      );
    });
  }

  const ring = profile.length;
  for (let s = 0; s < spanSegments; s += 1) {
    const base = s * ring;
    const next = (s + 1) * ring;
    for (let p = 0; p < ring; p += 1) {
      const a = base + p;
      const b = base + ((p + 1) % ring);
      const c = next + p;
      const d = next + ((p + 1) % ring);
      indices.push(a, c, b, b, c, d);
    }
  }

  const firstCenter = addRingCenterVertex(vertices, 0, ring);
  const lastCenter = addRingCenterVertex(vertices, spanSegments * ring, ring);
  const lastBase = spanSegments * ring;

  for (let p = 0; p < ring; p += 1) {
    const next = (p + 1) % ring;
    indices.push(firstCenter, next, p);
    indices.push(lastCenter, lastBase + p, lastBase + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const wingSurface = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness: optimizedWing ? 0.34 : 0.48,
      metalness: optimizedWing ? 0.26 : 0.14
    })
  );
  wingSurface.castShadow = true;
  wingSurface.receiveShadow = true;

  const group = new THREE.Group();
  group.add(wingSurface);

  const tipTaper = 1 - 0.5 * 0.18;
  const tipDihedral = (span / 2) * 0.035;
  group.add(makeWingTipCap(profile, color, -span / 2, chord, yScale, tipTaper, tipDihedral, -1));
  group.add(makeWingTipCap(profile, color, span / 2, chord, yScale, tipTaper, tipDihedral, 1));
  return group;
}

function addRingCenterVertex(vertices, baseIndex, ringSize) {
  const center = new THREE.Vector3();

  for (let index = 0; index < ringSize; index += 1) {
    const offset = (baseIndex + index) * 3;
    center.x += vertices[offset];
    center.y += vertices[offset + 1];
    center.z += vertices[offset + 2];
  }

  center.divideScalar(ringSize);
  vertices.push(center.x, center.y, center.z);
  return vertices.length / 3 - 1;
}

function makeWingTipCap(profilePoints, color, x, chord, yScale, taper, dihedral, side) {
  const group = new THREE.Group();

  const points = profilePoints.map(
    (point) => new THREE.Vector3(
      x + side * 0.012,
      point.y * chord * yScale + dihedral,
      (0.5 - point.x) * chord * taper
    )
  );

  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  const vertices = [center.x, center.y, center.z];
  const indices = [];

  points.forEach((point) => vertices.push(point.x, point.y, point.z));
  for (let index = 0; index < points.length; index += 1) {
    const next = index === points.length - 1 ? 1 : index + 2;
    indices.push(0, index + 1, next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const cap = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.34,
      metalness: 0.14,
      side: THREE.DoubleSide
    })
  );
  cap.castShadow = true;
  cap.receiveShadow = true;

  const outline = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([...points, points[0]], true, "catmullrom", 0.42), 128, 0.025, 6, true),
    new THREE.MeshBasicMaterial({ color: 0x101513 })
  );

  group.add(cap, outline);
  return group;
}

function makeVtolRotor(primary, secondary) {
  const group = new THREE.Group();

  const motor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.18, 14),
    new THREE.MeshStandardMaterial({ color: secondary, roughness: 0.42, metalness: 0.22 })
  );
  motor.castShadow = true;
  group.add(motor);

  const bladeGroup = new THREE.Group();
  bladeGroup.userData.spinAxis = "y";

  const bladeMaterial = new THREE.MeshBasicMaterial({ color: 0x1d2824 });
  const bladeX = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.035, 0.08), bladeMaterial);
  const bladeZ = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 1.2), bladeMaterial);
  bladeX.castShadow = true;
  bladeZ.castShadow = true;
  bladeGroup.add(bladeX, bladeZ);
  bladeGroup.position.y = 0.16;
  group.add(bladeGroup);

  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 8),
    new THREE.MeshStandardMaterial({ color: primary, roughness: 0.34, metalness: 0.2 })
  );
  hub.position.y = 0.16;
  hub.castShadow = true;
  group.add(hub);

  return group;
}

function makePusherPropeller(color) {
  const group = new THREE.Group();
  group.userData.spinAxis = "z";

  const bladeMaterial = new THREE.MeshBasicMaterial({ color: 0x1d2824 });
  const verticalBlade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 0.045), bladeMaterial);
  const angledBlade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 0.045), bladeMaterial);
  angledBlade.rotation.z = Math.PI / 2;
  group.add(verticalBlade, angledBlade);

  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0.22 })
  );
  group.add(hub);

  return group;
}

function makeStrut(start, end, color, radius = 0.035) {
  const delta = new THREE.Vector3().subVectors(end, start);
  const strut = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, delta.length(), 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.16 })
  );
  strut.position.copy(start).add(end).multiplyScalar(0.5);
  strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  strut.castShadow = true;
  return strut;
}

function createAirfoilComparison() {
  airfoilCompareGroup = new THREE.Group();
  airfoilCompareGroup.position.set(41, 10, 28);
  airfoilCompareGroup.rotation.y = -0.58;
  airfoilCompareGroup.visible = state.showAirfoil;
  scene.add(airfoilCompareGroup);

  const baseline = makeAirfoilMesh(
    { points: BASELINE_AIRFOIL_COORDS, chord: 18, depth: 2.5, yScale: 3.6 },
    colors.baseline
  );
  baseline.position.y = 7;

  const optimized = makeAirfoilMesh(
    { points: KYFOIL_COORDS, chord: 18, depth: 2.5, yScale: 3.6 },
    colors.optimized
  );
  optimized.position.y = -7;

  airfoilCompareGroup.add(baseline, optimized);

  const guide = new THREE.Mesh(
    new THREE.BoxGeometry(20.5, 0.08, 3.4),
    new THREE.MeshStandardMaterial({ color: 0x24302c, transparent: true, opacity: 0.6 })
  );
  guide.position.set(9, -10.6, 1.25);
  airfoilCompareGroup.add(guide);

  addLabel("Baseline coords", new THREE.Vector3(41, 23.8, 28), colors.baseline, 4.7, scene);
  addLabel(`KYfoil ${formatPercent(LD_STATS.gainPct)}`, new THREE.Vector3(41, 4.2, 28), colors.optimized, 4.7, scene);
}

function makeAirfoilMesh(config, color) {
  const points = config.points || makeAirfoilPoints(config.thickness, config.camber, 0.42, 72);
  const shape = new THREE.Shape();
  const yScale = config.yScale || 3.6;

  points.forEach((point, index) => {
    const x = point.x * config.chord;
    const y = point.y * config.chord * yScale;

    if (index === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  });

  shape.closePath();

  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: config.depth,
      bevelEnabled: true,
      bevelSize: 0.08,
      bevelThickness: 0.08,
      bevelSegments: 2
    }),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.42,
      metalness: 0.18
    })
  );

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildRoutes() {
  if (routeGroup) {
    routeGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    scene.remove(routeGroup);
  }

  routeGroup = new THREE.Group();
  scene.add(routeGroup);

  const points = makeStraightRouteFromSeoul(getOptimizedKm());

  mainRouteCurve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.26);
  baselineCurve = new THREE.CatmullRomCurve3(offsetRoute(points, -5.2), false, "catmullrom", 0.2);
  optimizedCurve = new THREE.CatmullRomCurve3(offsetRoute(points, 5.2), false, "catmullrom", 0.2);

  const baselineFraction = getBaselineFraction();
  addRouteLine(baselineCurve, baselineFraction, colors.baseline, 0.84);
  addRouteLine(optimizedCurve, 1, colors.optimized, 0.9);
  addRouteLine(mainRouteCurve, 1, 0xffffff, 0.18);

  baselineLimitMarker = makeLimitMarker(colors.baseline, "Baseline 한계");
  optimizedLimitMarker = makeLimitMarker(colors.optimized, "Optimized 도달");
  routeGroup.add(baselineLimitMarker, optimizedLimitMarker);
  positionLimitMarkers();
}

function routePoint(lon, lat, altitude) {
  const p = lonLatToWorld(lon, lat);
  return new THREE.Vector3(p.x, altitude, p.z);
}

function makeStraightRouteFromSeoul(distanceKm) {
  const start = { lon: 126.98, lat: 37.57 };
  const busan = { lon: 129.08, lat: 35.18 };
  const bearingDeg = bearingBetween(start.lon, start.lat, busan.lon, busan.lat);
  const segments = 8;
  const points = [];

  for (let index = 0; index <= segments; index += 1) {
    const fraction = index / segments;
    const destination = destinationPoint(start.lon, start.lat, bearingDeg, distanceKm * fraction);
    points.push(routePoint(destination.lon, destination.lat, 13.2 + Math.sin(fraction * Math.PI) * 1.1));
  }

  return points;
}

function bearingBetween(lon1Deg, lat1Deg, lon2Deg, lat2Deg) {
  const lon1 = THREE.MathUtils.degToRad(lon1Deg);
  const lat1 = THREE.MathUtils.degToRad(lat1Deg);
  const lon2 = THREE.MathUtils.degToRad(lon2Deg);
  const lat2 = THREE.MathUtils.degToRad(lat2Deg);
  const deltaLon = lon2 - lon1;
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return (THREE.MathUtils.radToDeg(Math.atan2(y, x)) + 360) % 360;
}

function destinationPoint(lonDeg, latDeg, bearingDeg, distanceKm) {
  const radiusKm = 6371;
  const angularDistance = distanceKm / radiusKm;
  const bearing = THREE.MathUtils.degToRad(bearingDeg);
  const lat1 = THREE.MathUtils.degToRad(latDeg);
  const lon1 = THREE.MathUtils.degToRad(lonDeg);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lon: THREE.MathUtils.radToDeg(lon2),
    lat: THREE.MathUtils.radToDeg(lat2)
  };
}

function offsetRoute(points, offset) {
  return points.map((point, index) => {
    const prev = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const tangent = new THREE.Vector3().subVectors(next, prev).setY(0).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const routeFraction = index / Math.max(1, points.length - 1);
    const laneBlend = THREE.MathUtils.smoothstep(routeFraction, 0.01, 0.12);
    return point.clone().addScaledVector(side, offset * laneBlend);
  });
}

function addRouteLine(curve, endT, color, opacity) {
  const samples = 160;
  const points = [];

  for (let index = 0; index <= samples; index += 1) {
    const t = (index / samples) * endT;
    points.push(curve.getPoint(t));
  }

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  );
  routeGroup.add(line);
}

function makeLimitMarker(color, text) {
  const group = new THREE.Group();

  const dot = new THREE.Mesh(
    new THREE.CylinderGeometry(1.38, 1.38, 0.18, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88 })
  );
  dot.position.y = 0.1;
  dot.castShadow = false;
  group.add(dot);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.58, 24, 14),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82 })
  );
  core.position.y = 0.58;
  group.add(core);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 10.5, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.64 })
  );
  pole.position.y = 5.1;
  group.add(pole);

  group.userData.label = addLabel(text, new THREE.Vector3(0, 0, 0), color, 4.6, routeGroup);
  return group;
}

function positionLimitMarkers() {
  const baselineEnd = baselineCurve.getPoint(getBaselineFraction());
  const optimizedEnd = optimizedCurve.getPoint(1);

  baselineLimitMarker.position.set(baselineEnd.x, 0.32, baselineEnd.z);
  optimizedLimitMarker.position.set(optimizedEnd.x, 0.32, optimizedEnd.z);

  baselineLimitMarker.userData.label.position.set(baselineEnd.x, baselineEnd.y + 7, baselineEnd.z);
  optimizedLimitMarker.userData.label.position.set(optimizedEnd.x, optimizedEnd.y + 7, optimizedEnd.z);
}

function bindControls() {
  syncRangeAndNumber(dom.gainRange, dom.gainNumber, (value) => {
    state.gainPct = value;
    buildRoutes();
    drawAirfoilSvg();
    updateMetrics();
  });

  dom.speedRange.addEventListener("input", () => {
    state.speed = Number(dom.speedRange.value);
    dom.speedReadout.textContent = `${state.speed.toFixed(1)}x`;
  });

  dom.cameraFollow.addEventListener("change", () => {
    state.cameraFollow = dom.cameraFollow.checked;
  });

  dom.showAirfoil.addEventListener("change", () => {
    state.showAirfoil = dom.showAirfoil.checked;
    airfoilCompareGroup.visible = state.showAirfoil;
  });

  dom.playToggle.addEventListener("click", () => {
    state.paused = !state.paused;
    dom.playIcon.innerHTML = state.paused ? "&#9658;" : "&#10074;&#10074;";
    dom.playToggle.setAttribute("aria-label", state.paused ? "재생" : "일시정지");
    dom.playToggle.setAttribute("title", state.paused ? "재생" : "일시정지");
    dom.simStatus.textContent = state.paused ? "일시정지" : "비행 중";
  });

  dom.resetSim.addEventListener("click", () => {
    state.elapsed = 0;
    state.progress = 0;
    updateSimulation(0);
  });

  dom.resetView.addEventListener("click", () => {
    resetCamera();
    controls.target.copy(cameraTarget);
  });
}

function syncRangeAndNumber(range, number, callback) {
  const update = (value) => {
    const min = Number(range.min);
    const max = Number(range.max);
    const next = THREE.MathUtils.clamp(Number(value), min, max);
    range.value = String(next);
    number.value = String(next);
    callback(next);
  };

  range.addEventListener("input", () => update(range.value));
  number.addEventListener("change", () => update(number.value));
}

function animate() {
  const delta = clock.getDelta();

  if (!state.paused) {
    state.elapsed += delta * state.speed;
  }

  updateSimulation(delta);
  controls.update();
  renderer.render(scene, camera);
}

function updateSimulation() {
  const activeSeconds = 22;
  const holdSeconds = 4;
  const phase = state.elapsed % (activeSeconds + holdSeconds);
  state.progress = Math.min(1, phase / activeSeconds);

  const optimizedKm = getOptimizedKm();
  const currentDistance = state.progress * optimizedKm;
  const baselineFraction = getBaselineFraction();
  const baselineT = Math.min(state.progress, baselineFraction);
  const optimizedT = state.progress;

  const baselinePosition = baselineCurve.getPoint(baselineT);
  const optimizedPosition = optimizedCurve.getPoint(optimizedT);
  const baselineTangent = baselineCurve.getTangent(Math.min(baselineT + 0.002, 1));
  const optimizedTangent = optimizedCurve.getTangent(Math.min(optimizedT + 0.002, 1));
  const baselineExhausted = currentDistance >= state.baselineKm;

  setAircraftTransform(baselinePlane, baselinePosition, baselineTangent, baselineExhausted);
  setAircraftTransform(optimizedPlane, optimizedPosition, optimizedTangent, false);

  baselineLabel.position.set(baselinePosition.x, baselinePosition.y + 5.5, baselinePosition.z);
  optimizedLabel.position.set(optimizedPosition.x, optimizedPosition.y + 5.5, optimizedPosition.z);

  spinPropellers(baselinePlane, baselineExhausted ? 0.04 : 0.72);
  spinPropellers(optimizedPlane, 0.72);

  if (baselineExhausted) {
    baselinePlane.traverse((child) => {
      if (child.material && child.material.opacity !== undefined) {
        child.material.transparent = true;
        child.material.opacity = 0.58;
      }
    });
  } else {
    baselinePlane.traverse((child) => {
      if (child.material && child.material.opacity !== undefined) {
        child.material.opacity = 1;
      }
    });
  }

  updateTelemetry(currentDistance, optimizedKm);
  updateCameraFollow(baselinePosition, optimizedPosition);
}

function spinPropellers(aircraft, amount) {
  aircraft.traverse((child) => {
    if (child.userData.spinAxis === "y") {
      child.rotation.y += amount;
    } else if (child.userData.spinAxis === "z") {
      child.rotation.z += amount;
    }
  });
}

function setAircraftTransform(aircraft, position, tangent, exhausted) {
  const sink = exhausted ? Math.sin(performance.now() * 0.0025) * 0.16 - 0.45 : 0;
  aircraft.position.copy(position);
  aircraft.position.y += sink;
  aircraft.rotation.y = Math.atan2(tangent.x, tangent.z);
  aircraft.rotation.z = exhausted ? -0.08 : Math.sin(performance.now() * 0.003) * 0.035;
}

function updateCameraFollow(baselinePosition, optimizedPosition) {
  if (!state.cameraFollow) return;

  const midpoint = new THREE.Vector3().addVectors(baselinePosition, optimizedPosition).multiplyScalar(0.5);
  const desiredTarget = midpoint.clone().setY(5);
  const desiredCamera = midpoint.clone().add(new THREE.Vector3(34, 86, 112));

  controls.target.lerp(desiredTarget, 0.045);
  camera.position.lerp(desiredCamera, 0.028);
}

function updateTelemetry(currentDistance, optimizedKm) {
  const baselineDistance = Math.min(currentDistance, state.baselineKm);
  const baselinePct = (baselineDistance / state.baselineKm) * 100;
  const optimizedPct = (currentDistance / optimizedKm) * 100;

  dom.baselineBar.style.width = `${baselinePct.toFixed(1)}%`;
  dom.optimizedBar.style.width = `${optimizedPct.toFixed(1)}%`;
  dom.baselineProgressText.textContent = `${formatKm(baselineDistance)} / ${formatKm(state.baselineKm)}`;
  dom.optimizedProgressText.textContent = `${formatKm(currentDistance)} / ${formatKm(optimizedKm)}`;

  if (baselinePct >= 100 && optimizedPct < 100) {
    dom.simStatus.textContent = "개선 형상 비행 중";
    dom.simStatus.style.color = "#e84134";
  } else {
    dom.simStatus.textContent = state.paused ? "일시정지" : "비행 중";
    dom.simStatus.style.color = "";
  }
}

function updateMetrics() {
  const optimizedKm = getOptimizedKm();
  const baselineEndurance = AIRCRAFT_SPEC.enduranceHours;
  const optimizedEndurance = getOptimizedEnduranceHours();
  const deltaKm = optimizedKm - state.baselineKm;

  document.title = `${AIRCRAFT_SPEC.name} 양항비 비교 시뮬레이터`;
  dom.aircraftName.textContent = AIRCRAFT_SPEC.name;
  dom.specRange.textContent = formatKmRange(getMinCruiseRangeKm(), getMaxCruiseRangeKm());
  dom.specCruise.textContent = `${AIRCRAFT_SPEC.cruiseMinKmh}-${AIRCRAFT_SPEC.cruiseMaxKmh} / ${AIRCRAFT_SPEC.maxSpeedKmh} km/h`;
  dom.specMtow.textContent = `${formatNumber(AIRCRAFT_SPEC.mtowKg)} kg`;
  dom.specEndurance.textContent = formatDuration(baselineEndurance);
  dom.specPayload.textContent = AIRCRAFT_SPEC.payloadLabel;
  dom.specDatalink.textContent = AIRCRAFT_SPEC.dataLinkRangeLabel;
  dom.specSize.textContent = `W ${AIRCRAFT_SPEC.wingspanM.toFixed(2)} m / L ${AIRCRAFT_SPEC.lengthM.toFixed(2)} m`;
  dom.specPropulsion.textContent = AIRCRAFT_SPEC.propulsionLabel;
  dom.deltaRange.textContent = `+${formatKm(deltaKm)}`;
  dom.deltaEndurance.textContent = `Endurance +${formatDuration(optimizedEndurance - baselineEndurance)}`;
  dom.modelNote.textContent =
    `Range = V × t. ${AIRCRAFT_SPEC.cruiseMinKmh}-${AIRCRAFT_SPEC.cruiseMaxKmh} km/h × ` +
    `${AIRCRAFT_SPEC.enduranceHours} h → ${formatKmRange(getMinCruiseRangeKm(), getMaxCruiseRangeKm())}. ` +
    `Baseline은 대표 ${formatNumber(AIRCRAFT_SPEC.cruiseKmh)} km/h 기준 ${formatKm(state.baselineKm)}.`;
  dom.topBaseline.textContent = formatKm(state.baselineKm);
  dom.topOptimized.textContent = formatKm(optimizedKm);
  dom.topGain.textContent = formatPercent(state.gainPct);
  updateTelemetry(state.progress * optimizedKm, optimizedKm);
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value);
}

function formatKm(value) {
  if (value >= 100) {
    return `${formatNumber(value)} km`;
  }

  return `${value.toFixed(1)} km`;
}

function formatKmRange(minValue, maxValue) {
  return `${formatNumber(minValue)}-${formatNumber(maxValue)} km`;
}

function formatPercent(value) {
  return `+${value.toFixed(1)}%`;
}

function formatDuration(hours) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  if (h <= 0) {
    return `${m} m`;
  }

  return `${h} h ${String(m).padStart(2, "0")} m`;
}

function getOptimizedKm() {
  return state.baselineKm * (1 + state.gainPct / 100);
}

function getBaselineKm() {
  return AIRCRAFT_SPEC.cruiseKmh * AIRCRAFT_SPEC.enduranceHours;
}

function getMinCruiseRangeKm() {
  return AIRCRAFT_SPEC.cruiseMinKmh * AIRCRAFT_SPEC.enduranceHours;
}

function getMaxCruiseRangeKm() {
  return AIRCRAFT_SPEC.cruiseMaxKmh * AIRCRAFT_SPEC.enduranceHours;
}

function getOptimizedEnduranceHours() {
  return AIRCRAFT_SPEC.enduranceHours * (1 + state.gainPct / 100);
}

function getBaselineFraction() {
  return state.baselineKm / getOptimizedKm();
}

function drawAirfoilSvg() {
  dom.airfoilSvg.innerHTML = "";
  const allPoints = [...LD_POLAR.baseline, ...LD_POLAR.optimized];
  const minAoa = Math.floor(Math.min(...allPoints.map((point) => point.aoa)));
  const maxAoa = Math.ceil(Math.max(...allPoints.map((point) => point.aoa)));
  const minLd = Math.floor(Math.min(-20, ...allPoints.map((point) => point.ld)) / 10) * 10;
  const maxLd = Math.ceil(Math.max(...allPoints.map((point) => point.ld)) / 10) * 10;
  const bounds = { left: 38, right: 334, top: 24, bottom: 152 };
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const mapX = (aoa) => bounds.left + ((aoa - minAoa) / (maxAoa - minAoa)) * width;
  const mapY = (ld) => bounds.bottom - ((ld - minLd) / (maxLd - minLd)) * height;

  const grid = document.createElementNS("http://www.w3.org/2000/svg", "g");
  grid.setAttribute("opacity", "0.26");

  for (let aoa = -5; aoa <= 15; aoa += 5) {
    grid.appendChild(makeSvgLine(mapX(aoa), bounds.top, mapX(aoa), bounds.bottom, "rgba(255,255,255,0.3)"));
    dom.airfoilSvg.appendChild(makeSvgText(String(aoa), mapX(aoa) - 5, 170, "rgba(244,247,244,0.72)", 10));
  }

  for (let ld = 0; ld <= maxLd; ld += 40) {
    grid.appendChild(makeSvgLine(bounds.left, mapY(ld), bounds.right, mapY(ld), "rgba(255,255,255,0.3)"));
    dom.airfoilSvg.appendChild(makeSvgText(String(ld), 10, mapY(ld) + 4, "rgba(244,247,244,0.72)", 10));
  }

  dom.airfoilSvg.appendChild(grid);
  dom.airfoilSvg.appendChild(makeSvgLine(bounds.left, bounds.bottom, bounds.right, bounds.bottom, "rgba(255,255,255,0.55)"));
  dom.airfoilSvg.appendChild(makeSvgLine(bounds.left, bounds.top, bounds.left, bounds.bottom, "rgba(255,255,255,0.55)"));
  dom.airfoilSvg.appendChild(makeLdPath(LD_POLAR.baseline, mapX, mapY, "#50a7ff", 2.6));
  dom.airfoilSvg.appendChild(makeLdPath(LD_POLAR.optimized, mapX, mapY, "#e84134", 3));

  const baselineMax = LD_STATS.baselineMax;
  const optimizedMax = LD_STATS.optimizedMax;
  dom.airfoilSvg.appendChild(makeSvgCircle(mapX(baselineMax.aoa), mapY(baselineMax.ld), 4.2, "#50a7ff"));
  dom.airfoilSvg.appendChild(makeSvgCircle(mapX(optimizedMax.aoa), mapY(optimizedMax.ld), 4.6, "#e84134"));
  dom.airfoilSvg.appendChild(makeSvgText("AoA", 307, 184, "rgba(244,247,244,0.8)", 11));
  dom.airfoilSvg.appendChild(makeSvgText("L/D", 12, 14, "rgba(244,247,244,0.8)", 11));
  dom.airfoilSvg.appendChild(
    makeSvgText(`Base max ${baselineMax.ld.toFixed(1)} @ ${baselineMax.aoa.toFixed(2)}°`, 58, 36, "#50a7ff", 12)
  );
  dom.airfoilSvg.appendChild(
    makeSvgText(`Opt max ${optimizedMax.ld.toFixed(1)} @ ${optimizedMax.aoa.toFixed(1)}°`, 58, 54, "#e84134", 12)
  );
}

function makeLdPath(points, mapX, mapY, stroke, strokeWidth) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${mapX(point.aoa).toFixed(2)} ${mapY(point.ld).toFixed(2)}`)
    .join(" ");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", stroke);
  path.setAttribute("stroke-width", String(strokeWidth));
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");
  return path;
}

function makeAirfoilPoints(thickness, camber, camberPosition, samples) {
  const upper = [];
  const lower = [];

  for (let i = 0; i <= samples; i += 1) {
    const x = i / samples;
    const yt =
      5 *
      thickness *
      (0.2969 * Math.sqrt(Math.max(x, 0.0001)) -
        0.126 * x -
        0.3516 * x * x +
        0.2843 * x * x * x -
        0.1015 * x * x * x * x);

    let yc;
    let dyc;

    if (x < camberPosition) {
      yc = (camber / (camberPosition * camberPosition)) * (2 * camberPosition * x - x * x);
      dyc = (2 * camber / (camberPosition * camberPosition)) * (camberPosition - x);
    } else {
      yc =
        (camber / Math.pow(1 - camberPosition, 2)) *
        ((1 - 2 * camberPosition) + 2 * camberPosition * x - x * x);
      dyc = (2 * camber / Math.pow(1 - camberPosition, 2)) * (camberPosition - x);
    }

    const theta = Math.atan(dyc);
    upper.push({ x: x - yt * Math.sin(theta), y: yc + yt * Math.cos(theta) });
    lower.push({ x: x + yt * Math.sin(theta), y: yc - yt * Math.cos(theta) });
  }

  return [...upper.reverse(), ...lower.slice(1)];
}

function makeAirfoilPath(points, stroke, strokeWidth, opacity, offsetY) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const d = points
    .map((point, index) => {
      const x = 34 + point.x * 292;
      const y = 101 + offsetY - point.y * 520;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  path.setAttribute("d", `${d} Z`);
  path.setAttribute("fill", stroke);
  path.setAttribute("fill-opacity", String(opacity * 0.16));
  path.setAttribute("stroke", stroke);
  path.setAttribute("stroke-width", String(strokeWidth));
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("opacity", String(opacity));
  return path;
}

function makeSvgLine(x1, y1, x2, y2, stroke) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("stroke", stroke);
  line.setAttribute("stroke-width", "1");
  return line;
}

function makeSvgText(text, x, y, fill, fontSize = 13) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
  node.textContent = text;
  node.setAttribute("x", String(x));
  node.setAttribute("y", String(y));
  node.setAttribute("fill", fill);
  node.setAttribute("font-size", String(fontSize));
  node.setAttribute("font-weight", "800");
  return node;
}

function makeSvgCircle(cx, cy, radius, fill) {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", String(cx));
  circle.setAttribute("cy", String(cy));
  circle.setAttribute("r", String(radius));
  circle.setAttribute("fill", fill);
  circle.setAttribute("stroke", "rgba(18,24,21,0.78)");
  circle.setAttribute("stroke-width", "2");
  return circle;
}

function addLabel(text, position, color, scale = 5, parent = world) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const pixelRatio = 2;
  canvas.width = 256 * pixelRatio;
  canvas.height = 72 * pixelRatio;
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, 256, 72);
  context.font = "700 28px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = 5;
  context.strokeStyle = "rgba(12, 18, 15, 0.72)";
  context.strokeText(text, 128, 36);
  context.fillStyle = typeof color === "number" ? `#${color.toString(16).padStart(6, "0")}` : color;
  context.fillText(text, 128, 36);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    })
  );
  sprite.position.copy(position);
  sprite.scale.set(scale * 2.55, scale * 0.72, 1);
  parent.add(sprite);
  return sprite;
}

function handleResize() {
  const width = dom.sceneRoot.clientWidth;
  const height = dom.sceneRoot.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
