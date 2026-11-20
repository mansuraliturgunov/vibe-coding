import { triggerString, getCurrentNotes } from "./audio.js";

/**
 * Virtual Torlar va Fizika Moduli (Air Strings Physics Engine)
 */

export class StringManager {
  constructor() {
    this.strings = [];
    this.numStrings = 8;
    this.maxActiveStrings = 8;
    this.octaveShift = 0; // 2-qo'l orqali oktavani o'zgartirish

    // Oldingi freym barmoq koordinatalari (tezlik va to'qnashuvni hisoblash uchun)
    this.prevFingers = new Map(); // handIndex -> { x, y, time }

    // Qo'l rollarini barqarorlashtirish (Role stabilization hysteresis)
    this.lastPluckHandId = null;
    this.lastControlHandId = null;

    // 2-qo'l holati
    this.controlHand = {
      active: false,
      isPinching: false,
      pinchDistance: 0,
      yPercent: 0.5,
      tensionMultiplier: 1.0
    };

    // Callback funksiyalari (vizual effektlar va zarrachalar uchun)
    this.onPluckCallback = null;

    this.initStrings();
  }

  /**
   * Faol torlar sonini o'zgartirish (4, 6 yoki 8)
   */
  setActiveStringsCount(count) {
    this.maxActiveStrings = Math.max(1, Math.min(count, 8));
    this.resize(this.lastWidth || window.innerWidth, this.lastHeight || window.innerHeight);
  }

  /**
   * Torlarni boshlang'ich sozlash
   */
  initStrings() {
    this.strings = [];
    const notes = getCurrentNotes();

    for (let i = 0; i < 8; i++) {
      this.strings.push({
        index: i,
        note: notes[i] || `N${i + 1}`,
        y: 0,              // Tinch holatdagi Y balandligi
        x1: 0,             // Chap nuqta
        x2: 0,             // O'ng nuqta
        displacement: 0,   // Markaziy vertikal chetlanish
        velocity: 0,       // Tebranish tezligi
        tension: 0.22,     // Prujina tarangligi (Hooke's law k)
        damping: 0.945,    // Tebranish so'nishi
        isGrabbed: false,  // Barmoq bilan ushlab turilganmi
        grabX: 0,
        grabY: 0,
        grabHandId: null,
        lastPluckTime: 0,
        vibrationPhase: 0,
        glowIntensity: 0
      });
    }
  }

  /**
   * Ekranning o'lchami o'zgarganda torlar koordinatalarini yangilash
   */
  resize(width, height) {
    this.lastWidth = width;
    this.lastHeight = height;
    const activeCount = this.maxActiveStrings;
    // Ekranning 22% dan 82% gacha bo'lgan balandligida joylashadi
    const topMargin = height * 0.22;
    const bottomMargin = height * 0.82;
    const availableHeight = bottomMargin - topMargin;
    const spacing = availableHeight / Math.max(1, activeCount - 1);

    const xLeft = width * 0.08;
    const xRight = width * 0.92;

    for (let i = 0; i < this.strings.length; i++) {
      const s = this.strings[i];
      if (i < activeCount) {
        // Biroz gitara korpusiga o'xshash tabiiy qiyalik (diagonal/ergonomik burchak)
        const slantOffset = (i - activeCount / 2) * 12;
        s.y = topMargin + i * spacing;
        s.x1 = xLeft;
        s.x2 = xRight;
        s.slant = slantOffset;
      }
    }
  }

  /**
   * Chertish hodisasiga obuna bo'lish (uchqunlar va zarralar uchun)
   */
  setOnPluck(callback) {
    this.onPluckCallback = callback;
  }

