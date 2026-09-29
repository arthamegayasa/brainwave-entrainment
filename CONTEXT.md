# SwaraSanti

PWA brainwave entrainment goal-first: user memilih tujuan, bukan frekuensi. Clinician memakai platform yang sama untuk membimbing pendengaran Patient-nya.

## Language

### Orang & peran

**User**:
Siapa pun yang punya akun SwaraSanti, apa pun perannya.
_Avoid_: member, akun

**Regular**:
User yang bukan Patient, Clinician, maupun Admin.
_Avoid_: user biasa, normal user, users

**Clinician**:
Peran profesional yang mengelola Patient-nya sendiri, Audio Bank-nya, dan kurasi Preset per Patient; didapat lewat langganan atau diberikan Admin.
_Avoid_: terapis, dokter

**Inactive Clinician**:
Clinician yang kehilangan role karena langganannya gagal atau berakhir; Patient-nya tetap terhubung tanpa ada yang memantau sampai role kembali atau Admin men-Transfer mereka.
_Avoid_: Quiet (itu status Patient)

**Admin**:
Peran pemilik platform: melihat dan mengelola semua Clinician beserta Patient-nya, dan mempublikasikan Template ke semua User.
_Avoid_: superuser

**Patient**:
User yang terhubung ke tepat satu Clinician.
_Avoid_: klien, member

**Link**:
Hubungan antara Patient dan tepat satu Clinician; hanya Clinician itu atau Admin yang bisa memutusnya.
_Avoid_: koneksi, relasi

**Transfer**:
Pemindahan seorang Patient beserta Listening History-nya ke Clinician lain; hanya oleh Admin.
_Avoid_: migrasi, pindah klinisi

**Username**:
Nama unik se-platform yang diberikan kepada Patient; bersama password, menjadi cara login tanpa email.
_Avoid_: handle, slug

**Personal URL**:
Alamat web pribadi pemilik sebuah Username yang langsung membuka layar password untuk akunnya.
_Avoid_: link, link pribadi, slug

### Audio

**Preset**:
Sesi bawaan goal-first (Sleeping, Focus & Concentration, …) yang tersedia untuk semua User.
_Avoid_: template bawaan

**Hidden Preset**:
Preset yang disembunyikan Clinician dari satu Patient tertentu.

**Studio**:
Editor lanjutan multi-layer untuk mendesain Custom Audio.
_Avoid_: builder

**Custom Audio**:
Sesi hasil desain Studio yang disimpan di cloud.

**Audio Bank**:
Koleksi Custom Audio milik satu Clinician.

**Template**:
Custom Audio yang dipublikasikan Admin untuk semua User.

**Assignment**:
Keputusan membuat satu Custom Audio tampil di Library satu User: oleh Clinician untuk Patient-nya sendiri, atau oleh Admin untuk User mana pun.

**Library**:
Tampilan milik User yang berisi Custom Audio yang di-assign kepadanya, Template, dan sesi Studio yang ia simpan sendiri.

**Beat**:
Frekuensi brainwave yang dituju sebuah Play, dalam Hz; bergerak mengikuti ramp sesi.
_Avoid_: frekuensi otak, brainwave Hz

**Carrier**:
Nada yang membawa Beat agar terdengar; di Preset selalu frekuensi Solfeggio.
_Avoid_: nada dasar, base tone

**Journey**:
Jalan Beat sebuah Custom Audio: Start, lalu titik-titik yang dicapai berurutan, masing-masing sekian menit setelah titik sebelumnya dengan kurvanya sendiri.
_Avoid_: session shape, legs

**Hold**:
Titik Journey yang Beat-nya ditahan selama sisa panjang Play; titik sesudahnya menutup sesi di akhir.
_Avoid_: plateau, target

**Main Beat**:
Layer entrainment pertama sebuah Custom Audio: jenis entrainment-nya (binaural, isochronic, atau monaural) dipilih lebih dulu, lalu apakah ia mengikuti Journey atau tetap di satu Beat.
_Avoid_: primary layer

**Listening mode**:
Cara Beat disampaikan: Headphones (binaural, Beat dari selisih nada kiri dan kanan) atau Speaker (isochronic, Carrier yang dipulse).
_Avoid_: metode, method

**Scene**:
Lukisan beranimasi (tempat khayalan atau ilustrasi ilmiah yang menenangkan) yang mewakili sebuah Preset atau Custom Audio di kartu, Player, dan Media controls.
_Avoid_: gambar, artwork, background

### Pemutaran

**Player**:
Layar penuh untuk Play yang sedang berjalan, baik Preset maupun Custom Audio.

**Mini-player**:
Bar ringkas di tampilan lain selama sebuah Play berjalan; menyentuhnya membuka Player.

**Media controls**:
Kontrol pemutaran dari sistem operasi (notifikasi dan lock screen) untuk audio yang sedang diputar SwaraSanti.
_Avoid_: notifikasi media, Now Playing

### Akses & pemakaian

**Premium**:
Akses ke fitur berbayar; didapat lewat langganan, atau dinyalakan Clinician/Admin untuk seorang Patient.
_Avoid_: VIP, pro

**Premium grant**:
Premium yang dibawa Link seorang Patient, dinyalakan atau dimatikan Clinician-nya atau Admin; menyala untuk setiap Link baru, ikut saat Transfer, dan berakhir saat Link diputus.
_Avoid_: premium gratis, akses klinisi

**Play**:
Satu kali pemutaran satu Preset, Custom Audio, atau sesi Studio yang tersimpan di perangkat (diputar dari Library) oleh satu User: kapan mulai, kapan berhenti, berapa lama benar-benar didengar, dan apakah selesai.
_Avoid_: sesi, log

**Download**:
Satu kali unduhan MP3 sebuah Preset atau Custom Audio oleh satu User; dicatat terpisah dari Play karena pemutarannya di luar app.
_Avoid_: ekspor

**Listening History**:
Seluruh Play dan Download milik satu User.
_Avoid_: log, riwayat sesi

### Status Patient

**Patient Status**:
Satu label yang merangkum kebiasaan dengar seorang Patient saat ini: New, Not started, Quiet, Stops early, atau On track (diperiksa dalam urutan itu).
_Avoid_: status sesi, health

**New**:
Patient yang ditambahkan dalam 3 hari terakhir, sudah memutar sesuatu atau belum.

**Not started**:
Patient yang ditambahkan lebih dari 3 hari lalu dan belum pernah punya Play.

**Quiet**:
Patient yang tidak punya Play selama 3 hari atau lebih.
_Avoid_: inactive (itu untuk Clinician yang langganannya berhenti)

**Stops early**:
Patient dengan minimal 2 Play dalam 7 hari terakhir, yang setengahnya atau lebih dihentikan sebelum selesai.

**On track**:
Patient yang tidak masuk status lain mana pun.

**Needs attention**:
Patient berstatus Not started, Quiet, atau Stops early; didahulukan di daftar Clinician dan Admin.
_Avoid_: bermasalah, at risk
