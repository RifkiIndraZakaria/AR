const MODEL_PATH = "assets/Kid.glb";
const AUDIO_PATH = "assets/audio.mp3";

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const desktopPanel = document.getElementById("desktopPanel");
const mobilePanel = document.getElementById("mobilePanel");
const qrCodeContainer = document.getElementById("qrCode");
const pageLink = document.getElementById("pageLink");
const startArButton = document.getElementById("mobilePanel");
const statusText = document.getElementById("statusText");
const arOverlay = document.getElementById("arOverlay");
const instructionText = document.getElementById("instructionText");

const isMobileDevice =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  ) ||
  (navigator.maxTouchPoints > 1 &&
    Math.min(window.innerWidth, window.innerHeight) < 900);

let camera;
let scene;
let renderer;
let reticle;
let controller;
let xrSession = null;
let hitTestSource = null;
let hitTestSourceRequested = false;
let modelTemplate = null;
let placedModel = null;
let listener;
let sound;
let audioBuffer = null;
let canPlaceObject = true;
let objectPlaced = false;
let oneFingerDrag = null;
let twoFingerPinch = null;

initPage();
initThree();
loadAssets();

function initPage() {
  const currentUrl = getShareablePageUrl();
  pageLink.href = currentUrl;
  pageLink.textContent = currentUrl;

  if (isMobileDevice) {
    mobilePanel.hidden = false;
    desktopPanel.hidden = true;
  } else {
    desktopPanel.hidden = false;
    mobilePanel.hidden = true;
    generateQrWhenReady();
  }
}

function generateQrWhenReady() {
  const makeQr = () => {
    qrCodeContainer.innerHTML = "";

    if (!window.QRCode) {
      qrCodeContainer.textContent =
        "QR library gagal dimuat. Gunakan link di bawah.";
      return;
    }

    new QRCode(qrCodeContainer, {
      text: getShareablePageUrl(),
      width: 216,
      height: 216,
      colorDark: "#0d1117",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H,
    });
  };

  if (window.QRCode) {
    makeQr();
    return;
  }

  window.addEventListener("load", makeQr, { once: true });
}

function initThree() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    40,
  );
  listener = new THREE.AudioListener();
  camera.add(listener);

  const ambientLight = new THREE.HemisphereLight(0xffffff, 0x6b7280, 1.4);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 2.2);
  directionalLight.position.set(2, 5, 3);
  scene.add(directionalLight);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  document.body.appendChild(renderer.domElement);

  reticle = createReticle();
  reticle.visible = false;
  scene.add(reticle);

  controller = renderer.xr.getController(0);
  controller.addEventListener("select", placeObjectAtReticle);
  scene.add(controller);

  renderer.domElement.addEventListener("touchstart", onTouchStart, {
    passive: false,
  });
  renderer.domElement.addEventListener("touchmove", onTouchMove, {
    passive: false,
  });
  renderer.domElement.addEventListener("touchend", onTouchEnd, {
    passive: false,
  });
  renderer.domElement.addEventListener("touchcancel", onTouchEnd, {
    passive: false,
  });

  startArButton.addEventListener("click", startArSession);
  window.addEventListener("resize", onWindowResize);
  renderer.setAnimationLoop(render);
}

function createReticle() {
  const geometry = new THREE.RingGeometry(0.08, 0.105, 32).rotateX(
    -Math.PI / 2,
  );
  const material = new THREE.MeshBasicMaterial({
    color: 0x2ea043,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

async function loadAssets() {
  startArButton.disabled = true;

  const [modelResult, audioResult] = await Promise.allSettled([
    loadModel(),
    loadAudio(),
  ]);

  if (modelResult.status === "fulfilled") {
    modelTemplate = modelResult.value;
  } else {
    console.warn(
      "Model gagal dimuat, menggunakan placeholder.",
      modelResult.reason,
    );
    modelTemplate = createFallbackModel();
  }

  if (audioResult.status === "fulfilled") {
    audioBuffer = audioResult.value;
  } else {
    console.warn(
      "Audio gagal dimuat. AR tetap berjalan tanpa audio.",
      audioResult.reason,
    );
  }

  startArButton.disabled = false;
  statusText.textContent = audioBuffer
    ? "Siap memulai AR."
    : "Siap memulai AR. Audio belum tersedia di path konfigurasi.";
}

function loadModel() {
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      MODEL_PATH,
      (gltf) => {
        const root = gltf.scene;
        root.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.frustumCulled = false;
          }
        });
        normalizeModelSize(root);
        resolve(root);
      },
      undefined,
      reject,
    );
  });
}

