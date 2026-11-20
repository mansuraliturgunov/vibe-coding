# Air Strings — Virtual Musiqiy Dastur (1-Bosqich: MVP)

macOS (Apple Silicon) muhitida veb-kamera orqali 2 ta qo‘l harakatlarini 21 ta nuqta bo‘yicha real vaqtda (60 FPS) aniqlovchi dastur.

## 🚀 Ishga tushirish

1. Lokal serverni ishga tushiring:
```bash
npm run dev
```

2. Brauzerda quyidagi manzilni oching:
```
http://localhost:5173
```

3. Brauzer kamera ruxsatini so‘raganda **"Ruxsat berish" (Allow)** tugmasini bosing.

---

## 🛠 1-Bosqichda amalga oshirilgan ishlar:
- **Loyiha strukturasi:** Vanilla JS, HTML5 Canvas va zamonaviy Cyber/Neon CSS interfeysi (Vite asosida).
- **Kutubxonalar:** `@mediapipe/tasks-vision` va `tone` o‘rnatildi.
- **Model va WASM:** MediaPipe `hand_landmarker.task` va WASM fayllari lokal yuklandi (CORS va internet kechikishisiz ishlash uchun).
- **Kamera va Mirror rejim:** Veb-kamera oqimi to‘liq ekranga moslashtirilib (cover), gorizontal oyna (mirror) rejimida chizildi.
- **Hand Tracking:** Ikkala qo‘lning 21 ta nuqtasi (qizil neon nuqtalar) va suyak chiziqlari (yashil neon chiziqlar) kechikishsiz real vaqtda chizilmoqda.
- **HUD paneli:** Ekranning yuqori qismida real vaqtli **FPS hisoblagich**, aniqlangan qo‘llar soni (**0 / 2**) va tizim statusi ko‘rinib turadi.

---

## 🎹 2-Bosqichda amalga oshirilgan ishlar (Audio Engine):
- **audio.js moduli:** `Tone.js` asosida PluckSynth (Karplus-Strong tor sintezi), Reverb (3.5s decay) va Chorus effektlari zanjiri sozlandi.
- **Pentatonik ovoz banki:** 8 ta nota (`C4`, `D4`, `E4`, `G4`, `A4`, `C5`, `D5`, `E5`) har bir virtual torga biriktirildi.
- **Brauzer audio cheklovi:** Ekranning yuqori o‘ng burchagida `Start Audio` tugmasi qo‘shildi.
- **Klaviatura orqali test (1–8):** Klaviaturadagi `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8` tugmalari bosilganda notalar zudlik bilan yoqimli aks-sado (reverb) bilan yangraydi va ekrandagi nota katakchalari neon chaqnashi bilan yoritiladi.
- **Sichqoncha bilan test:** Yuqoridagi nota katakchalarini sichqoncha bilan bosib ham ovozni tekshirish mumkin.

---

## 🎻 3-Bosqichda amalga oshirilgan ishlar (Virtual torlar va fizika):
- **strings.js moduli:** Guk qonuni (Hooke's law) va so‘nuvchi garmonik tebranish (damped harmonic oscillator) fizikasi yaratildi.
- **Torlar deformatsiyasi (Bending):** Barmoq tor ustida turganda tor barmoqqa ergashib egiladi (Quadratic Bezier egri chizig‘i). Egilish ma’lum chegaradan oshganda yoki tez harakatlanganda tor "uzilib" (release), erkin tebranib notani chaladi.
- **1-qo‘l (Chertish / Plucking):** Ko‘rsatkich barmoq uchi (`landmark[8]`) va bosh barmoq uchi (`landmark[4]`) bilan torlarni chertish. Barmoq tezligiga qarab ovoz balandligi (velocity) dinamik hisoblanadi.
- **2-qo‘l (Pitch / Taranglik / Chimchilash):** Ikkinchi qo‘lning balandligi (Y koordinatasi) orqali torlarning tarangligi va rezonansi dinamik o‘zgaradi. Bosh barmoq va ko‘rsatkich barmoq chimchilanganda maxsus neon vizual doira aks etadi.

---

## ✨ 4-Bosqichda amalga oshirilgan ishlar (Vizual effektlar va UI):
- **particles.js moduli:** Tor chertilgan aynan shu nuqtada kengayib so‘nuvchi neon zarba to‘lqini (*Shockwave ring*) va gravitatsiya/havo qarshiligiga ega 20–40 ta yorqin neon uchqun zarrachalari (*Sparks*) otilib chiqishi yaratildi (`globalCompositeOperation = 'lighter'`).
- **Sinusoidal tebranish animatsiyasi:** Tor chertilgandan so‘ng 24 ta segmentdan iborat ko‘p to‘lqinli garmonik sinusoida to‘lqini bo‘yicha tebranadi (*Fundamental wave + 1st harmonic*).
- **HUD boshqaruv paneli:**
  - Torlar sonini almashtirish pill-tugmalari: **[4]**, **[6]**, **[8]** tor.
  - Gamma tanlash: **Pentatonic**, **Harp**, **Synth**, **Flamenco**, **D-Folk**.
- **Hand Tracking barqarorlashtirish (Stabilization):**
  - Qo‘llar bir-biriga yaqinlashganda sakrab ketmasligi uchun histerezis va **EMA (Exponential Moving Average)** silliqlash filtri ulandi (titrashlar butunlay yo‘qotildi).