  /**
   * Qo'llar ma'lumotlarini qabul qilish va to'qnashuvlarni hisoblash
   * @param {Array} handsLandmarks - Aniqlangan qo'llar landmarklari
   * @param {Array} handednesses - Qo'l turlari (Left / Right)
   */
  updateHands(handsLandmarks, handednesses, screenW, screenH) {
    const now = performance.now();

    if (!handsLandmarks || handsLandmarks.length === 0) {
      this.controlHand.active = false;
      this.releaseAllGrabs();
      this.prevFingers.clear();
      return;
    }

    // 1 ta yoki 2 ta qo'l mavjudligini tekshirish
    let pluckHand = null;
    let controlHand = null;

    if (handsLandmarks.length === 1) {
      pluckHand = { landmarks: handsLandmarks[0], id: "h0" };
      this.controlHand.active = false;
      this.lastPluckHandId = "h0";
      this.lastControlHandId = null;
    } else {
      // 2 ta qo'l: MediaPipe handedness va X-koordinatalar asosida barqarorlashtirish (Stabilization)
      const h0 = { landmarks: handsLandmarks[0], handedness: handednesses?.[0]?.[0]?.categoryName || "" };
      const h1 = { landmarks: handsLandmarks[1], handedness: handednesses?.[1]?.[0]?.categoryName || "" };

      // Oyna rejimida ekrandagi X koordinatasi:
      const h0_x = (1 - h0.landmarks[0].x) * screenW;
      const h1_x = (1 - h1.landmarks[0].x) * screenW;

      // Agar MediaPipe aniq Left va Right ni ajratgan bo'lsa (Mirror: Left=Chap/Control, Right=O'ng/Pluck)
      if (h0.handedness && h1.handedness && h0.handedness !== h1.handedness) {
        if (h0.handedness === "Right") {
          pluckHand = { landmarks: h0.landmarks, id: "right_hand" };
          controlHand = { landmarks: h1.landmarks, id: "left_hand" };
        } else {
          pluckHand = { landmarks: h1.landmarks, id: "right_hand" };
          controlHand = { landmarks: h0.landmarks, id: "left_hand" };
        }
      } else {
        // Handedness noaniq bo'lganda X bo'yicha barqaror histerezis bilan ajratish:
        // Masofa juda yaqin bo'lsa (yaqinlashuvda sakrab ketmasligi uchun oldingi rolni ushlab turadi)
        const dist = Math.abs(h0_x - h1_x);
        if (dist < 80 && this.lastPluckHandId) {
          // Oldingi rolni saqlaymiz
          pluckHand = { landmarks: h0.landmarks, id: this.lastPluckHandId };
          controlHand = { landmarks: h1.landmarks, id: this.lastControlHandId };
        } else if (h0_x > h1_x) {
          pluckHand = { landmarks: h0.landmarks, id: "hand_right" };
          controlHand = { landmarks: h1.landmarks, id: "hand_left" };
        } else {
          pluckHand = { landmarks: h1.landmarks, id: "hand_right" };
          controlHand = { landmarks: h0.landmarks, id: "hand_left" };
        }
      }

      this.lastPluckHandId = pluckHand.id;
      this.lastControlHandId = controlHand.id;
    }

    // --- 2-QO'L: Nazorat mantiqi (Taranglik, Chimchilash, Torlar soni) ---
    if (controlHand) {
      this.processControlHand(controlHand, screenW, screenH);
    } else {
      this.controlHand.active = false;
      this.controlHand.tensionMultiplier = 1.0;
    }

    // --- 1-QO'L: Chertish mantiqi (Plucking & String Deformation) ---
    if (pluckHand) {
      this.processPluckHand(pluckHand, screenW, screenH, now);
    }
  }

  /**
   * 2-qo'lni qayta ishlash: Chimchilash va Y balandligi
   */
  processControlHand(hand, screenW, screenH) {
    const lm = hand.landmarks;
    this.controlHand.active = true;

    // Bosh barmoq (4) va Ko'rsatkich barmoq (8)
    const pThumb = { x: (1 - lm[4].x) * screenW, y: lm[4].y * screenH };
    const pIndex = { x: (1 - lm[8].x) * screenW, y: lm[8].y * screenH };
    const pWrist = { x: (1 - lm[0].x) * screenW, y: lm[0].y * screenH };

    // Chimchilash masofasi (Pinch distance)
    const pinchDist = Math.hypot(pThumb.x - pIndex.x, pThumb.y - pIndex.y);
    this.controlHand.pinchDistance = pinchDist;
    this.controlHand.isPinching = pinchDist < 45; // 45px dan yaqin bo'lsa chimchilash

    // Y koordinatasi bo'yicha balandlik (0 = eng tepa, 1 = eng past)
    const yNorm = Math.max(0, Math.min(1, pIndex.y / screenH));
    this.controlHand.yPercent = yNorm;

    // Y koordinatasi torlar tarangligini va akustik rezonansini boshqaradi
    // Qo'l yuqorida bo'lsa torlar tarangroq va yorqinroq
    this.controlHand.tensionMultiplier = 0.8 + (1 - yNorm) * 0.8;

    // Chimchilaganda torlar sonini almashtirish (4 ta yoki 8 ta tor)
    if (this.controlHand.isPinching) {
      this.controlHand.pinchPoint = {
        x: (pThumb.x + pIndex.x) / 2,
        y: (pThumb.y + pIndex.y) / 2
      };
    } else {
      this.controlHand.pinchPoint = null;
    }
  }

