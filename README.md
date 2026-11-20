# Air Strings — Virtual Musiqiy Dastur

Veb-kamera orqali qo‘l harakatlarini real vaqtda aniqlab, havoda virtual torlar chizish, uzunligini o‘zgartirish va chertish orqali ovoz chiqaruvchi interaktiv veb-dastur. macOS, Windows va Linux’dagi zamonaviy brauzerlarda ishlaydi.

## 🚀 Ishga tushirish

1. **Talablar (Node.js va npm):** Kompyuteringizda Node.js o‘rnatilgan bo‘lishi kerak (`node -v` va `npm -v` bilan tekshiring). Agar o‘rnatilmagan bo‘lsa:
   * **macOS:** `brew install node` (yoki `nodejs.org` saytidan LTS versiyani yuklab o‘rnating).
   * **Windows:** `nodejs.org` saytidan LTS versiyani yuklab o‘rnating (`npm` birga o‘rnatiladi).
   * **Linux (Ubuntu/Debian):** `sudo apt update && sudo apt install -y nodejs npm`

2. **Kutubxonalarni o‘rnatish:** Loyiha papkasiga kirib, quyidagi buyruqni bering:
   ```bash
   npm install

## 🚀 Ishga tushirish

3. 
```bash
npm run dev
```
4. Brauzerda quyidagi manzilni oching:
```
http://localhost:5173
```

5. Brauzer kamera ruxsatini so‘raganda **"Ruxsat berish" (Allow)** tugmasini bosing.

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

## 🎸 Erkin Torlar (Freeform Multi-Angle Interactive Strings):
- **Bo‘sh start va tozalash:** Sayt ochilganda ekran bo‘sh bo‘ladi. Yuqori paneldagi `🗑 Tozalash` va `↩ Bekor qilish` tugmalari orqali torlarni boshqarish mumkin.
- **Istalgan burchakda tor chizish:** Bosh barmoq va ko‘rsatkich barmoqni chimchilab (pinch) ekranning istalgan nuqtasidan istalgan burchakda (gorizontal, vertikal, diagonal) tor torting.
- **Uzunlikka mos akustik chastota (Mersenne fizikasi):** Tor uzun bo‘lsa yo‘g‘on, qisqa bo‘lsa ingichka jaranglaydi. Chizayotgan paytda ham chastota real vaqtda ko‘rinib turadi (`#1 146Hz D3`).
- **Uchlaridan ushlab o‘zgartirish:** Torning ikki uchidagi nuqtalarni chimchilab tortish orqali tor uzunligi va burchagini xohlagancha o‘zgartirish mumkin.
- **Chertish:** Ochiq ko‘rsatkich barmoq bilan torlarni kesib o‘tganingizda torlar egilib, uzilib o‘z uzunligiga mos gitara sadosini beradi.
- **Yengil va sovuq:** Hech qanday og‘ir neon/particle yuklamalarisiz toza 60 FPS! (Sichqoncha bilan ham to‘liq boshqarish mumkin).
