import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const TARGETS = [
  {
    id: "kidTest",
    title: "Tes Ekspresi",
    model: "assets/Kid.glb",
    audio: "assets/audio.mp3",
  },
  {
    id: "kidAngry",
    title: "Ekspresi Marah",
    model: "assets/KidAngry.glb",
    audio: "assets/KidAngry.mp3",
  },
  {
    id: "kidCalm",
    title: "Ekspresi Tenang",
    model: "assets/KidCalm.glb",
    audio: "assets/KidCalm.mp3",
  },
  {
    id: "kidHappy",
    title: "Ekspresi Senang",
    model: "assets/KidHappy.glb",
    audio: "assets/KidHappy.mp3",
  },
  {
    id: "kidSad",
    title: "Ekspresi Sedih",
    model: "assets/KidSad.glb",
    audio: "assets/KidSad.mp3",
  },
  {
    id: "kidScared",
    title: "Ekspresi Takut",
    model: "assets/KidScared.glb",
    audio: "assets/KidScared.mp3",
  },
  {
    id: "kidWorry",
    title: "Ekspresi Khawatir",
    model: "assets/KidWorry.glb",
    audio: "assets/KidWorry.mp3",
  },
];

function getSelectedTargetIdFromUrl() {
  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.get("target");
    if (param) return param;
    if (url.hash) {
      const hash = url.hash.replace(/^#/, "");
      if (hash.includes("=")) {
        const qp = new URLSearchParams(hash);
        return qp.get("target");
      }
      return hash;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

const selectedTargetId = getSelectedTargetIdFromUrl();
const selectedTarget =
  TARGETS.find((t) => t.id === selectedTargetId) || TARGETS[0];

const MODEL_PATH = selectedTarget.model;
const AUDIO_PATH = selectedTarget.audio;

const desktopPanel = document.getElementById("desktopPanel");
const mobilePanel = document.getElementById("mobilePanel");
const qrListContainer =
  document.getElementById("qrList") || document.getElementById("qrCode");
const startArButton = document.getElementById("mobilePanel");
const statusText = document.getElementById("statusText");
const arOverlay = document.getElementById("arOverlay");
const instructionText = document.getElementById("instructionText");
const mobileBlocked = document.getElementById("mobileBlocked");
const arToolbar = document.getElementById("arToolbar");
const arClose = document.getElementById("arClose");
const btnModeAR = document.getElementById("btnModeAR");
const btnModeObject = document.getElementById("btnModeObject");
const arShareQr = document.getElementById("arShareQr");
const objectViewer = document.getElementById("objectViewer");
const objectCanvas = document.getElementById("objectCanvas");
const qrModal = document.getElementById("qrModal");
const qrModalClose = document.getElementById("qrModalClose");
const qrModalBox = document.getElementById("qrModalBox");
const qrModalUrl = document.getElementById("qrModalUrl");

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
let currentMode = "ar"; // "ar" | "object"
let objRenderer = null;
let objCamera = null;
let objScene = null;
let objAnimId = null;
let objDrag = null;
let objPinch = null;

initPage();
initThree();
initToolbar();
loadAssets();

function hasQrAccess() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("via_qr") === "1") return true;
    if (url.searchParams.has("target")) return true;
    if (sessionStorage.getItem("qr_scanned") === "1") return true;
  } catch (e) {
    // ignore
  }
  return false;
}

function cleanUrlParams() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("via_qr");
    // keep target param so selection still works
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch (e) {
    // ignore
  }
}

function initPage() {
  if (isMobileDevice) {
    if (hasQrAccess()) {
      sessionStorage.setItem("qr_scanned", "1");
      mobilePanel.hidden = false;
      desktopPanel.hidden = true;
      if (mobileBlocked) mobileBlocked.hidden = true;
      cleanUrlParams();
    } else {
      mobilePanel.hidden = true;
      desktopPanel.hidden = true;
      if (mobileBlocked) mobileBlocked.hidden = false;
    }
  } else {
    desktopPanel.hidden = false;
    mobilePanel.hidden = true;
    if (mobileBlocked) mobileBlocked.hidden = true;
    generateQrWhenReady();
  }
}

