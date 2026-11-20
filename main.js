import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { initAudio, isAudioReady, triggerByKey, triggerString, getCurrentNotes, setScale } from "./audio.js";
import { StringManager } from "./strings.js";

// Virtual torlar fizik boshqaruvchisi
const stringManager = new StringManager();

// DOM elementlari
const video = document.getElementById("webcam");
const canvas = document.getElementById("output-canvas");
const ctx = canvas.getContext("2d");

const fpsCounter = document.getElementById("fps-counter");
const handsCounter = document.getElementById("hands-counter");
const statusIndicator = document.getElementById("status-indicator");
const stringsCounter = document.getElementById("strings-counter");
const btnUndo = document.getElementById("btn-undo");
const btnClear = document.getElementById("btn-clear");

const audioStartBtn = document.getElementById("audio-start-btn");
const audioBtnText = document.getElementById("audio-btn-text");
const audioIcon = audioStartBtn ? audioStartBtn.querySelector(".audio-icon") : null;
const hintText = document.getElementById("hint-text");
const noteSlots = document.querySelectorAll(".note-slot");
const scaleSelect = document.getElementById("scale-select");

const modalContainer = document.getElementById("modal-container");
const modalTitle = document.getElementById("modal-title");
const modalMessage = document.getElementById("modal-message");
const modalRetryBtn = document.getElementById("modal-retry-btn");

// Qo'l skeleti suyaklari (21 ta nuqta orasidagi ulanishlar)
const HAND_CONNECTIONS = [
  // Kaft asosi
  [0, 1], [0, 5], [5, 9], [9, 13], [13, 17], [0, 17],
  // Bosh barmoq
  [1, 2], [2, 3], [3, 4],
  // Ko'rsatkich barmoq
  [5, 6], [6, 7], [7, 8],
  // O'rta barmoq
  [9, 10], [10, 11], [11, 12],
  // Nomsiz barmoq
  [13, 14], [14, 15], [15, 16],
  // Jimjiloq
  [17, 18], [18, 19], [19, 20]
];

// Holat o'zgaruvchilari
let handLandmarker = null;
let isRunning = false;
let lastVideoTime = -1;
let lastFrameTime = performance.now();
let frameCount = 0;
let currentFps = 0;
let fpsTimer = performance.now();

// Video va canvas masshtab koordinatalari
let renderTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  drawWidth: 0,
  drawHeight: 0
};

// Canvas o'lchamini ekranga moslash
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  updateRenderTransform();
  stringManager.resize(width, height);
}

// Video proporsiyasini saqlagan holda "cover" rejimida koordinatalarni hisoblash
function updateRenderTransform() {
  if (!video.videoWidth || !video.videoHeight) return;

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const videoW = video.videoWidth;
  const videoH = video.videoHeight;

  // Cover hisobi (ekranni to'liq qoplash)
  const scale = Math.max(screenW / videoW, screenH / videoH);
  const drawWidth = videoW * scale;
  const drawHeight = videoH * scale;
  const offsetX = (screenW - drawWidth) / 2;
  const offsetY = (screenH - drawHeight) / 2;

  renderTransform = {
    scale,
    offsetX,
    offsetY,
    drawWidth,
    drawHeight,
    screenW,
    screenH
  };
}

window.addEventListener("resize", resizeCanvas);

// Xatolik dialogi
function showError(title, message) {
  if (modalTitle) modalTitle.textContent = title;
  if (modalMessage) modalMessage.textContent = message;
  if (modalContainer) modalContainer.classList.remove("hidden");
  if (statusIndicator) {
    statusIndicator.textContent = "Xato";
    statusIndicator.className = "stat-value status-error";
  }
}

if (modalRetryBtn) {
  modalRetryBtn.addEventListener("click", () => {
    if (modalContainer) modalContainer.classList.add("hidden");
    initApp();
  });
}

