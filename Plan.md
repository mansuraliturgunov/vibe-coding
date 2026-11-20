Avval 1-bosqichni bajar va to‘xta, men tekshirib tasdiqlaganimdan keyin 2-bosqichga o‘tamiz.

Maqsad: macOS (Apple Silicon) muhitida veb-kamera orqali qo‘l harakatlarini kuzatuvchi va havodagi virtual torlarni chertish/tortish orqali real vaqtda ovoz hamda vizual effekt chiqaruvchi interaktiv musiqiy dastur yaratish.
Texnologik stek (Web-based — Mac’da o‘rnatish muammosiz, 60 FPS ishlaydi):
Core: Vanilla HTML5, CSS3, ES6+ JavaScript (yoki Vite dev server — kamera ruxsati va CORS muammosiz ishlashi uchun).
Hand Tracking: @mediapipe/tasks-vision (MediaPipe Hand Landmarker — 2 ta qo‘l, 21 ta nuqta/landmark).
Graphics & Physics: HTML5 <canvas> (2D context, requestAnimationFrame, torning prujina/to‘lqin tebranish fizikasi — Hooke's law / damped harmonic oscillator, zarracha/uchqun effektlari).
Audio Engine: Tone.js (yoki sof Web Audio API — Karplus-Strong torli cholg‘u sintezi, reverb va polyphonic ovozlar uchun).
1-BOSQICH: Loyiha strukturasi va Kamera + Hand Tracking (MVP)
Vite (yoki oddiy lokal HTTP server) asosida loyiha yarat: index.html, style.css, main.js.
@mediapipe/tasks-vision va tone paketlarini o‘rnat.
Veb-kamerani (navigator.mediaDevices.getUserMedia) ulab, video oqimini to‘liq ekranli <canvas> ga gorizontal oyna (mirror) rejimida chiz.
MediaPipe HandLandmarker modelini yuklab, ikkala qo‘lning 21 ta nuqtasi va suyak chiziqlarini (yashil chiziq, qizil nuqtalar) real vaqtda ekranga chiz.
Test nuqtasi 1: Dasturni ishga tushir. Kamera ochilishi, FPS ekranda ko‘rinishi va 2 ta qo‘l skeleti kechikishsiz chizilishini tekshir.
2-BOSQICH: Audio Engine (Tone.js)
audio.js modulini yarat.
Brauzer audio cheklovini chetlab o‘tish uchun ekranga "Start Audio" tugmasi qo‘sh (Tone.start()).
Tone.PolySynth (yoki PluckSynth + Reverb) orqali 6–8 ta notadan iborat pentatonik yoki major/minor gammali ovoz bankini sozla (har bir tor uchun alohida chastota).
Test nuqtasi 2: Klaviatura tugmalari (1–8) bosilganda har bir notaning toza, kechikishsiz va yoqimli aks-sado (reverb) bilan chalinishini tekshir.
3-BOSQICH: Virtual torlar va fizika (String Physics & Collision)
strings.js modulini yarat.
Ekranda gorizontal yoki biroz qiya tortilgan bir nechta virtual tor chiz.
Interaksiya mantiqi:
1-qo‘l (Chertish/Plucking): Ko‘rsatkich barmoq uchi (landmark[8]) tor chizig‘ini kesib o‘tganda (line-segment intersection) to‘qnashuvni aniqla.
Tor deformatsiyasi: Barmoq tor ustida turganda tor barmoqqa ergashib egilsin (Bezier curve), ma’lum chegaradan o‘tganda "uzilib" (release) tebranishni boshlasin va tegishli notani chalib yuborsin.
2-qo‘l (Pitch / Pozitsiya boshqaruvi): Ikkinchi qo‘lning balandligi (Y koordinatasi) yoki chimchilash (bosh barmoq landmark[4] + ko‘rsatkich barmoq landmark[8] masofasi) orqali torlarning oktavasi, tarangligi yoki soni (1 tadan 6–8 tagacha) dinamik o‘zgarsin.
Test nuqtasi 3: Havoda qo‘l harakati bilan bitta va ko‘p torlarni chertish, barmoq tezligiga qarab ovoz balandligi (velocity) o‘zgarishini tekshir.
4-BOSQICH: Vizual effektlar va UI sayqallash
Glow va Uchqunlar (Particles): Tor chertilgan nuqtada yorqin nur (neon glow) va mayda uchqun zarrachalari sochilsin.
Tebranish animatsiyasi: Tor chertilgandan keyin sinusoida bo‘ylab so‘nuvchi tebranish bilan harakatlansin.
Boshqaruv paneli (minimalist HUD): Ekranda FPS, faol torlar soni, gamma tanlash (Pentatonic, Harp, Synth) va torlar sonini almashtirish tugmalari bo‘lsin.
Test nuqtasi 4: Qo‘llar bir-biriga yaqinlashganda tracking sakrab ketmasligi uchun har bir qo‘l (Left / Right) rolini ajratib barqarorlashtir.
5-BOSQICH: Yakuniy tekshiruv va optimizatsiya
Xotira sizib chiqishi (memory leak) yo‘qligini tekshir (particles massivini tozalash).
Kamera ruxsati berilmaganda foydalanuvchiga tushunarli xato xabari chiqar.

Loyihani ishga tushirish bo‘yicha qisqa README.md yoz.