function generateQrWhenReady() {
  const makeAll = () => {
    qrListContainer.innerHTML = "";
    TARGETS.forEach((t) => {
      const item = document.createElement("div");
      item.className = "qr-item";

      const qrBox = document.createElement("div");
      qrBox.className = "qr";

      const label = document.createElement("div");
      label.className = "qr-label";
      label.textContent = t.title;

      const _base = getShareablePageUrl();
      const _url = new URL(_base);
      _url.searchParams.set("target", t.id);
      _url.searchParams.set("via_qr", "1");
      const shareUrl = _url.href;

      const openLink = document.createElement("a");
      openLink.href = shareUrl;
      openLink.target = "_blank";
      openLink.rel = "noopener";
      openLink.className = "qr-open";
      openLink.textContent = "Buka di HP";

      const dl = document.createElement("a");
      dl.href = "#";
      dl.className = "qr-download";
      dl.textContent = "Unduh PNG";

      item.appendChild(qrBox);
      item.appendChild(label);
      item.appendChild(openLink);
      item.appendChild(dl);
      qrListContainer.appendChild(item);

      if (window.QRCode) {
        new QRCode(qrBox, {
          text: shareUrl,
          width: 216,
          height: 216,
          colorDark: "#0d1117",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H,
        });

        // bind download after a short delay so QR is rendered
        setTimeout(() => {
          const img = qrBox.querySelector("img");
          const canvas = qrBox.querySelector("canvas");
          const dataUrl = img ? img.src : canvas ? canvas.toDataURL() : null;
          if (dataUrl) {
            dl.href = dataUrl;
            dl.download = `${t.id}.png`;
          } else {
            dl.style.display = "none";
          }
        }, 150);
      }
    });
  };

  if (window.QRCode) {
    makeAll();
    return;
  }

  const interval = setInterval(() => {
    if (window.QRCode) {
      clearInterval(interval);
      makeAll();
    }
  }, 100);

  // Timeout 10 detik jika CDN gagal
  setTimeout(() => {
    clearInterval(interval);
    if (!window.QRCode) {
      qrListContainer.textContent =
        "QR gagal dimuat. Pastikan koneksi internet.";
    }
  }, 10000);
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
    ? `Siap memulai AR. (${selectedTarget.title})`
    : `Siap memulai AR. (${selectedTarget.title}) Audio belum tersedia.`;
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
  return createFallbackModelForId(selectedTarget.id);
}

function createFallbackModelForId(id) {
  const group = new THREE.Group();
  id = id || "kid";

  if (id === "cat") {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0xffb4c1, roughness: 0.5 }),
    );
    body.position.y = 0.22;

    const earL = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.12, 8),
      new THREE.MeshStandardMaterial({ color: 0xffb4c1, roughness: 0.5 }),
    );
    earL.position.set(-0.12, 0.38, 0.05);
    earL.rotation.z = 0.4;

    const earR = earL.clone();
    earR.position.x = 0.12;

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.02, 32),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 }),
    );
    base.position.y = 0.01;

    group.add(base, body, earL, earR);
    return group;
  }

  if (id === "rocket") {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.6, 24),
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 }),
    );
    body.position.y = 0.32;

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.2, 24),
      new THREE.MeshStandardMaterial({ color: 0xfff59e, roughness: 0.4 }),
    );
    nose.position.y = 0.65;

    const finL = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.12, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 }),
    );
    finL.position.set(-0.09, 0.12, 0.08);
    finL.rotation.z = 0.3;

    const finR = finL.clone();
    finR.position.x = 0.09;

    group.add(body, nose, finL, finR);
    return group;
  }

  // default: kid-like box
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
    arToolbar.hidden = false;
    currentMode = "ar";
    btnModeAR.classList.add("mode-btn--active");
    btnModeObject.classList.remove("mode-btn--active");
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

function cleanupScene() {
  // Stop & destroy audio
  if (sound) {
    if (typeof sound.isPlaying !== "undefined" && sound.isPlaying) {
      sound.stop();
    } else if (typeof sound.stop === "function") {
      try {
        sound.stop();
      } catch (e) {
        /* ignore */
      }
    }
    if (typeof sound.disconnect === "function") sound.disconnect();
    sound = null;
  }

  // Remove placed model from scene and dispose resources
  if (placedModel) {
    scene.remove(placedModel);
    placedModel.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
    placedModel = null;
  }
}

function onSessionEnded() {
  cleanupScene();

  xrSession = null;
  hitTestSource = null;
  hitTestSourceRequested = false;
  canPlaceObject = true;
  objectPlaced = false;
  reticle.visible = false;
  arOverlay.hidden = true;
  arToolbar.hidden = true;
  if (currentMode === "object") hideObjectMode();
  currentMode = "ar";
  document.body.classList.remove("is-ar-starting", "is-ar-presenting");
  desktopPanel.hidden = isMobileDevice;
  mobilePanel.hidden = !isMobileDevice;
  startArButton.disabled = false;
}

function render(timestamp, frame) {
  // Saat mode Objek aktif, AR scene tidak perlu dirender (hemat GPU)
  if (currentMode === "object") return;

  if (frame && canPlaceObject) {
    updateHitTest(frame);
  }

  renderer.render(scene, camera);
}