// 1. MediaPipe HandLandmarker modelini yuklash
async function initMediaPipe() {
  if (statusIndicator) {
    statusIndicator.textContent = "Model yuklanmoqda...";
    statusIndicator.className = "stat-value status-loading";
  }

  try {
    // Lokal wasm fayllardan yuklaymiz
    const vision = await FilesetResolver.forVisionTasks("./wasm");

    // Apple Silicon GPU tezlatgich bilan yuklashga urinamiz
    try {
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "./models/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      console.log("MediaPipe GPU delegate bilan yuklandi.");
    } catch (gpuError) {
      console.warn("GPU delegate ishlamadi, CPU ga o'tilmoqda:", gpuError);
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "./models/hand_landmarker.task",
          delegate: "CPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      console.log("MediaPipe CPU delegate bilan yuklandi.");
    }

    if (statusIndicator) {
      statusIndicator.textContent = "Kamera ulanmoqda...";
    }
  } catch (err) {
    console.error("MediaPipe yuklashda xatolik:", err);
    throw new Error("HandLandmarker modelini yuklab bo'lmadi: " + err.message);
  }
}

// 2. Veb-kamerani ishga tushirish
async function initWebcam() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Brauzeringiz veb-kamerani qo'llab-quvvatlamaydi.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60, min: 30 }
    },
    audio: false
  });

  video.srcObject = stream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      video.play().then(() => {
        resizeCanvas();
        resolve();
      });
    };
  });
}

// Landmark koordinatasini oyna rejimida ekranga o'tkazish
function mapLandmarkToScreen(landmark) {
  const { offsetX, offsetY, drawWidth, drawHeight } = renderTransform;

  // Video gorizontal oyna (mirror) rejimida bo'lgani uchun:
  // x o'qi teskari aylantiriladi (1 - landmark.x)
  const x = offsetX + (1 - landmark.x) * drawWidth;
  const y = offsetY + landmark.y * drawHeight;

  return { x, y, z: landmark.z };
}

