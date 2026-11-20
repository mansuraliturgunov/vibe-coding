import { triggerFrequency, freqToNote } from "./audio.js";

/**
 * 2D vektorlar va geometriya yordamchilari
 */
function distance(p1, p2) {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

// 2 ta kesmaning kesishishini aniqlash (Line segment intersection)
function getIntersection(a1, a2, b1, b2) {
  const dX_a = a2.x - a1.x;
  const dY_a = a2.y - a1.y;
  const dX_b = b2.x - b1.x;
  const dY_b = b2.y - b1.y;

  const denom = -dX_b * dY_a + dX_a * dY_b;
  if (Math.abs(denom) < 0.0001) return null; // Parallel

  const s = (-dY_a * (a1.x - b1.x) + dX_a * (a1.y - b1.y)) / denom;
  const t = ( dX_b * (a1.y - b1.y) - dY_b * (a1.x - b1.x)) / denom;

  if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
    return {
      x: a1.x + t * dX_a,
      y: a1.y + t * dY_a,
      tTor: s // Tor bo'ylab 0..1 pozitsiyasi
    };
  }
  return null;
}

// Nuqtadan kesmagacha bo'lgan eng qisqa masofa va proyeksiyasi
function distToSegment(p, v, w) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return { dist: distance(p, v), t: 0, proj: v };
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
  return { dist: distance(p, proj), t, proj };
}

/**
 * Erkin Virtual Torlar Boshqaruvchisi (Freeform Interactive String Manager)
 */
export class StringManager {
  constructor() {
    this.strings = []; // Sayt ochilganda bo'sh bo'ladi!
    this.stringCounter = 0;

    // Chizish va Tahrirlash holatlari
    this.drawingState = {
      isDrawing: false,
      startX: 0,
      startY: 0,
      currX: 0,
      currY: 0
    };

    this.editingEndpoint = null; // { stringId, end: 'p1' | 'p2' }
    this.hoverEndpoint = null;   // { stringId, end: 'p1' | 'p2' }
    this.twoHandDrawing = false; // Faqat ikkala qo'l birga chimchilanganda yangi tor chizish

    // Oldingi freym barmoq koordinatalari
    this.prevFingers = new Map();

    // Callback
    this.onPluckCallback = null;
    this.onStringsChangeCallback = null;
  }

  /**
   * Barcha torlarni o'chirish (Tozalash)
   */
  clearStrings() {
    this.strings = [];
    this.stringCounter = 0;
    this.cancelInteractions();
    if (this.onStringsChangeCallback) {
      this.onStringsChangeCallback(this.strings);
    }
  }

  /**
   * Oxirgi torni o'chirish (Undo)
   */
  undoString() {
    if (this.strings.length > 0) {
      this.strings.pop();
      this.cancelInteractions();
      if (this.onStringsChangeCallback) {
        this.onStringsChangeCallback(this.strings);
      }
    }
  }

  cancelInteractions() {
    this.drawingState.isDrawing = false;
    this.editingEndpoint = null;
    this.hoverEndpoint = null;
  }

  setOnPluck(cb) {
    this.onPluckCallback = cb;
  }

  setOnStringsChange(cb) {
    this.onStringsChangeCallback = cb;
  }

  /**
   * Tor uzunligidan fizik chastota (Hz) hisoblash (Mersenne qonuni)
   */
  calculateFrequency(length) {
    const baseLen = 600;
    const baseFreq = 120; // O'rtacha akustik gitara diapazoni
    const clamped = Math.max(50, Math.min(1400, length));
    const freq = Math.round((baseFreq * (baseLen / clamped)) * 10) / 10;
    return freq;
  }

  /**
   * Yangi tor obyektini yaratish
   */
  createString(p1, p2) {
    this.stringCounter++;
    const len = distance(p1, p2);
    const freq = this.calculateFrequency(len);
    const note = freqToNote(freq);

    const newStr = {
      id: this.stringCounter,
      p1: { x: p1.x, y: p1.y },
      p2: { x: p2.x, y: p2.y },
      length: len,
      frequency: freq,
      noteName: note,
      displacement: 0,  // Normal bo'yicha tebranish
      velocity: 0,
      tension: 0.22,
      damping: 0.945,
      isGrabbed: false,
      grabT: 0.5,
      grabOffset: 0,
      glowTimer: 0
    };

    this.strings.push(newStr);
    if (this.onStringsChangeCallback) {
      this.onStringsChangeCallback(this.strings);
    }
    return newStr;
  }