  /**
   * 1-qo'lni qayta ishlash: Ko'rsatkich barmoq uchi (landmark 8) orqali torlarni chertish
   */
  processPluckHand(hand, screenW, screenH, now) {
    const lm = hand.landmarks;
    // Asosiy chertuvchi nuqta: ko'rsatkich barmoq uchi (8)
    const tip = {
      x: (1 - lm[8].x) * screenW,
      y: lm[8].y * screenH
    };

    // Qo'shimcha chertuvchi nuqta: bosh barmoq uchi (4)
    const thumbTip = {
      x: (1 - lm[4].x) * screenW,
      y: lm[4].y * screenH
    };

    const fingerKeys = [
      { id: `${hand.id}_index`, pos: tip, radius: 18 },
      { id: `${hand.id}_thumb`, pos: thumbTip, radius: 16 }
    ];

    for (const finger of fingerKeys) {
      const prev = this.prevFingers.get(finger.id);
      const currPos = finger.pos;

      if (prev) {
        // Har bir faol tor bilan to'qnashuvni tekshirish
        for (let i = 0; i < this.maxActiveStrings; i++) {
          const str = this.strings[i];

          // Barmoq torning gorizontal chegarasi ichidami?
          if (currPos.x >= str.x1 && currPos.x <= str.x2) {
            this.checkStringInteraction(str, prev, currPos, finger.id, now);
          }
        }
      }

      this.prevFingers.set(finger.id, { x: currPos.x, y: currPos.y, time: now });
    }
  }

  /**
   * Bitta tor bilan barmoq o'rtasidagi fizika va deformatsiya
   */
  checkStringInteraction(str, prevPos, currPos, fingerId, now) {
    const stringRestY = str.y;
    const maxDeflection = 38; // Maksimal egilish chegarasi (shundan keyin uziladi)

    // 1. Agar tor allaqachon shu barmoq tomonidan egilayotgan bo'lsa (Grabbed)
    if (str.isGrabbed && str.grabHandId === fingerId) {
      const deltaY = currPos.y - stringRestY;
      str.grabX = currPos.x;
      str.grabY = currPos.y;
      str.displacement = deltaY;

      // Egilish chegaradan oshdimi? (Uzilish / Release)
      if (Math.abs(deltaY) > maxDeflection) {
        this.pluckString(str, currPos.x, currPos.y, prevPos, currPos, now);
      }
      return;
    }

    // 2. Barmoq tor chizig'ini kesib o'tdimi? (Line crossing detection)
    const crossedDown = prevPos.y < stringRestY && currPos.y >= stringRestY;
    const crossedUp = prevPos.y > stringRestY && currPos.y <= stringRestY;

    if (crossedDown || crossedUp) {
      const speed = Math.hypot(currPos.x - prevPos.x, currPos.y - prevPos.y);

      // Agar tezlik yuqori bo'lsa (tez chertish / fast swipe), darhol uziladi
      if (speed > 14) {
        this.pluckString(str, currPos.x, stringRestY, prevPos, currPos, now);
      } else {
        // Sekin harakatda tor barmoqqa "yopishadi" va egiladi
        str.isGrabbed = true;
        str.grabHandId = fingerId;
        str.grabX = currPos.x;
        str.grabY = currPos.y;
        str.displacement = currPos.y - stringRestY;
      }
      return;
    }

    // 3. Barmoq torga juda yaqin turibdimi? (Yaqinlashish / Proximity grab)
    const distY = Math.abs(currPos.y - stringRestY);
    if (!str.isGrabbed && distY < 12) {
      str.isGrabbed = true;
      str.grabHandId = fingerId;
      str.grabX = currPos.x;
      str.grabY = currPos.y;
      str.displacement = currPos.y - stringRestY;
    }
  }

  /**
   * Torni "uzish" va jaranglatish (Pluck String)
   */
  pluckString(str, hitX, hitY, prevPos, currPos, now) {
    // Tebranishni to'xtatish va "uzish"
    str.isGrabbed = false;
    str.grabHandId = null;

    // Barmoq tezligi bo'yicha zarba kuchi (velocity)
    const speed = Math.hypot(currPos.x - prevPos.x, currPos.y - prevPos.y);
    const audioVelocity = Math.max(0.25, Math.min(1.0, speed / 25));

    // Boshlang'ich tebranish turtkisi (Impulse)
    const direction = str.displacement !== 0 ? -Math.sign(str.displacement) : (currPos.y > prevPos.y ? 1 : -1);
    str.velocity = direction * (18 + Math.min(speed * 1.5, 40));
    str.lastPluckTime = now;
    str.glowIntensity = 1.0;

    // Audio yangratish
    triggerString(str.index, audioVelocity);

    // Vizual uchqun va zarrachalar hodisasi
    if (this.onPluckCallback) {
      this.onPluckCallback({
        stringIndex: str.index,
        x: hitX,
        y: hitY,
        velocity: audioVelocity,
        note: str.note
      });
    }
  }

