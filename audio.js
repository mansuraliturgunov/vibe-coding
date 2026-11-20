import * as Tone from "tone";

/**
 * Gitara tembriga mos sozlangan gamma to'plamlari (3 va 4-oktava gitara diapazoni)
 */
export const SCALES = {
  pentatonic: {
    name: "Pentatonic (Akustik)",
    notes: ["E3", "G3", "A3", "B3", "D4", "E4", "G4", "A4"]
  },
  harp: {
    name: "Harp (Klassik Arfa)",
    notes: ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]
  },
  synth: {
    name: "Synth (Cyberpunk)",
    notes: ["A3", "C4", "D4", "E4", "G4", "A4", "C5", "E5"]
  },
  spanish: {
    name: "Flamenco (Ispancha)",
    notes: ["E3", "F3", "G#3", "A3", "B3", "C4", "D4", "E4"]
  },
  folk: {
    name: "D-Folk Gitara",
    notes: ["D3", "F#3", "A3", "B3", "D4", "E4", "F#4", "A4"]
  }
};

let currentScaleKey = "pentatonic";
let isAudioStarted = false;

// Audio zanjir komponentlari
let masterVolume = null;
let compressor = null;
let lightReverb = null;
let guitarEQ = null;
let guitarBodyFilter = null;

// Torlar uchun sintezatorlar
let stringPlucks = []; // Karplus-Strong tor urilishi va tebranishi
let bodySynths = null;  // Gitara yog'och korpusi rezonansi va tabiiy so'nishi (sustain/decay)

/**
 * Gitara Audio Engine ni ishga tushirish (Tone.start)
 */
export async function initAudio() {
  if (isAudioStarted) return true;

  try {
    await Tone.start();

    // 1. Master Volume
    masterVolume = new Tone.Volume(-2).toDestination();

    // 2. Dinamik Kompressor (Ovozni tekis va barqaror qilish)
    compressor = new Tone.Compressor({
      threshold: -18,
      ratio: 2.8,
      attack: 0.005,
      release: 0.25
    });

    // 3. Yengil Reverb (ortiqcha loyqalanmaydigan, akustik xona aks-sadosi)
    lightReverb = new Tone.Reverb({
      decay: 2.2,
      preDelay: 0.015,
      wet: 0.22
    });
    await lightReverb.generate();

    // 4. Gitara 3-bandli EQ (Akustik/Elektro gitara tembri uchun nozik sozlangan)
    // Low: yog'och korpusning chuqur nafasi (+3.2 dB)
    // Mid: plastik shovqinni kesish (-2.5 dB)
    // High: torlarning kumushrang yaltirashi (+1.8 dB)
    guitarEQ = new Tone.EQ3({
      low: 3.2,
      mid: -2.5,
      high: 1.8,
      lowFrequency: 250,
      highFrequency: 3200
    });

    // 5. Gitara korpusi filtri (Sun'iy raqamli o'tkirlikni yumshatuvchi 5800Hz lowpass)
    guitarBodyFilter = new Tone.Filter({
      frequency: 5800,
      type: "lowpass",
      rolloff: -12
    });

    // Effektlar zanjirini ulash:
    // Plucks & Body -> Filter -> EQ -> Compressor -> Reverb -> Master
    guitarBodyFilter.connect(guitarEQ);
    guitarEQ.connect(compressor);
    compressor.connect(lightReverb);
    lightReverb.connect(masterVolume);

    // 6. Karplus-Strong PluckSynth (Har bir tor uchun alohida sozlash)
    // resonance: 0.988 — torning uzoq vaqt "chirt" etmasdan tabiiy tebranib turishi uchun
    // dampening: 4200 — torning mayin so'nish tezligi
    stringPlucks = [];
    for (let i = 0; i < 8; i++) {
      const pluck = new Tone.PluckSynth({
        attackNoise: 0.9,     // Yumshoq barmoq/mediator chertishi
        dampening: 4200,      // Yuqori chastotalar so'nish filtri
        resonance: 0.988,     // Torning davomiy tabiiy tebranishi (sustain)
        release: 3.5          // So'nish vaqti
      });
      pluck.connect(guitarBodyFilter);
      stringPlucks.push(pluck);
    }

    // 7. Gitara korpusi garmonikasi (Acoustic Body Resonance Synth)
    // Bu qatlam torga chuqurlik, yog'och korpus sadosi va uzluksiz tabiiy so'nish (decay) beradi
    bodySynths = new Tone.PolySynth(Tone.Synth, {
      oscillator: {
        type: "triangle8" // Boy yog'och akustik garmonikalari
      },
      envelope: {
        attack: 0.005,    // Bir zumda boshlanadi
        decay: 3.2,       // 3.2 soniya davomida mayin so'nadi
        sustain: 0.03,    // Uzoq tebranish
        release: 2.4      // Yumshoq o'chish
      },
      volume: -8.5
    });
    bodySynths.connect(guitarBodyFilter);

    isAudioStarted = true;
    console.log("Gitara Audio Engine (Karplus-Strong + EQ + Reverb) faollashdi!");
    return true;
  } catch (err) {
    console.error("Gitara Audio Engine xatoligi:", err);
    return false;
  }
}

/**
 * Audio faollashtirilganligini tekshirish
 */
export function isAudioReady() {
  return isAudioStarted && Tone.context && Tone.context.state === "running";
}

/**
 * Hozirgi tanlangan gamma notalarini olish
 */
export function getCurrentNotes() {
  return SCALES[currentScaleKey].notes;
}

/**
 * Joriy gamma ma'lumotlarini olish
 */
export function getCurrentScale() {
  return SCALES[currentScaleKey];
}

/**
 * Gammani o'zgartirish
 */
export function setScale(scaleKey) {
  if (SCALES[scaleKey]) {
    currentScaleKey = scaleKey;
  }
}

/**
 * Bitta gitara torini chertish (0..7)
 * @param {number} stringIndex - Tor indeksi (0 dan 7 gacha)
 * @param {number} velocity - Chertish kuchi (0.1 dan 1.0 gacha)
 */
export function triggerString(stringIndex, velocity = 0.85) {
  if (!isAudioReady()) return null;

  const notes = getCurrentNotes();
  const noteIndex = Math.max(0, Math.min(stringIndex, notes.length - 1));
  const note = notes[noteIndex];

  const safeVel = Math.max(0.15, Math.min(velocity, 1.0));

  try {
    const pluck = stringPlucks[noteIndex];
    const now = Tone.now();

    // 1. Karplus-Strong tor urilishi va tebranishi
    if (pluck) {
      pluck.triggerAttack(note, now);
    }

    // 2. Gitara yog'och korpusining iliq tebranishi (tabiiy so'nuvchi akkustik qatlam)
    if (bodySynths) {
      bodySynths.triggerAttackRelease(note, "4n", now, safeVel * 0.85);
    }

    return { note, stringIndex: noteIndex, velocity: safeVel };
  } catch (e) {
    console.warn("Gitara torini chalishda xato:", e);
    return null;
  }
}

/**
 * Klaviaturadan nota chalish (1..8 tugmalari uchun)
 * @param {string} key - Bosilgan tugma ("1".."8")
 */
export function triggerByKey(key) {
  const index = parseInt(key, 10) - 1;
  if (index >= 0 && index < 8) {
    return triggerString(index, 0.9);
  }
  return null;
}