  /**
   * Tor o'lchamlarini yangilash (uchini surishda)
   */
  updateStringEndpoints(str, p1, p2) {
    str.p1 = { x: p1.x, y: p1.y };
    str.p2 = { x: p2.x, y: p2.y };
    str.length = distance(p1, p2);
    str.frequency = this.calculateFrequency(str.length);
    str.noteName = freqToNote(str.frequency);
  }

  /**
   * Resize vaqti
   */
  resize(width, height) {
    // Dinamik koordinatalar erkin saqlanadi
  }

  /**
   * Qo'llar harakatini qayta ishlash
   */
  updateHands(handsLandmarks, handednesses, screenW, screenH) {
    const now = performance.now();

    if (!handsLandmarks || handsLandmarks.length === 0) {
      if (this.twoHandDrawing || this.drawingState.isDrawing) {
        this.finishDrawing();
      }
      this.twoHandDrawing = false;
      this.editingEndpoint = null;
      this.hoverEndpoint = null;
      this.prevFingers.clear();
      return;
    }

    // 1. Har bir qo'lning barmoq va chimchilash holatini hisoblash
    const hands = [];
    for (let hIdx = 0; hIdx < handsLandmarks.length; hIdx++) {
      const lm = handsLandmarks[hIdx];
      const pThumb = { x: (1 - lm[4].x) * screenW, y: lm[4].y * screenH };
      const pIndex = { x: (1 - lm[8].x) * screenW, y: lm[8].y * screenH };
      const pinchDist = distance(pThumb, pIndex);
      const isPinching = pinchDist < 38; // 38px dan yaqin bo'lsa chimchilash
      const pinchCenter = {
        x: (pThumb.x + pIndex.x) / 2,
        y: (pThumb.y + pIndex.y) / 2
      };

      hands.push({
        id: `hand_${hIdx}`,
        hIdx,
        pThumb,
        pIndex,
        isPinching,
        pinchDist,
        pinchCenter
      });
    }

    // 2. IKKI QO'LLI CHIMCHILASH (Two-Handed Pinch & Stretch):
    // Yangi tor FAQAT ikkala qo'l bir vaqtda chimchilanganda yaratiladi
    const bothPinching = hands.length >= 2 && hands[0].isPinching && hands[1].isPinching;

    if (bothPinching) {
      // Ikkala qo'l chimchilagan: yangi tor chizish rejimi
      this.editingEndpoint = null; // Uchini surish bekor qilinadi
      this.twoHandDrawing = true;
      this.drawingState.isDrawing = true;

      // Chap va o'ng qo'l chimchilash nuqtalari orasida tor tortiladi
      this.drawingState.startX = hands[0].pinchCenter.x;
      this.drawingState.startY = hands[0].pinchCenter.y;
      this.drawingState.currX = hands[1].pinchCenter.x;
      this.drawingState.currY = hands[1].pinchCenter.y;
    } else {
      // Agar avval ikki qo'l bilan chizilayotgan bo'lsa va endi biri qo'yib yuborilsa
      if (this.twoHandDrawing) {
        this.finishDrawing();
        this.twoHandDrawing = false;
      }

      // 3. BITTA QO'LDA CHIMCHILASH:
      // Yangi tor chizilmaydi! Faqat mavjud tor uchlarini surish uchun ishlaydi
      let anyPinching = false;
      for (const hand of hands) {
        if (hand.isPinching) {
          anyPinching = true;
          // Agar allaqachon uchini surayotgan bo'lsak
          if (this.editingEndpoint) {
            const { stringId, end } = this.editingEndpoint;
            const str = this.strings.find(s => s.id === stringId);
            if (str) {
              if (end === "p1") {
                this.updateStringEndpoints(str, hand.pinchCenter, str.p2);
              } else {
                this.updateStringEndpoints(str, str.p1, hand.pinchCenter);
              }
            }
          } else {
            // Yaqin atrofdagi tor uchini topish (masofa < 32px)
            const nearest = this.findNearestEndpoint(hand.pinchCenter, 32);
            if (nearest) {
              this.editingEndpoint = nearest;
            }
            // Tor uchi topilmasa — HECH QANDAY tor chizilmaydi!
          }
        }
      }

      // Agar biror qo'l chimchilanmagan bo'lsa, uchini surish to'xtaydi
      if (!anyPinching) {
        this.editingEndpoint = null;
      }

      // 4. CHERTISH VA HOVER:
      // Ochiq ko'rsatkich barmoq bilan torlarni kesib o'tish
      for (const hand of hands) {
        if (!hand.isPinching) {
          this.checkHoverEndpoint(hand.pIndex);

          const prev = this.prevFingers.get(hand.id);
          if (prev && !prev.wasPinching) {
            this.checkPluck(prev.pIndex, hand.pIndex, now);
          }
        }
      }
    }

    // Holatlarni saqlash
    for (const hand of hands) {
      this.prevFingers.set(hand.id, {
        pIndex: hand.pIndex,
        pThumb: hand.pThumb,
        pinchCenter: hand.pinchCenter,
        wasPinching: hand.isPinching,
        time: now
      });
    }
  }