  /**
   * Barcha tutqichlarni bo'shatish
   */
  releaseAllGrabs() {
    for (const str of this.strings) {
      if (str.isGrabbed) {
        str.isGrabbed = false;
        str.grabHandId = null;
        str.velocity = -Math.sign(str.displacement) * 15;
      }
    }
  }

  /**
   * Fizika qonuniyatlarini har freymda yangilash (Damped Harmonic Motion)
   */
  updatePhysics() {
    const tensionMult = this.controlHand.tensionMultiplier || 1.0;

    for (const str of this.strings) {
      if (str.isGrabbed) {
        // Barmoq ushlab turganda erkin tebranmaydi
        continue;
      }

      if (Math.abs(str.displacement) > 0.05 || Math.abs(str.velocity) > 0.05) {
        // Guk qonuni (Hooke's law) + So'nish (Damping)
        const effectiveTension = str.tension * tensionMult;
        const springForce = -effectiveTension * str.displacement;
        str.velocity += springForce;
        str.velocity *= str.damping;
        str.displacement += str.velocity;

        // Tebranish fazasi (To'lqin vizualizatsiyasi uchun)
        str.vibrationPhase += 0.4;
      } else {
        str.displacement = 0;
        str.velocity = 0;
      }

      // Yorug'lik (glow) asta-sekin so'nishi
      if (str.glowIntensity > 0) {
        str.glowIntensity = Math.max(0, str.glowIntensity - 0.025);
      }
    }
  }

  /**
   * Ekranga torlarni va ularning deformatsiyasini chizish
   * @param {CanvasRenderingContext2D} ctx - Canvas konteksti
   */
  draw(ctx) {
    const notes = getCurrentNotes();

    for (let i = 0; i < this.maxActiveStrings; i++) {
      const str = this.strings[i];
      str.note = notes[i] || str.note;

      const { x1, x2, y, displacement, isGrabbed, grabX, grabY, glowIntensity } = str;

      ctx.save();

      // Torning rangi (Yengil va toza ranglar, shadowBlur siz)
      let strokeColor = "rgba(56, 189, 248, 0.4)";
      let lineWidth = 2;

      if (isGrabbed) {
        strokeColor = "#f59e0b"; // Egilayotganda sariq
        lineWidth = 3;
      } else if (glowIntensity > 0.05) {
        strokeColor = "#00ffcc"; // Yangi chertilganda och yashil/moviy
        lineWidth = 2.5;
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";

      ctx.beginPath();
      ctx.moveTo(x1, y);

      if (isGrabbed) {
        // Barmoqqa ergashib egiluvchi bitta Bezier egri chizig'i
        ctx.quadraticCurveTo(grabX, grabY, x2, y);
      } else if (Math.abs(displacement) > 0.1) {
        // 3-bosqichdagi yengil to'lqinlanuvchi Bezier tebranishi
        const midX = (x1 + x2) / 2;
        const controlY = y + displacement;
        ctx.quadraticCurveTo(midX, controlY, x2, y);
      } else {
        // Tinch holatdagi to'g'ri chiziq
        ctx.lineTo(x2, y);
      }

      ctx.stroke();

      // Torning chap tomonidagi Nota belgisi
      ctx.font = "600 12px 'JetBrains Mono', monospace";
      ctx.fillStyle = isGrabbed ? "#f59e0b" : glowIntensity > 0.1 ? "#00ffcc" : "#94a3b8";
      ctx.fillText(`[${i + 1}] ${str.note}`, x1 - 58, y + 4);

      // Torning ikki chekkasidagi nuqtalar
      ctx.beginPath();
      ctx.arc(x1, y, 2.5, 0, Math.PI * 2);
      ctx.arc(x2, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();

      ctx.restore();
    }

    // 2-Qo'l vizual indikatori (Control hand badge)
    if (this.controlHand.active) {
      this.drawControlHandIndicator(ctx);
    }
  }

  /**
   * 2-qo'l (Nazorat qo'li) ustiga chiroyli holat indikatorini chizish
   */
  drawControlHandIndicator(ctx) {
    const { isPinching, pinchPoint } = this.controlHand;

    if (isPinching && pinchPoint) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pinchPoint.x, pinchPoint.y, 20, 0, Math.PI * 2);
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = "700 11px 'JetBrains Mono', monospace";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("CHIMCHILASH: FAOL", pinchPoint.x - 55, pinchPoint.y - 26);
      ctx.restore();
    }
  }
}
