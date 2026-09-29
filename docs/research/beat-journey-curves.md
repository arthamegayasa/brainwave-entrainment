# Kurva gerakan Beat di Journey Studio: riset (2026-09-29)

Ada dua pertanyaan owner. Pertama, opsi kurva mana yang ideal dan memang dibutuhkan untuk tiap gerakan Beat (sekarang: Linear, S-curve, Fast → slow, Slow → fast). Kedua, apakah pola bolak-balik (mis. 10 → 8 → 10 → 8 Hz) layak dibuat, dan bagaimana sebaiknya ia berperilaku.

Label di setiap temuan:

- **[Bukti]**: studi peer-reviewed.
- **[Praktik]**: dokumentasi atau file dari alat entrainment yang sudah mapan, termasuk klaim produsen yang belum di-review sejawat.
- **[Hitung]**: perhitungan kami sendiri atas rumus kurva.
- **[Inferensi]**: kesimpulan kami yang ditarik dari sumber, tetapi tidak dinyatakan langsung oleh sumber itu.
- **[Desain]**: pertimbangan desain, bukan bukti.

Konteks: bukti bahwa binaural beat benar-benar meng-entrain EEG masih campur aduk. Dari 14 studi dalam systematic review Ingendoh dkk., 5 mendukung hipotesis entrainment, 8 tidak menemukan efek, dan 1 hasilnya campuran ([Ingendoh 2023, PLOS ONE](https://pmc.ncbi.nlm.nih.gov/articles/PMC10198548)) **[Bukti]**. Karena fondasinya sendiri lemah, bukti tentang *bentuk* kurva tentu lebih lemah lagi. Semua rekomendasi di bawah pada dasarnya adalah desain yang diberi informasi, bukan resep klinis.

## 1. Cara alat dan studi menggerakkan Beat dari waktu ke waktu

**SBaGen (Jim Peters), `-p drop`** ([SBAGEN.txt §3.6.1](https://uazu.net/sbagen/sbagen.txt)) **[Praktik]**

- Beat selalu mulai di 10 Hz, lalu "drop exponentially" ke target, yang bisa dipilih antara 4,4 Hz dan 0,3 Hz.
- Fase turunnya 30 menit. Opsi `+` menambah 30 menit hold di target. Opsi `^` menambah "3-minute slide back up" untuk membangunkan. Semua durasi bisa diubah lewat `t<drop>,<hold>,<wake>`.
- Tersedia tiga mode perubahan: langkah tiap 3 menit (default), langkah tiap 1 menit (`k`), atau slide mulus (`s`). Penulisnya sendiri memakai slide. Ia juga menceritakan pengalaman anekdotal bahwa pada mode langkah, "the dream-scene changes for every step".
- Di file sequence, pergantian tone-set secara default terjadi dalam jendela 60 detik (30 detik sebelum dan 30 detik sesudah titik ganti). Tanda `->` mengubah seluruh jarak ke titik berikutnya menjadi transisi, sehingga bisa dibuat "a gentle frequency slide that goes on for an hour" ([SBAGEN.txt §4.1](https://uazu.net/sbagen/sbagen.txt)).

**SBaGenX (fork modern SBaGen)** ([SBAGENX.txt](https://github.com/lm7137/SBaGenX/blob/main/docs/SBAGENX.txt), [sbagenx.com](https://www.sbagenx.com/)) **[Praktik]**

- `-p drop` tetap turun secara eksponensial dari 10 Hz.
- Ada program baru `-p sigmoid` yang mengikuti `f(t) = a·tanh(l·(t − D/2 − h)) + b`, dengan default `l = 0.125`/menit. Tujuannya dinyatakan sebagai "a gentler entry and exit, with more change through the middle". Ini padanan S-curve kita.
- File `.sbgf` memungkinkan kurva buatan sendiri. Contoh resminya adalah kurva eksponensial `A·exp(−l·m) + B` yang konstantanya di-*solve* dari nilai di kedua ujung.

**Gnaural (Bret Logan)** ([help](https://gnaural.sourceforge.net/help/), [format schedule](https://gnaural.sourceforge.net/help/schedule_oldformat.html)) **[Praktik]**

- Pendekatannya: mulai di sekitar 12 Hz, lalu "slowly let the beat frequency slide downward toward the low theta range". Menurut penulisnya 5 menit sudah cukup untuk dirinya, tetapi pemula mungkin butuh lebih lama, dan "the more slowly you can descend, the better". Ia juga menulis bahwa "within 8 minutes" otak sudah cukup sinkron.
- Frekuensi berubah bertahap ("incrementally change (integrate)") dari nilai satu entri ke nilai entri berikutnya selama durasi entri itu. Jadi bentuknya ramp per segmen.
- Schedule default ([XML](https://gnaural.sourceforge.net/help/schedule_format.html)) bergerak 12 → 8 Hz dalam 45 detik, lalu → 6 Hz (60 detik), → 5 Hz (60 detik), → 4,3 Hz (120 detik), → 4 Hz (180 detik). Dengan kata lain turunnya cepat di awal lalu melambat, dan butuh sekitar 8 menit untuk mencapai 4 Hz. **[Hitung dari file]**

**Brain.fm, sesi tidur** ([white paper](https://www.brain.fm/pdfs/sleep-study.pdf), n = 3, bukan peer-reviewed) **[Praktik]**

- "The modulation starts at very low frequencies and ramps up to 0.5 Hz in 1 hour." Bentuk kurvanya tidak disebutkan.

**Studi**

- Di studi yang direview Ingendoh, Beat umumnya dipasang konstan per kondisi ([Ingendoh 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10198548)) **[Bukti]**. Kami tidak menemukan studi terkontrol yang membandingkan bentuk ramp (linear vs eksponensial vs sigmoid). Ini hasil penelusuran kami, bukan klaim dari sumber.
- Jirakittayakorn & Wongsawat memutar Beat 6 Hz secara konstan selama 30 menit. Daya theta naik di hampir semua posisi dalam 10 menit pertama, lalu jumlah posisi yang berubah berkurang di menit 15 dan 25. Penulis menyimpulkan durasi yang cocok adalah 10 menit ([Front. Neurosci. 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5487409)) **[Bukti, n = 28]**.

**Adakah sumber yang mendukung bentuk tertentu?**

- *Perubahan dengan rasio konstan (eksponensial, atau linear dalam log-Hz)*: SBaGen memakainya sebagai default tetapi tidak menjelaskan alasannya ([SBAGEN.txt](https://uazu.net/sbagen/sbagen.txt)) **[Praktik]**. Ada dasar persepsinya: ambang beda tempo bersifat relatif, sekitar 3% untuk urutan reguler dan serendah 1,5% pada interval 300–800 ms. Rentang yang diuji adalah interval 100–1500 ms, setara 0,67–10 Hz ([Drake & Botte 1993](https://pubmed.ncbi.nlm.nih.gov/8414886)) **[Bukti]**. Artinya perubahan dengan rasio konstan kemungkinan terdengar berjalan dengan laju yang rata **[Inferensi]**.
- *Perubahan bertahap dari kondisi saat ini*: pada flicker visual, entrainment paling kuat di dekat frekuensi alfa individual. Jendela entrainment melebar kalau intensitas dinaikkan (sekitar ±2 Hz pada intensitas menengah, dan tidak terjadi pada ±3 Hz) ([Notbohm dkk. 2016](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2016.00010/full)) **[Bukti, modalitas visual]**. Ini mendukung gagasan menggeser Beat sedikit demi sedikit, bukan melompat jauh **[Inferensi]**.

**Perbandingan kurva kita** untuk turun 10 → 2,5 Hz dalam 30 menit **[Hitung]**:

| Kurva | Hz di 25% / 50% / 75% | Laju relatif (%/menit) di awal / tengah / akhir |
|---|---|---|
| Linear | 8,12 / 6,25 / 4,38 | −2,5 / −4,0 / −9,7 |
| S-curve (smoothstep) | 8,83 / 6,25 / 3,67 | 0 / −6,0 / −0,6 |
| Fast → slow (ease-out) | 6,72 / 4,38 / 2,97 | −5,0 / −5,7 / −0,2 |
| Slow → fast (ease-in) | 9,53 / 8,12 / 5,78 | 0 / −3,1 / **−18,7** |
| Eksponensial (rasio konstan) | 7,07 / 5,00 / 3,54 | −4,6 / −4,6 / −4,6 |

- Selisih maksimum antara Fast → slow dan eksponensial adalah 0,65 Hz (untuk 10 → 2,5), 0,83 Hz (10 → 4), dan 0,75 Hz (12 → 1). Pada gerakan naik (4 → 10), justru Slow → fast yang dekat dengan eksponensial (selisih maksimum 0,83 Hz) **[Hitung]**.
- Slow → fast yang dipakai untuk turun menghasilkan perubahan relatif paling tajam tepat saat mendarat di target. Ini kebalikan dari "turun pelan" yang dianjurkan Gnaural **[Hitung + Inferensi]**.

## 2. Pola bolak-balik (alternating, wobble, spike)

**Gnaural: "spike"** ([help](https://gnaural.sourceforge.net/help/)) **[Praktik, anekdot]**

- Kira-kira tiap 6 menit, Beat dinaikkan ke sekitar 7–8 Hz dalam 6 detik, lalu diturunkan lagi dalam 6 detik.
- Alasan penulis: agar pendengar tidak "go to sleep" dan tetap berada di tepi hipnagogik. Ia juga mengamati bahwa ketika otak mulai sinkron, beat justru jadi sulit didengar.
- File [DeepTrance](https://gnaural.sourceforge.net/help/gnaural_DeepTrance.txt) menerapkan pola ini: hold sekitar 3,8–4,1 Hz dengan spike ke 8 Hz kira-kira tiap 6 menit **[Hitung dari file]**.

**Gnaural: "StudyTime"** ([deskripsi](https://gnaural.sourceforge.net/help/schedule_examples_oldformat.html), [file](https://gnaural.sourceforge.net/help/gnaural_StudyTime.txt)) **[Praktik, anekdot]**

- Beat 9,4 → 11,0 Hz ditempuh dalam sekitar 6 menit, bertahan sekitar 30 detik, lalu kembali ke 9,4 Hz dalam sekitar 6 menit. Bentuknya praktis segitiga dengan periode sekitar 12 menit, dan diulang terus.
- Kira-kira tiap 1,5–2 menit ada penurunan singkat sekitar 1 Hz selama 6 detik. Di setiap puncak dan lembah ada turun ke 7,5 Hz selama sekitar 6 detik **[Hitung dari file]**.
- Alasan penulis: "occasionally slowing the beats down suddenly every few minutes seems to force my brain to re-sync to the beat, which feels a bit like a jolt of adrenaline, refocusing my attention."

**SBaGen: mode bertangga** (langkah 3 menit atau 1 menit, lihat §1). Bentuknya plateau-lalu-pindah satu arah, bukan bolak-balik ([SBAGEN.txt](https://uazu.net/sbagen/sbagen.txt)) **[Praktik]**.

**Mind Alive RAVE (AVE: cahaya + suara)** ([blog Dave Siever 2022](https://mindalive.com/blogs/blog/benefits-of-randomized-audio-visual-entrainment-rave)) **[Praktik, klaim produsen tanpa peer review]**

- Frekuensi kiri dan kanan diacak secara independen, dan waktu perubahannya juga acak.
- Klaim mereka: acakan ±1 Hz memberi "the best clinical value", ±2 Hz kira-kira setara frekuensi tetap, dan ±3 Hz "poor".

**Alpha–theta "crossover"**

- Istilah ini berasal dari neurofeedback, bukan dari entrainment. Protokolnya melatih peningkatan rasio theta/alpha dengan mata tertutup, dan awalnya dirancang untuk memicu hipnagogia ([Gruzelier 2009](http://eeg-feedback.cz/A_theory_of_alpha.pdf), [PubMed](https://pubmed.ncbi.nlm.nih.gov/19082646)) **[Bukti]**.
- "Crossover" adalah keadaan EEG pendengar, bukan stimulus yang dibuat bolak-balik. Kami tidak menemukan sumber primer dari alat entrainment yang menawarkan alternasi alpha–theta beserta alasannya. Ini hasil penelusuran kami.

**Ringkasan pola** **[Inferensi dari sumber di atas]**

- Periode yang dipakai: hitungan detik untuk spike yang membangunkan (Gnaural), 1–3 menit untuk langkah (SBaGen), sekitar 12 menit untuk ayunan segitiga (Gnaural StudyTime), dan acak (Mind Alive).
- Bentuk yang dipakai: segitiga dengan jeda singkat di ujung, tangga, dan acak. Tidak satu pun sumber memakai sinus.
- Semua alasan yang dikemukakan bersifat anekdotal: menjaga kewaspadaan, "re-sync", atau hasil klinis internal produsen.

## 3. Habituasi atau adaptasi terhadap Beat yang konstan

- **Tikus, batang otak (AM 115 Hz)**: amplitudo ASSR turun secara eksponensial dan mencapai asimtot setelah sekitar 27 detik. Respons pulih (dishabituasi) ketika intensitas dinaikkan 10 dB atau ketika laju modulasi digeser dari 93 ke 108 Hz ([Prado-Gutierrez dkk. 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4627118/)) **[Bukti, hewan, skala detik]**.
- **Manusia, ASSR 40 Hz**: amplitudonya "overall stable" selama rekaman 92 detik. Penurunannya signifikan tetapi sangat kecil (sekitar −0,0002 µV/s), dan penulis menyimpulkan bahwa adaptasi kenyaringan kemungkinan tidak tercermin di ASSR ([Van Eeckhoutte dkk. 2018](https://www.ovid.com/jnls/ear-hearing/abstract/10.1097/aud.0000000000000483~stability-of-auditory-steady-state-responses-over-time?redirectionsource=fulltextview)) **[Bukti]**. Sebaliknya, respons visual (SSVEP) manusia hanya stasioner pada sebagian subjek ([Prado-Gutiérrez dkk. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC7055073)) **[Bukti]**.
- **Binaural beat 6 Hz selama 30 menit**: efek pada theta paling luas di menit ke-10, lalu menyempit ([Jirakittayakorn 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5487409)) **[Bukti, n = 28]**. Pola ini *konsisten* dengan adaptasi, tetapi tidak membuktikannya **[Inferensi]**.
- **Saat tidur**: stimulasi auditori, termasuk binaural beat 1 Hz, memberi respons slow-wave terbesar di awal setiap jendela ON 10 detik, lalu melemah di sepanjang jendela itu ([Huwiler dkk. 2022, Sleep](https://pmc.ncbi.nlm.nih.gov/articles/PMC9453626)) **[Bukti]**.
- **Kesimpulan**: bukti bahwa manusia terhabituasi selama beberapa menit terhadap binaural beat yang konstan masih lemah sampai tidak ada. Bukti yang kuat hanya ada pada hewan dan dalam skala detik. Jadi alasan "bolak-balik untuk mencegah habituasi" masih teoretis **[Inferensi]**.

## 4. Kehati-hatian terhadap perubahan mendadak atau alternasi cepat

- **Perubahan mendadak memicu respons kebaruan.** Pergantian laju modulasi secara mendadak memulihkan ASSR tikus ([Prado-Gutierrez 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4627118/)), dan sistem auditori manusia secara otomatis mendeteksi pelanggaran keteraturan bunyi ([Näätänen dkk. 2007](https://pubmed.ncbi.nlm.nih.gov/17931964)) **[Bukti]**. Kemungkinan besar lompatan Beat membangunkan perhatian **[Inferensi]**. Karena itu Gnaural memakai spike mendadak justru *untuk* mencegah tidur ([help](https://gnaural.sourceforge.net/help/)), sementara SBaGen secara default menghaluskan setiap pergantian selama 60 detik ([SBAGEN.txt](https://uazu.net/sbagen/sbagen.txt)) **[Praktik]**.
- **Saat tidur**, jendela binaural beat meningkatkan probabilitas bangun dan alpha oksipital yang mirip arousal ([Huwiler 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9453626)) **[Bukti]**. Sejalan dengan itu, Preset tidur di aplikasi ini tidak punya ramp naik ([entrainment.md](../knowledge/entrainment.md)).
- **Bergerak terlalu cepat** melewati banyak level dapat menimbulkan "overload" atau "overstimulation" ([SBAGEN.txt §3.6](https://uazu.net/sbagen/sbagen.txt)) **[Praktik, anekdot]**. Mind Alive menilai acakan ±3 Hz berdampak "poor" ([Siever 2022](https://mindalive.com/blogs/blog/benefits-of-randomized-audio-visual-entrainment-rave)) **[klaim produsen]**.
- **Sesi panjang tidak otomatis terasa nyaman.** Setelah 30 menit Beat 6 Hz, skor confusion, depression, dan fatigue di BRUMS naik dibanding sebelum mendengar ([Jirakittayakorn 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5487409)) **[Bukti]**. Copy aplikasi sebaiknya tidak menjanjikan efek.
- **Ayunan besar akan terdengar jelas.** Ambang beda tempo sekitar 3% ([Drake & Botte 1993](https://pubmed.ncbi.nlm.nih.gov/8414886)), sedangkan ayunan 10 ↔ 8 Hz besarnya 20%. Pendengar pasti menyadarinya, dan kalau ayunannya dalam hitungan detik, yang terdengar adalah "wobble", bukan pergeseran keadaan **[Inferensi]**.

## 5. Rekomendasi **[Desain, kecuali yang ditandai]**

**Set kurva minimal: 4 opsi.** Jumlahnya sama dengan sekarang, tetapi setiap opsi punya fungsi yang berbeda:

| Opsi | Keputusan | Alasan |
|---|---|---|
| **S-curve** | Pertahankan, tetap default | Setara `-p sigmoid` di SBaGenX yang dibuat untuk "gentler entry and exit" [Praktik]. Laju 0 di kedua ujung, jadi tidak ada patahan di sambungan antar-gerakan atau ke Hold [Hitung]. |
| **Linear** | Pertahankan | Ramp Preset juga linear ([ADR-006, entrainment.md](../knowledge/entrainment.md)), sehingga Clinician bisa meniru Preset. Ramp per segmen juga dipakai Gnaural dan slide `->` SBaGen [Praktik]. |
| **Fast → slow + Slow → fast** | **Gabungkan menjadi satu: "Proporsional"** (eksponensial, rasio per menit konstan: `f = a·(b/a)^t`) | Ini default `-p drop` di SBaGen/SBaGenX [Praktik], dan cocok dengan persepsi tempo yang relatif [Bukti + Inferensi]. Tidak bergantung arah: saat turun ia mirip Fast → slow, saat naik mirip Slow → fast (selisih maks 0,65–0,83 Hz) [Hitung]. Opsi yang "salah arah" (Slow → fast untuk turun) jadi hilang, padahal itu yang paling tajam mendarat di target (−18,7%/menit) [Hitung]. Catatan: sama seperti Linear, laju berhenti mendadak di ujung gerakan. |
| **Ayun** (baru) | Tambahkan | Jawaban untuk pola 10 → 8 → 10 → 8. Spesifikasinya di bawah. |

**Spesifikasi "Ayun"**

- **Bentuk: raised-cosine (sinus)** di antara nilai titik sebelumnya (P) dan nilai titik ini (Q). Setiap setengah ayunan adalah S-curve, karena smoothstep dan setengah kosinus hanya berbeda paling banyak 1% dari lebar ayunan [Hitung], sehingga `beatPath` bisa memakai ulang smoothstep yang sudah ada. Kurva ini otomatis "diam sebentar" di kedua ujung tanpa patahan laju.
  - *Bukan segitiga*: arah berbalik secara mendadak.
  - *Bukan plateau-lalu-pindah*: loncatannya berfungsi sebagai sinyal kebaruan atau alat membangunkan (§4). Ini tidak cocok untuk tujuan tidur atau relaksasi, dan penulis SBaGen sendiri memilih slide.
- **Parameter: jumlah ayunan dalam gerakan, bukan periode dalam menit.** Alasannya, ADR-028 mempercepat semua gerakan secara proporsional untuk Play yang lebih pendek ([ADR-028](../adr/0028-studio-journey-points.md)). Jumlah ayunan menjaga bentuk kurva tetap sama pada panjang Play berapa pun, sedangkan periode dalam menit tidak bisa dipenuhi saat gerakan dipadatkan.
  - Definisi: *n* = berapa kali Beat tiba di Q. Jalurnya P → Q (→ P → Q) × (n − 1), yaitu 2n − 1 setengah ayunan. Dengan *n* = 1, hasilnya sama dengan S-curve. Gerakan selalu berakhir di Q, jadi gerakan berikutnya tetap berawal dari nilai titik ini.
- **Default *n* = 3; rentang 2–8**, dengan syarat setiap setengah ayunan paling singkat 1 menit (*n* maksimum = ⌊(menit + 1) / 2⌋).
  - Contoh: gerakan 12 menit dengan *n* = 3 menghasilkan setengah ayunan 2,4 menit (periode 4,8 menit). Nilai ini ada di antara langkah 1–3 menit SBaGen dan periode sekitar 12 menit Gnaural StudyTime [Praktik].
  - Batas 1 menit menjaga agar Ayun terasa sebagai pemandu keadaan, bukan wobble yang terdengar (§4).
- **Kedalaman**: tampilkan petunjuk (bukan larangan) bila |P − Q| lebih dari 3 Hz, dan sarankan 1–2 Hz. Dasarnya: klaim Mind Alive bahwa ±1 Hz terbaik dan ±3 Hz buruk, serta jendela entrainment ±2 Hz pada flicker visual (§1–2) [Praktik + Bukti, lintas modalitas].
- **Tempat pakai**: meditasi, fokus, atau relaksasi. Hindari untuk bagian akhir tujuan tidur, karena perubahan justru dipakai Gnaural untuk mencegah tidur dan meningkatkan arousal saat tidur (§4).
- **Opsi yang dipertimbangkan dan ditolak**:
  - *Wobble di Hold dengan periode dalam menit*: Hold ikut memanjang, sehingga butuh jenis parameter kedua, sementara bukti habituasi pada manusia lemah (§3).
  - *Acak ala RAVE*: hasilnya tidak bisa direproduksi atau digambar untuk Clinician, dan buktinya hanya klaim produsen.
  - *Langkah atau segitiga*: lihat alasan di bagian Bentuk.
- **Copy**: sebut Ayun sebagai "variasi Beat", bukan "mencegah habituasi" atau klaim efek lain, karena buktinya lemah (§3) dan karena CODING_STANDARDS.
- **Catatan implementasi**:
  - Saat ini tiap gerakan dijadwalkan sebagai 32 potongan linear ([ADR-028](../adr/0028-studio-journey-points.md)). Jumlah itu terlalu kasar untuk 15 setengah ayunan, jadi jumlah potongan perlu diskalakan per setengah ayunan (mis. 16 per setengah ayunan).
  - Menggabungkan Fast → slow dan Slow → fast berarti spec Custom Audio yang sudah tersimpan harus dimigrasi. Pemetaan ke Proporsional hampir tidak terdengar bedanya bila arahnya sesuai (≤ 0,83 Hz). Bila arahnya berlawanan, bedanya sampai sekitar 2–6 Hz [Hitung].
