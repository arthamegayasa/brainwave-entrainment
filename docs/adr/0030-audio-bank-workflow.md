# ADR-030: Studio mengedit satu Custom Audio, Audio Bank mengelola, Custom Audio bisa Made for satu Patient (2026-09-30)

Owner meminta alur simpan diperbaiki. Custom Audio buatan sendiri di Library hanya bisa diputar, tidak bisa diedit. Daftar Audio Bank di bawah Studio tidak rapi begitu isinya ratusan. Owner juga ingin audio yang dibuat khusus untuk satu Patient, dengan Template sebagai sumber salinan untuk Patient lain.

Masalah yang ditemukan di alur lama:
- Save di bar Studio hanya menyimpan ke perangkat.
- Save to Audio Bank selalu membuat baris baru.
- Custom Audio di Audio Bank tidak bisa dibuka lagi di Studio.
- Library Clinician menampilkan seluruh Audio Bank-nya sebagai "Made for you".
- Daftar berhenti diam-diam di `max_rows` PostgREST.
- Notes "visible only to you" terkirim ke browser setiap assignee.

## Keputusan

- **Satu tempat untuk satu pekerjaan.**
  - **Studio** mengedit satu Custom Audio. Save memperbarui Custom Audio itu, dan Save as copy membuat yang baru. Tidak ada daftar di Studio: Open… membuka dialog cari.
  - **Audio Bank** (tab Dashboard) mengelola semuanya. Isinya dikelompokkan General dan Made for per Patient, bisa dicari, difilter, dan diurutkan, lalu dimuat bertahap per 24 kartu.
  - **Library** untuk mendengarkan. Custom Audio buatan sendiri punya Edit, dan Clinician memakai Template sebagai titik awal.
- **Made for** (`custom_audios.made_for`). Database langsung meng-assign Custom Audio ke Patient itu, dan tidak pernah ke User lain, termasuk oleh Admin (`personal_audio`). Clinician hanya bisa membuatnya untuk Patient yang Linked kepadanya (`not_your_patient`); Admin bisa untuk siapa pun. Custom Audio general yang sudah di-assign ke orang lain tidak bisa berubah jadi Made for (`assigned_to_others`), dan Template tidak pernah Made for (`personal_template`). Aturan ini ditegakkan trigger database, jadi berlaku untuk client mana pun.
- **Salinan berdiri sendiri.** Duplicate dan Use as starting point membuat Custom Audio baru. `based_on` menyimpan nama sumbernya sebagai snapshot, jadi salinan tidak ikut berubah ketika sumbernya diedit.
- **Edit berlaku untuk semua pendengarnya.** Menyimpan Custom Audio yang sudah di-assign mengubah yang didengar setiap pendengar mulai Play berikutnya. Studio memberi peringatan dan menawarkan Save as copy.
- **Transfer (ADR-020) membawa Custom Audio Made for Patient itu** ke Clinician baru, lengkap dengan Assignment dan notes-nya, supaya perawatannya berlanjut. Kalau Link berakhir, Custom Audio tetap milik pembuatnya dan Assignment-nya hilang seperti Assignment lain dari Clinician itu. Kalau akun Patient dihapus, Custom Audio yang Made for dia ikut terhapus.
- **Notes pindah ke `custom_audio_notes`.** RLS hanya membatasi baris, bukan kolom, sehingga notes di `custom_audios` ikut terbaca setiap assignee. Tabel baru ini hanya dibaca pemilik Audio Bank dan Admin.
- **Simpan ke perangkat dipensiunkan untuk Clinician dan Admin di build yang terhubung ke Supabase.** Library dan Studio menawarkan Move to Audio Bank. Build standalone tetap menyimpan di perangkat, dan Export/Import file tetap tersedia untuk semua.
- **`updated_at` distempel database** di setiap update, dan Audio Bank mengurutkan dari yang terakhir disimpan.

## Considered Options

- **Daftar Audio Bank tetap di Studio, dengan paging**: ditolak, karena mencampur mengedit dengan mengelola.
- **Audio Bank digabung ke Library**: ditolak, karena "yang saya buat" jadi bercampur dengan "yang saya dengarkan".
- **Custom Audio Made for tetap milik pembuatnya saat Transfer**: ditolak, karena Patient kehilangan audionya dan perawatannya terputus.
- **Salinan yang tertaut ke sumbernya**: ditolak, karena perubahan pada sumber akan sampai ke Patient lain tanpa diduga.

## Consequences

Migration 0019 menambah `made_for`, `based_on`, tabel `custom_audio_notes`, dan trigger aturan Made for, lalu menghapus `custom_audios.notes`. Client membaca notes dari tabel itu, dan hanya pemilik serta Admin yang mendapat barisnya. Daftar cloud dibaca per 500 baris (`allRows`), jadi tidak lagi berhenti di `max_rows`. Studio, Audio Bank, Library, dan drawer Patient saling membuka lewat `studioRequest.ts`.