function normalizeModelSize(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const largestAxis = Math.max(size.x, size.y, size.z);

  if (Number.isFinite(largestAxis) && largestAxis > 0) {
    model.scale.multiplyScalar(0.6 / largestAxis);
  }

  model.position.sub(center.multiplyScalar(model.scale.x));
}

function createFallbackModel() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.35, 0.35),
    new THREE.MeshStandardMaterial({
      color: 0x2ea043,
      roughness: 0.45,
      metalness: 0.1,
    }),
  );
  body.position.y = 0.175;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.025, 48),
    new THREE.MeshStandardMaterial({ color: 0xf0b429, roughness: 0.35 }),
  );
  base.position.y = 0.0125;

  group.add(base, body);
  return group;
}

function loadAudio() {
  const loader = new THREE.AudioLoader();

  return new Promise((resolve, reject) => {
    loader.load(AUDIO_PATH, resolve, undefined, reject);
  });
}

async function startArSession() {
  if (!window.isSecureContext) {
    setStatus(
      "WebXR membutuhkan HTTPS. GitHub Pages sudah HTTPS, jadi gunakan URL Pages saat testing di HP.",
    );
    return;
  }

  if (!navigator.xr) {
    setStatus("WebXR tidak tersedia di browser ini.");
    return;
  }

  const supported = await navigator.xr.isSessionSupported("immersive-ar");
  if (!supported) {
    setStatus("Immersive AR belum didukung di perangkat/browser ini.");
    return;
  }

  try {
    startArButton.disabled = true;
    mobilePanel.hidden = true;
    desktopPanel.hidden = true;
    document.body.classList.add("is-ar-starting");

    xrSession = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "local-floor", "anchors"],
      domOverlay: { root: document.body },
    });

    xrSession.addEventListener("end", onSessionEnded);
    await renderer.xr.setSession(xrSession);

    document.body.classList.remove("is-ar-starting");
    document.body.classList.add("is-ar-presenting");
    arOverlay.hidden = false;
    instructionText.textContent = "Arahkan kamera ke bidang datar";
    canPlaceObject = true;
    objectPlaced = false;
  } catch (error) {
    console.error(error);
    document.body.classList.remove("is-ar-starting", "is-ar-presenting");
    mobilePanel.hidden = !isMobileDevice;
    desktopPanel.hidden = isMobileDevice;
    startArButton.disabled = false;
    setStatus(
      "Gagal memulai AR. Pastikan halaman dibuka lewat HTTPS dan izin kamera diberikan.",
    );
  }
}

function onSessionEnded() {
  xrSession = null;
  hitTestSource = null;
  hitTestSourceRequested = false;
  canPlaceObject = true;
  objectPlaced = false;
  reticle.visible = false;
  arOverlay.hidden = true;
  document.body.classList.remove("is-ar-starting", "is-ar-presenting");
  desktopPanel.hidden = isMobileDevice;
  mobilePanel.hidden = !isMobileDevice;
  startArButton.disabled = false;
}

function render(timestamp, frame) {
  if (frame && canPlaceObject) {
    updateHitTest(frame);
  }

  renderer.render(scene, camera);
}