  /**
   * Sichqoncha orqali chimchilashni boshqarish (Desktop qulayligi)
   */
  handlePinch(point) {
    // Agar tor uchini bosgan bo'lsa — surish
    if (this.editingEndpoint) {
      const { stringId, end } = this.editingEndpoint;
      const str = this.strings.find(s => s.id === stringId);
      if (str) {
        if (end === "p1") {
          this.updateStringEndpoints(str, point, str.p2);
        } else {
          this.updateStringEndpoints(str, str.p1, point);
        }
      }
      return;
    }

    const nearest = this.findNearestEndpoint(point, 32);
    if (nearest) {
      this.editingEndpoint = nearest;
      return;
    }

    // Sichqonchada bitta kursor bo'lgani uchun drag qilib chizish mumkin
    if (!this.drawingState.isDrawing) {
      this.drawingState.isDrawing = true;
      this.drawingState.startX = point.x;
      this.drawingState.startY = point.y;
    }
    this.drawingState.currX = point.x;
    this.drawingState.currY = point.y;
  }

  /**
   * Chizishni yakunlash (Tor hosil qilish)
   */
  finishDrawing() {
    if (!this.drawingState.isDrawing) return;

    const p1 = { x: this.drawingState.startX, y: this.drawingState.startY };
    const p2 = { x: this.drawingState.currX, y: this.drawingState.currY };
    const len = distance(p1, p2);

    // Minimal uzunlik 45 piksel bo'lsa tor yaratiladi
    if (len >= 45) {
      this.createString(p1, p2);
    }

    this.drawingState.isDrawing = false;
  }

  /**
   * Yaqin atrofdagi tor uchini topish
   */
  findNearestEndpoint(p, threshold = 28) {
    let nearest = null;
    let minDist = threshold;

    for (const str of this.strings) {
      const d1 = distance(p, str.p1);
      if (d1 < minDist) {
        minDist = d1;
        nearest = { stringId: str.id, end: "p1" };
      }
      const d2 = distance(p, str.p2);
      if (d2 < minDist) {
        minDist = d2;
        nearest = { stringId: str.id, end: "p2" };
      }
    }
    return nearest;
  }

  checkHoverEndpoint(p) {
    this.hoverEndpoint = this.findNearestEndpoint(p, 28);
  }

  /**
   * Torlarni barmoq bilan chertish (To'qnashuv va Fizika)
   */
  checkPluck(prevTip, currTip, now) {
    const fingerSpeed = distance(prevTip, currTip);

    for (const str of this.strings) {
      // 1. Kesma-kesma to'qnashuvi
      const hit = getIntersection(prevTip, currTip, str.p1, str.p2);

      if (hit) {
        // Tor chertildi!
        this.pluckString(str, hit.x, hit.y, hit.tTor, fingerSpeed, now);
        continue;
      }

      // 2. Barmoq juda yaqin o'tganda (proximity)
      const { dist, t } = distToSegment(currTip, str.p1, str.p2);
      if (dist < 14 && t > 0.05 && t < 0.95 && fingerSpeed > 5) {
        const prevDist = distToSegment(prevTip, str.p1, str.p2).dist;
        if (prevDist >= 14) {
          this.pluckString(str, currTip.x, currTip.y, t, fingerSpeed, now);
        }
      }
    }
  }

  /**
   * Torni yangratish va tebratish
   */
  pluckString(str, hitX, hitY, t, speed, now) {
    // Tebranish zarbasi
    const velocity = Math.max(0.25, Math.min(1.0, speed / 22));
    str.velocity = 18 * velocity;
    str.glowTimer = 1.0;

    // Uzunligiga mos ovozni chiqarish
    triggerFrequency(str.frequency, velocity);

    if (this.onPluckCallback) {
      this.onPluckCallback({
        stringId: str.id,
        frequency: str.frequency,
        note: str.noteName,
        velocity
      });
    }
  }

  /**
   * Har freymda tebranish fizikasini yangilash (Harmonic Oscillator)
   */
  updatePhysics() {
    for (const str of this.strings) {
      if (Math.abs(str.displacement) > 0.05 || Math.abs(str.velocity) > 0.05) {
        const springForce = -str.tension * str.displacement;
        str.velocity += springForce;
        str.velocity *= str.damping;
        str.displacement += str.velocity;
      } else {
        str.displacement = 0;
        str.velocity = 0;
      }

      if (str.glowTimer > 0) {
        str.glowTimer = Math.max(0, str.glowTimer - 0.03);
      }
    }
  }