// Qo'l skeleti va nuqtalarini chizish
function drawHand(landmarks, handedness, handIndex) {
  const screenPoints = landmarks.map(mapLandmarkToScreen);

  // Suyak chiziqlari (Yashil toza chiziqlar)
  ctx.save();
  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
    const p1 = screenPoints[startIdx];
    const p2 = screenPoints[endIdx];

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.restore();

  // 21 ta nuqta (Qizil toza nuqtalar, shadowBlursiz - tez va yengil)
  ctx.save();
  for (let i = 0; i < screenPoints.length; i++) {
    const p = screenPoints[i];
    const isTip = [4, 8, 12, 16, 20].includes(i); // Barmoq uchlari

    ctx.beginPath();
    ctx.arc(p.x, p.y, isTip ? 5.5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = isTip ? "#ff1776" : "#ff4444";
    ctx.fill();

    // Nuqtaning ichki kichik oq yadrosi
    ctx.beginPath();
    ctx.arc(p.x, p.y, isTip ? 2 : 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  ctx.restore();

  // Qo'l nomi (Left / Right) kaft ustiga chiziladi
  if (handedness && handedness[0]) {
    const wrist = screenPoints[0];
    const rawName = handedness[0].displayName || handedness[0].categoryName || "";
    const label = rawName === "Left" ? "Chap qo‘l" : rawName === "Right" ? "O‘ng qo‘l" : "Qo‘l";
    const score = Math.round((handedness[0].score || 0) * 100);

    ctx.save();
    ctx.font = "600 12px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${label} (${score}%)`, wrist.x - 35, wrist.y + 24);
    ctx.restore();
  }
}

// Landmarklarni silliqlash (EMA smoothing filter - titrash va sakrashlarni yo'qotish)
let smoothedHands = [];
function smoothLandmarks(rawHands) {
  if (!rawHands || rawHands.length === 0) {
    smoothedHands = [];
    return [];
  }

  const alpha = 0.65; // Yangi kadr ulushi
  const result = [];

  for (let h = 0; h < rawHands.length; h++) {
    const raw = rawHands[h];
    const prev = smoothedHands[h];

    if (!prev || prev.length !== raw.length) {
      result.push(raw.map(pt => ({ x: pt.x, y: pt.y, z: pt.z })));
    } else {
      const smoothed = [];
      for (let i = 0; i < raw.length; i++) {
        smoothed.push({
          x: prev[i].x * (1 - alpha) + raw[i].x * alpha,
          y: prev[i].y * (1 - alpha) + raw[i].y * alpha,
          z: prev[i].z * (1 - alpha) + raw[i].z * alpha
        });
      }
      result.push(smoothed);
    }
  }

  smoothedHands = result;
  return result;
}

// Asosiy render sikli (Real-time render loop)
function render() {
  if (!isRunning) return;

  const now = performance.now();

  // FPS hisoblash
  frameCount++;
  if (now - fpsTimer >= 500) {
    currentFps = Math.round((frameCount * 1000) / (now - fpsTimer));
    if (fpsCounter) fpsCounter.textContent = currentFps;
    frameCount = 0;
    fpsTimer = now;
  }

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  // 1. Canvasni tozalash
  ctx.clearRect(0, 0, screenW, screenH);

  // 2. Video oqimini gorizontal oyna (mirror) rejimida chizish
  if (video.readyState >= 2) {
    const { offsetX, offsetY, drawWidth, drawHeight } = renderTransform;

    ctx.save();
    // Gorizontal teskari aylantirish (mirror)
    ctx.translate(screenW, 0);
    ctx.scale(-1, 1);

    // Oyna qilingan koordinatalarda videoni chizish
    // Ekranning qarama-qarshi tomoniga joylashadi
    const mirrorOffsetX = screenW - (offsetX + drawWidth);
    ctx.drawImage(video, mirrorOffsetX, offsetY, drawWidth, drawHeight);

    // Nozik qorong'i qatlam (musiqiy neon effektlar yaxshiroq ko'rinishi uchun)
    ctx.fillStyle = "rgba(7, 9, 14, 0.35)";
    ctx.fillRect(mirrorOffsetX, offsetY, drawWidth, drawHeight);

    ctx.restore();

    // 3. MediaPipe orqali qo'llarni aniqlash
    if (handLandmarker && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;

      try {
        const results = handLandmarker.detectForVideo(video, now);

        const detectedHands = results.landmarks ? results.landmarks.length : 0;
        if (handsCounter) handsCounter.textContent = `${detectedHands} / 2`;

        // Titrash va sakrashlarni yo'qotuvchi EMA filtri
        const cleanHands = smoothLandmarks(results.landmarks);

        // Torlar fizikasi uchun qo'llar landmarklarini uzatish
        stringManager.updateHands(cleanHands, results.handednesses, screenW, screenH);

        // 4. Virtual torlar fizikasini yangilash va chizish
        stringManager.updatePhysics();
        stringManager.draw(ctx);

        // Qo'l skeletlarini chizish
        if (detectedHands > 0) {
          for (let i = 0; i < cleanHands.length; i++) {
            const landmarks = cleanHands[i];
            const handedness = results.handednesses ? results.handednesses[i] : null;
            drawHand(landmarks, handedness, i);
          }
        }
      } catch (detectErr) {
        console.error("Detect xatoligi:", detectErr);
      }
    } else {
      if (!handLandmarker) {
        stringManager.updateHands([], [], screenW, screenH);
      }
      stringManager.updatePhysics();
      stringManager.draw(ctx);
    }
  }

  requestAnimationFrame(render);
}

// Ekrandagi notalar yozuvini joriy gammaga qarab yangilash
function updateNoteSlotsDisplay() {
  const currentNotes = getCurrentNotes();
  noteSlots.forEach((slot, idx) => {
    const noteNameEl = slot.querySelector(".note-name");
    if (noteNameEl && currentNotes[idx]) {
      noteNameEl.textContent = currentNotes[idx];
    }
  });
}

if (scaleSelect) {
  scaleSelect.addEventListener("change", (e) => {
    setScale(e.target.value);
    updateNoteSlotsDisplay();
  });
}

// Torlar ro'yxati o'zgarganda HUD ko'rsatkichini yangilash
stringManager.setOnStringsChange((strings) => {
  if (stringsCounter) {
    stringsCounter.textContent = `${strings.length} ta`;
  }
});

// Tozalash va Undo tugmalari hodisalari
if (btnUndo) {
  btnUndo.addEventListener("click", () => {
    stringManager.undoString();
  });
}

if (btnClear) {
  btnClear.addEventListener("click", () => {
    stringManager.clearStrings();
  });
}

// Tor chertilganda hodisani qabul qilish
stringManager.setOnPluck(({ frequency, note }) => {
  // Agar audio hali yoqilmagan bo'lsa
  if (!isAudioReady()) {
    handleAudioStart();
  }
});

// Sichqoncha bilan ham sinash imkoniyati (Desktop qulayligi)
let isMouseDown = false;
let prevMousePos = null;

canvas.addEventListener("mousedown", (e) => {
  isMouseDown = true;
  const rect = canvas.getBoundingClientRect();
  const mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  prevMousePos = mousePos;
  stringManager.handlePinch(mousePos);

  if (!isAudioReady()) {
    handleAudioStart();
  }
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

  if (isMouseDown) {
    stringManager.handlePinch(mousePos);
  } else {
    stringManager.checkHoverEndpoint(mousePos);
    if (prevMousePos) {
      stringManager.checkPluck(prevMousePos, mousePos, performance.now());
    }
  }
  prevMousePos = mousePos;
});

canvas.addEventListener("mouseup", () => {
  if (isMouseDown) {
    stringManager.finishDrawing();
    stringManager.editingEndpoint = null;
    isMouseDown = false;
  }
});

// Nota slotini vizual yoritish (Glow effekti)
function highlightNoteSlot(index) {
  if (noteSlots[index]) {
    const slot = noteSlots[index];
    slot.classList.add("played");
    setTimeout(() => {
      slot.classList.remove("played");
    }, 180);
  }
}

// Audio Engine ni ishga tushirish tugmasi hodisasi
async function handleAudioStart() {
  if (isAudioReady()) return;

  if (audioBtnText) audioBtnText.textContent = "Ulanmoqda...";

  const success = await initAudio();
  if (success) {
    if (audioStartBtn) audioStartBtn.classList.add("active");
    if (audioIcon) audioIcon.textContent = "🔊";
    if (audioBtnText) audioBtnText.textContent = "Audio Faol";
    if (hintText) {
      hintText.textContent = "Audio yoqildi! Klaviaturadan 1–8 tugmalarini bosib har bir notani (reverb bilan) sinab ko‘ring.";
    }
  } else {
    if (audioBtnText) audioBtnText.textContent = "Xato!";
  }
}

if (audioStartBtn) {
  audioStartBtn.addEventListener("click", handleAudioStart);
}

// Klaviatura (1..8) orqali torlarni chalish (Test nuqtasi 2)
window.addEventListener("keydown", async (e) => {
  if (e.repeat) return; // Klaviaturani bosib turganda qayta-qayta chaqirilmasligi uchun

  if (e.key >= "1" && e.key <= "8") {
    // Agar foydalanuvchi tugmani bosmagan bo'lsa, birinchi klavish bosilganda ham faollashtiramiz
    if (!isAudioReady()) {
      await handleAudioStart();
    }

    const played = triggerByKey(e.key);
    if (played) {
      highlightNoteSlot(played.stringIndex);
    }
  }
});

// Slotlarni sichqoncha bilan bosganda ham chalish imkoniyati (qulaylik uchun)
noteSlots.forEach((slot, index) => {
  slot.style.pointerEvents = "auto";
  slot.style.cursor = "pointer";
  slot.addEventListener("click", async () => {
    if (!isAudioReady()) {
      await handleAudioStart();
    }
    const played = triggerString(index, 0.85);
    if (played) {
      highlightNoteSlot(index);
    }
  });
});

// Ilovani ishga tushirish
async function initApp() {
  try {
    resizeCanvas();
    await initMediaPipe();
    await initWebcam();

    if (statusIndicator) {
      statusIndicator.textContent = "Faol (60 FPS)";
      statusIndicator.className = "stat-value status-ready";
    }

    isRunning = true;
    requestAnimationFrame(render);
  } catch (err) {
    console.error("Ilovani ishga tushirishda xatolik:", err);
    let userMsg = err.message;
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      userMsg = "Kamera ruxsati berilmadi. Iltimos, brauzer manzil qatoridagi kamera belgisini bosib ruxsat bering.";
    } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      userMsg = "Kompyuterda veb-kamera topilmadi.";
    }
    showError("Xatolik yuz berdi", userMsg);
  }
}

// Boshlash
initApp();