function updateHitTest(frame) {
  const session = renderer.xr.getSession();

  if (!hitTestSourceRequested) {
    session.requestReferenceSpace("viewer").then((referenceSpace) => {
      session.requestHitTestSource({ space: referenceSpace }).then((source) => {
        hitTestSource = source;
      });
    });

    session.addEventListener(
      "end",
      () => {
        hitTestSourceRequested = false;
        hitTestSource = null;
      },
      { once: true },
    );

    hitTestSourceRequested = true;
  }

  if (!hitTestSource) {
    return;
  }

  const referenceSpace = renderer.xr.getReferenceSpace();
  const hitTestResults = frame.getHitTestResults(hitTestSource);

  if (hitTestResults.length > 0) {
    const hit = hitTestResults[0];
    const pose = hit.getPose(referenceSpace);
    reticle.visible = true;
    reticle.matrix.fromArray(pose.transform.matrix);
    instructionText.textContent = "Tap layar untuk meletakkan objek";
  } else {
    reticle.visible = false;
    instructionText.textContent = "Arahkan kamera ke bidang datar";
  }
}

function placeObjectAtReticle() {
  if (!canPlaceObject || objectPlaced || !reticle.visible || !modelTemplate) {
    return;
  }

  placedModel = modelTemplate.clone(true);
  placedModel.matrixAutoUpdate = true;
  placedModel.position.setFromMatrixPosition(reticle.matrix);
  placedModel.quaternion.setFromRotationMatrix(reticle.matrix);
  placedModel.updateMatrixWorld(true);
  scene.add(placedModel);

  objectPlaced = true;
  canPlaceObject = false;
  reticle.visible = false;
  arOverlay.hidden = true;
  playAudio();
}

function playAudio() {
  if (!audioBuffer) {
    return;
  }

  if (sound && sound.isPlaying) {
    sound.stop();
  }

  sound = new THREE.Audio(listener);
  sound.setBuffer(audioBuffer);
  sound.setLoop(false);
  sound.setVolume(1);
  sound.play();
}

function onTouchStart(event) {
  if (!renderer.xr.isPresenting) {
    return;
  }

  event.preventDefault();

  if (event.touches.length === 1) {
    const touch = event.touches[0];
    oneFingerDrag = {
      x: touch.clientX,
      y: touch.clientY,
      startedAt: performance.now(),
      moved: false,
    };
    twoFingerPinch = null;
  }

  if (event.touches.length === 2 && placedModel) {
    oneFingerDrag = null;
    twoFingerPinch = {
      distance: getTouchDistance(event.touches),
      scale: placedModel.scale.x,
    };
  }
}

function onTouchMove(event) {
  if (!renderer.xr.isPresenting) {
    return;
  }

  event.preventDefault();

  if (event.touches.length === 1 && placedModel && oneFingerDrag) {
    const touch = event.touches[0];
    const deltaX = touch.clientX - oneFingerDrag.x;
    const deltaY = touch.clientY - oneFingerDrag.y;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      oneFingerDrag.moved = true;
    }

    placedModel.rotation.y += deltaX * 0.01;
    oneFingerDrag.x = touch.clientX;
    oneFingerDrag.y = touch.clientY;
  }

  if (event.touches.length === 2 && placedModel && twoFingerPinch) {
    const nextDistance = getTouchDistance(event.touches);
    const scaleFactor = THREE.MathUtils.clamp(
      nextDistance / twoFingerPinch.distance,
      0.35,
      3,
    );
    const nextScale = THREE.MathUtils.clamp(
      twoFingerPinch.scale * scaleFactor,
      0.08,
      4,
    );
    placedModel.scale.setScalar(nextScale);
  }
}

function onTouchEnd(event) {
  if (!renderer.xr.isPresenting) {
    return;
  }

  event.preventDefault();

  if (
    event.touches.length === 0 &&
    canPlaceObject &&
    oneFingerDrag &&
    !oneFingerDrag.moved &&
    performance.now() - oneFingerDrag.startedAt < 450
  ) {
    placeObjectAtReticle();
  }

  if (event.touches.length < 2) {
    twoFingerPinch = null;
  }

  if (event.touches.length === 0) {
    oneFingerDrag = null;
  }
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function setStatus(message) {
  statusText.textContent = message;
}

function getShareablePageUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  return url.href;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