  /**
   * Ekranga barcha torlarni va chizish/tahrirlashni chizish (Yengil va toza 60 FPS)
   */
  draw(ctx) {
    // 1. Chizilgan mavjud torlarni chizish
    for (const str of this.strings) {
      this.drawString(ctx, str);
    }

    // 2. Ayni paytda chizilayotgan vaqtinchalik tor (Drawing preview)
    if (this.drawingState.isDrawing) {
      this.drawTempString(ctx);
    }
  }

  /**
   * Bitta torni chizish
   */
  drawString(ctx, str) {
    const { p1, p2, displacement, glowTimer, id, frequency, noteName } = str;

    ctx.save();

    // Torning yo'nalishi va normal vektori (Egilish uchun)
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = str.length || 1;
    // Normal vektor (perpendikulyar)
    const nx = -dy / len;
    const ny = dx / len;

    // Tor rangi
    let strokeColor = "rgba(56, 189, 248, 0.6)";
    let lineWidth = 2.6; // 15% qalinroq (aniq ko'rinishi uchun)

    if (glowTimer > 0.05) {
      strokeColor = "#00ffcc"; // Yangi chertilganda yorqinroq yashil
      lineWidth = 3.5;
    }

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);

    if (Math.abs(displacement) > 0.1) {
      // Tebranayotgan Bezier egri chizig'i
      const midX = (p1.x + p2.x) / 2 + nx * displacement;
      const midY = (p1.y + p2.y) / 2 + ny * displacement;
      ctx.quadraticCurveTo(midX, midY, p2.x, p2.y);
    } else {
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();

    // Ikki uchidagi ushlash nuqtalari
    this.drawEndpoint(ctx, p1, str.id, "p1");
    this.drawEndpoint(ctx, p2, str.id, "p2");

    // Tor o'rtasida yoki yonida uning raqami va chastotasi (#1 146Hz D3)
    const labelX = (p1.x + p2.x) / 2 + nx * 14;
    const labelY = (p1.y + p2.y) / 2 + ny * 14;

    ctx.font = "600 11px 'JetBrains Mono', monospace";
    ctx.fillStyle = glowTimer > 0.1 ? "#00ffcc" : "#cbd5e1";
    ctx.fillText(`#${id} ${Math.round(frequency)}Hz (${noteName})`, labelX, labelY);

    ctx.restore();
  }

  /**
   * Tor uchidagi ushlash nuqtasi
   */
  drawEndpoint(ctx, p, stringId, end) {
    const isHover = this.hoverEndpoint && this.hoverEndpoint.stringId === stringId && this.hoverEndpoint.end === end;
    const isEditing = this.editingEndpoint && this.editingEndpoint.stringId === stringId && this.editingEndpoint.end === end;

    ctx.beginPath();
    const radius = isEditing ? 7.5 : isHover ? 6.5 : 4.2;
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);

    if (isEditing) {
      ctx.fillStyle = "#f59e0b"; // Surilayotganda to'q sariq
    } else if (isHover) {
      ctx.fillStyle = "#38bdf8"; // Barmoq yaqinlashganda och moviy
    } else {
      ctx.fillStyle = "rgba(56, 189, 248, 0.75)";
    }
    ctx.fill();

    // Ichki oq yadro
    if (isHover || isEditing) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  }

  /**
   * Chizilayotgan vaqtinchalik torni chizish
   */
  drawTempString(ctx) {
    const { startX, startY, currX, currY } = this.drawingState;
    const len = distance({ x: startX, y: startY }, { x: currX, y: currY });
    const freq = this.calculateFrequency(len);
    const note = freqToNote(freq);

    ctx.save();
    // Chizilayotgan tor: sariq chiziq (15% qalinroq)
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 2.6;
    ctx.setLineDash([6, 4]);

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(currX, currY);
    ctx.stroke();

    // Uchlaridagi nuqtalar
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(startX, startY, 5, 0, Math.PI * 2);
    ctx.arc(currX, currY, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#fbbf24";
    ctx.fill();

    // Real vaqtli chastota va uzunlik ko'rsatkichi
    const midX = (startX + currX) / 2 + 10;
    const midY = (startY + currY) / 2 - 10;
    ctx.font = "700 12px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`+ Yangi tor: ${Math.round(freq)}Hz (${note}) [${Math.round(len)}px]`, midX, midY);

    ctx.restore();
  }
}