function updateHitTest(frame) {
  const session = renderer.xr.getSession();

  if (!hitTestSourceRequested) {
    // Set flag DULU agar request tidak dipanggil ulang setiap frame
    hitTestSourceRequested = true;

    session.requestReferenceSpace("viewer").then((viewerSpace) => {
      session.requestHitTestSource({ space: viewerSpace }).then((source) => {
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
    // Wajib: tandai matrixWorld agar Three.js meneruskan matrix ke GPU
    reticle.matrixWorldNeedsUpdate = true;
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
  if (audioBuffer) {
    if (sound && sound.isPlaying) {
      sound.stop();
    }

    sound = new THREE.Audio(listener);
    sound.setBuffer(audioBuffer);
    sound.setLoop(false);
    sound.setVolume(1);
    sound.play();
    return;
  }

  // Fallback: synthesize a short tone if no audio file is available
  try {
    const ctx = listener.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const freqMap = { kid: 440, cat: 660, rocket: 220 };
    osc.type = "sine";
    osc.frequency.value = freqMap[selectedTarget.id] || 440;

    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    osc.start(now);
    osc.stop(now + 1.0);

    sound = {
      stop: () => {
        try {
          osc.stop();
        } catch (e) {
          /* ignore */
        }
      },
    };
  } catch (e) {
    console.warn("Synth audio failed:", e);
  }
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

function initToolbar() {
  // Close button — akhiri XR session
  arClose.addEventListener("click", () => {
    if (xrSession) xrSession.end();
    else onSessionEnded();
  });

  // Switch ke mode Objek
  btnModeObject.addEventListener("click", () => {
    if (currentMode === "object") return;
    currentMode = "object";
    btnModeObject.classList.add("mode-btn--active");
    btnModeAR.classList.remove("mode-btn--active");
    showObjectMode();
  });

  // Switch ke mode AR
  btnModeAR.addEventListener("click", () => {
    if (currentMode === "ar") return;
    currentMode = "ar";
    btnModeAR.classList.add("mode-btn--active");
    btnModeObject.classList.remove("mode-btn--active");
    hideObjectMode();
  });

  // Share QR
  arShareQr.addEventListener("click", showQrModal);
  qrModalClose.addEventListener("click", () => {
    qrModal.hidden = true;
  });
  qrModal.addEventListener("click", (e) => {
    if (e.target === qrModal) qrModal.hidden = true;
  });
}

function showObjectMode() {
  // Suspend AR hit-test & reticle
  reticle.visible = false;
  objectViewer.hidden = false;

  // Buat renderer objek terpisah jika belum ada
  if (!objRenderer) {
    objRenderer = new THREE.WebGLRenderer({
      canvas: objectCanvas,
      antialias: true,
      alpha: true,
    });
    objRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    objRenderer.setSize(window.innerWidth, window.innerHeight);

    objCamera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.01,
      100,
    );
    objCamera.position.set(0, 0.3, 1.4);

    objScene = new THREE.Scene();
    objScene.background = new THREE.Color(0xf1f5f9);

    const amb = new THREE.HemisphereLight(0xffffff, 0x6b7280, 1.4);
    objScene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 2.2);
    dir.position.set(2, 5, 3);
    objScene.add(dir);

    // Pasang event listener HANYA sekali saat renderer dibuat
    objectCanvas.addEventListener("touchstart", onObjTouchStart, {
      passive: false,
    });
    objectCanvas.addEventListener("touchmove", onObjTouchMove, {
      passive: false,
    });
    objectCanvas.addEventListener("touchend", onObjTouchEnd, {
      passive: false,
    });
  }

  // Kloning model untuk viewer
  if (modelTemplate) {
    if (objScene.__previewModel) objScene.remove(objScene.__previewModel);
    const preview = modelTemplate.clone(true);
    objScene.add(preview);
    objScene.__previewModel = preview;
  }

  // Start render loop
  const loop = () => {
    objAnimId = requestAnimationFrame(loop);
    objRenderer.render(objScene, objCamera);
  };
  loop();
}

function hideObjectMode() {
  objectViewer.hidden = true;
  cancelAnimationFrame(objAnimId);
  objAnimId = null;
  // Event listener tidak dilepas di sini karena sudah dipasang sekali saja
}

function onObjTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    objDrag = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    objPinch = null;
  }
  if (e.touches.length === 2) {
    objDrag = null;
    objPinch = {
      dist: Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      ),
      camZ: objCamera.position.z,
    };
  }
}

function onObjTouchMove(e) {
  e.preventDefault();
  const model = objScene && objScene.__previewModel;
  if (e.touches.length === 1 && objDrag && model) {
    const dx = e.touches[0].clientX - objDrag.x;
    const dy = e.touches[0].clientY - objDrag.y;
    model.rotation.y += dx * 0.012;
    model.rotation.x += dy * 0.012;
    objDrag.x = e.touches[0].clientX;
    objDrag.y = e.touches[0].clientY;
  }
  if (e.touches.length === 2 && objPinch) {
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );
    objCamera.position.z = THREE.MathUtils.clamp(
      objPinch.camZ * (objPinch.dist / d),
      0.3,
      5,
    );
  }
}

function onObjTouchEnd(e) {
  e.preventDefault();
  if (e.touches.length < 2) objPinch = null;
  if (e.touches.length === 0) objDrag = null;
}

function showQrModal() {
  qrModalBox.innerHTML = "";
  const url = getShareablePageUrl();
  qrModalUrl.textContent = url;

  const waitQr = () => {
    if (window.QRCode) {
      new QRCode(qrModalBox, {
        text: url,
        width: 200,
        height: 200,
        colorDark: "#0d1117",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });
    } else {
      qrModalBox.textContent = "QR tidak tersedia.";
    }
  };

  if (window.QRCode) waitQr();
  else setTimeout(waitQr, 500);

  qrModal.hidden = false;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
