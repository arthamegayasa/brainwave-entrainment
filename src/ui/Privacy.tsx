import { useLayoutEffect, useState } from "react";

/**
 * Privacy policy (#18): Indonesian + English versions of what ADR-014..022
 * mean for a User's data. Monitoring is explained here only — no consent
 * screens or pop-ups (ADR-017).
 */

type Lang = "id" | "en";

/** Who answers personal-data questions and requests (UU PDP). */
const DATA_CONTROLLER = { name: "SwaraSanti", email: "arthamail@gmail.com" };

interface Point {
  term: string;
  text: string;
}

interface PolicySection {
  heading: string;
  intro?: string;
  points?: Point[];
  note?: string;
}

interface PolicyCopy {
  title: string;
  intro: string;
  effective: string;
  sections: PolicySection[];
  contactHeading: string;
  contactIntro: string;
  contactNote: string;
  governing: string;
}

const LANGUAGES: Array<{ id: Lang; label: string }> = [
  { id: "id", label: "Bahasa Indonesia" },
  { id: "en", label: "English" },
];

const POLICY: Record<Lang, PolicyCopy> = {
  id: {
    title: "Kebijakan privasi",
    intro:
      "Apa yang SwaraSanti catat tentang Anda, siapa yang bisa melihatnya, berapa lama disimpan, dan apa yang bisa Anda minta — dengan bahasa yang sederhana.",
    effective: "Berlaku sejak 26 September 2026.",
    sections: [
      {
        heading: "Istilah yang kami pakai",
        intro: "Beberapa kata di halaman ini punya arti khusus:",
        points: [
          { term: "User:", text: "siapa pun yang punya akun SwaraSanti." },
          { term: "Patient:", text: "User yang terhubung ke tepat satu Clinician." },
          {
            term: "Clinician:",
            text: "profesional yang membimbing pendengaran Patient-nya sendiri di SwaraSanti.",
          },
          {
            term: "Admin:",
            text: "pemilik platform, yang mengawasi semua Clinician dan Patient.",
          },
          { term: "Link:", text: "hubungan antara seorang Patient dan Clinician-nya." },
          {
            term: "Play:",
            text: "satu kali pemutaran sesi bawaan (Preset), Custom Audio, atau sesi yang Anda simpan di perangkat lalu putar dari Library.",
          },
          {
            term: "Download:",
            text: "satu kali unduhan MP3 sebuah Preset atau Custom Audio.",
          },
          {
            term: "Listening History:",
            text: "seluruh Play dan Download milik satu User.",
          },
        ],
      },
      {
        heading: "Data yang kami kumpulkan",
        intro: "Hanya yang dibutuhkan agar SwaraSanti berjalan.",
        points: [
          {
            term: "Akun Anda:",
            text: "nama, alamat email (Patient boleh tidak punya), Username bila ada, dan peran Anda.",
          },
          {
            term: "Cara Anda masuk:",
            text: "kebanyakan User masuk lewat tautan login yang dikirim ke email dan tidak punya password di SwaraSanti. Patient yang punya password, dan Clinician yang akunnya dibuat Admin, masuk dengan password — lihat bagian Password di bawah.",
          },
          {
            term: "Pendengaran Anda:",
            text: "saat Anda login, Listening History Anda — lihat di bawah.",
          },
          {
            term: "Paket Anda:",
            text: "bila Anda berlangganan, pembayaran diproses Midtrans, yang menerima alamat email Anda. Kami menyimpan paket, statusnya, nomor pesanan, dan tanggal perpanjangan, serta notifikasi pembayaran dari Midtrans, yang bisa memuat nomor kartu tersamar atau nomor virtual account.",
          },
          {
            term: "Bila Anda Clinician:",
            text: "Custom Audio di Audio Bank Anda, Custom Audio yang Anda assign ke setiap Patient, dan Preset yang Anda sembunyikan darinya.",
          },
          {
            term: "Di perangkat ini:",
            text: "progres (journey, streak), preferensi, dan sesi Studio yang Anda simpan di perangkat tetap berada di penyimpanan browser ini dan tidak dikirim ke kami. Bila Anda memutar sesi tersimpan itu dari Library saat login, pemutarannya dicatat sebagai Play beserta nama sesinya. Progres dan preferensi bisa Anda reset di Account.",
          },
        ],
        note: "Data akun dan Listening History disimpan di penyedia cloud kami, Supabase.",
      },
      {
        heading: "Listening History",
        intro:
          "Saat Anda login — sebagai User mana pun, bukan hanya Patient — SwaraSanti mencatat setiap Play dan setiap Download ke akun Anda. Tidak ada pengaturan untuk mematikannya. Bila Anda memakai SwaraSanti tanpa login, pendengaran Anda hanya tercatat di perangkat ini.",
        points: [
          {
            term: "Setiap Play:",
            text: "audio apa (beserta namanya, agar catatan tetap terbaca meski audionya diganti nama atau dihapus), kapan mulai dan berhenti, berapa lama benar-benar didengar (tanpa jeda), panjang yang direncanakan, dan apakah diputar sampai selesai, dihentikan lebih awal (dan di menit ke berapa), atau tanpa batas waktu (∞).",
          },
          {
            term: "Zona waktu Anda:",
            text: "zona waktu perangkat Anda, agar jam ditampilkan sesuai waktu setempat Anda (misalnya WIB, WITA, atau WIT).",
          },
          {
            term: "Setiap Download:",
            text: "audio apa, panjangnya, dan kapan diunduh, beserta zona waktu Anda. Mendengarkan MP3 yang diunduh terjadi di luar app dan tidak bisa dicatat.",
          },
          {
            term: "Saat offline:",
            text: "Play disimpan dulu di perangkat dan dikirim begitu Anda online kembali, tidak pernah dua kali.",
          },
          {
            term: "Yang tidak dicatat:",
            text: "pemutaran di bawah 30 detik dan pemutaran uji di Studio.",
          },
        ],
        note: "Tujuannya: agar Anda bisa mengikuti kemajuan sendiri, agar Clinician Anda bisa melihat bagaimana pendengaran Anda berjalan dan membimbing Anda, dan agar Admin bisa membantu Anda serta menjalankan SwaraSanti.",
      },
      {
        heading: "Siapa yang bisa melihatnya",
        points: [
          { term: "Anda,", text: "di Account." },
          {
            term: "Clinician Anda,",
            text: "bila Anda Patient — selama Link Anda berlaku dan ia masih memegang peran Clinician.",
          },
          {
            term: "Admin,",
            text: "untuk Listening History setiap User, termasuk User yang bukan Patient.",
          },
        ],
        note: "User lain tidak bisa melihatnya, dan kami tidak menjual data Anda.",
      },
      {
        heading: "Patient dan Clinician-nya",
        intro:
          "Bila Anda Patient, akun Anda terhubung ke satu Clinician lewat sebuah Link. Hanya Clinician Anda atau Admin yang bisa memutus Link — Anda sendiri tidak bisa.",
        points: [
          {
            term: "Yang diatur Clinician Anda:",
            text: "ia bisa membuat akun Anda, mengatur Username dan password Anda, dan memilih sesi serta audio yang Anda lihat.",
          },
          {
            term: "Premium dari Clinician:",
            text: "Clinician Anda atau Admin bisa memberi Anda Premium. Premium langsung menyala untuk Patient baru dan berlaku sampai dimatikan atau Link diputus.",
          },
          {
            term: "Bila Link diputus:",
            text: "Clinician sebelumnya tidak bisa lagi melihat Listening History maupun password Anda, salinan password Anda dihapus, dan Premium darinya berakhir. Akun Anda tetap ada; bila Anda punya Username dan password, Anda tetap bisa memakainya untuk masuk.",
          },
          {
            term: "Transfer:",
            text: "Admin bisa memindahkan Anda ke Clinician lain. Listening History, Premium, Username, dan salinan password Anda ikut pindah. Sejak itu Clinician baru mendapat akses yang dijelaskan di halaman ini, dan Clinician sebelumnya tidak lagi.",
          },
          {
            term: "Bila Clinician Anda kehilangan perannya:",
            text: "ia tidak bisa mengakses data Anda sampai perannya kembali atau Admin men-Transfer Anda ke Clinician lain.",
          },
        ],
      },
      {
        heading: "Password",
        intro:
          "Patient yang punya password, dan Clinician yang akunnya dibuat Admin, masuk dengan password — dan password itu bisa dilihat oleh pihak di bawah ini. User lain masuk lewat tautan login di email dan tidak punya password di SwaraSanti.",
        points: [
          {
            term: "Disimpan terenkripsi:",
            text: "selain hash satu arah untuk memeriksanya, kami menyimpan salinan password Anda yang terenkripsi, termasuk password yang Anda ganti sendiri. Salinan itu hanya didekripsi di server kami, dengan kunci yang disimpan di luar database.",
          },
          {
            term: "Siapa yang bisa melihat atau me-reset-nya:",
            text: "Clinician dari Patient itu dan Admin. Bila Patient itu juga seorang Clinician — atau pernah menjadi Clinician dan masih punya Patient — hanya Admin. Admin juga bisa melihat dan me-reset password Clinician yang akunnya ia buat.",
          },
          {
            term: "Setiap kali dilihat, tercatat:",
            text: "siapa yang melihat, password milik siapa, dan kapan. Hanya Admin yang bisa membaca catatan ini.",
          },
        ],
        note: "Karena bisa dilihat, jangan pakai password yang juga Anda pakai di tempat lain (email, bank).",
      },
      {
        heading: "Username dan Personal URL",
        points: [
          {
            term: "Personal URL:",
            text: "setiap Patient yang punya Username mendapat Personal URL, yaitu alamat SwaraSanti diikuti /p/<username>, yang membuka layar password berisi nama depannya. Siapa pun yang membuka atau menebak alamat itu bisa tahu bahwa akunnya ada beserta nama depannya; selebihnya tetap terlindungi password.",
          },
          {
            term: "Mengganti Username:",
            text: "Personal URL lama terus mengalihkan ke yang baru sampai Username lama diambil orang lain, dan itu baru bisa terjadi setelah 30 hari. Username akun yang dihapus juga dikunci 30 hari.",
          },
        ],
      },
      {
        heading: "Berapa lama kami menyimpannya",
        points: [
          {
            term: "Selama akun Anda ada,",
            text: "kami menyimpan data akun dan Listening History Anda.",
          },
          {
            term: "Saat akun Anda dihapus,",
            text: "Listening History, Link ke Clinician Anda, dan salinan password Anda ikut dihapus. Catatan password yang dilihat tetap menyimpan kapan password Anda dilihat, tetapi tidak lagi menyebut milik siapa. Hanya Admin yang bisa menghapus akun; lihat hak Anda di bawah.",
          },
          {
            term: "Bila Anda Clinician dan akun Anda dihapus,",
            text: "Custom Audio Anda yang masih dipakai User lain (di-assign atau dipublikasikan sebagai Template) berpindah ke Admin agar Library mereka tetap utuh; Custom Audio lainnya ikut dihapus.",
          },
          {
            term: "Catatan pembayaran",
            text: "disimpan terpisah dari akun Anda dan tidak ikut terhapus saat akun dihapus.",
          },
        ],
      },
      {
        heading: "Hak Anda menurut UU PDP",
        intro:
          "Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP) memberi Anda hak untuk:",
        points: [
          {
            term: "Mengakses:",
            text: "melihat Listening History Anda di Account kapan saja, dan meminta Admin data lain yang kami simpan tentang Anda.",
          },
          {
            term: "Memperbaiki:",
            text: "meminta Admin memperbaiki data yang salah atau tidak lengkap, misalnya nama atau email Anda.",
          },
          {
            term: "Menghapus:",
            text: "meminta Admin menghapus akun Anda beserta Listening History-nya.",
          },
        ],
        note: "Kirim permintaan Anda ke pengendali data di bawah.",
      },
    ],
    contactHeading: "Pengendali data",
    contactIntro:
      "Pertanyaan dan permintaan tentang data pribadi Anda — termasuk permintaan akses, perbaikan, dan penghapusan — dijawab oleh pengelola SwaraSanti:",
    contactNote:
      "Sebutkan nama akun, Username, atau email Anda agar kami bisa menemukan data Anda. Kami menanggapi setiap permintaan dalam batas waktu yang ditetapkan UU PDP.",
    governing:
      "Kebijakan ini tersedia dalam bahasa Indonesia dan bahasa Inggris. Untuk keperluan UU PDP, teks bahasa Indonesia yang berlaku.",
  },
  en: {
    title: "Privacy policy",
    intro:
      "What SwaraSanti records about you, who can see it, how long we keep it, and what you can ask us to do — in plain words.",
    effective: "Effective from 26 September 2026.",
    sections: [
      {
        heading: "Words we use",
        intro: "A few words on this page have a precise meaning:",
        points: [
          { term: "User:", text: "anyone with a SwaraSanti account." },
          { term: "Patient:", text: "a User connected to exactly one Clinician." },
          {
            term: "Clinician:",
            text: "a professional who guides their own Patients' listening on SwaraSanti.",
          },
          {
            term: "Admin:",
            text: "the owner of the platform, who oversees every Clinician and Patient.",
          },
          { term: "Link:", text: "the connection between a Patient and their Clinician." },
          {
            term: "Play:",
            text: "one playback of a built-in session (Preset), of Custom Audio, or of a session you saved on your device and played from the Library.",
          },
          {
            term: "Download:",
            text: "one MP3 download of a Preset or Custom Audio.",
          },
          {
            term: "Listening History:",
            text: "all of one User's Plays and Downloads.",
          },
        ],
      },
      {
        heading: "What we collect",
        intro: "Only what SwaraSanti needs to work.",
        points: [
          {
            term: "Your account:",
            text: "name, email address (Patients may have none), Username if you have one, and your role.",
          },
          {
            term: "How you sign in:",
            text: "most Users sign in with a sign-in link sent to their email and have no password with SwaraSanti. Patients who have a password, and Clinicians whose account the Admin created, sign in with a password — see Passwords below.",
          },
          {
            term: "Your listening:",
            text: "when you're signed in, your Listening History — see below.",
          },
          {
            term: "Your plan:",
            text: "if you subscribe, Midtrans processes the payment and receives your email address. We keep your plan, its status, the order number and the renewal date, plus the payment notifications Midtrans sends us, which can include a masked card number or a virtual account number.",
          },
          {
            term: "If you're a Clinician:",
            text: "the Custom Audio in your Audio Bank, the Custom Audio you assign to each Patient, and the Presets you hide from them.",
          },
          {
            term: "On this device:",
            text: "progress (journey, streaks), preferences and Studio sessions you save on the device stay in this browser's storage and aren't sent to us. If you play one of those saved sessions from the Library while signed in, that playback is recorded as a Play, with the session's name. You can reset progress and preferences in Account.",
          },
        ],
        note: "Account data and Listening History are stored with our cloud provider, Supabase.",
      },
      {
        heading: "Listening History",
        intro:
          "When you're signed in — as any User, not only Patients — SwaraSanti records every Play and every Download to your account. There is no setting to turn this off. If you use SwaraSanti without signing in, your listening is only recorded on this device.",
        points: [
          {
            term: "Each Play:",
            text: "which audio it was (with its name, so the record still reads correctly if the audio is renamed or deleted), when it started and ended, how long you actually listened (pauses excluded), its planned length, and whether it played to the end, was stopped early (and at which minute), or was open-ended (∞).",
          },
          {
            term: "Your time zone:",
            text: "your device's time zone, so times are shown in your local time (for example WIB, WITA or WIT).",
          },
          {
            term: "Each Download:",
            text: "which audio, its length and when you downloaded it, with your time zone. Listening to a downloaded MP3 happens outside the app and can't be recorded.",
          },
          {
            term: "Offline:",
            text: "Plays wait on your device and are sent once you're back online, never twice.",
          },
          {
            term: "Not recorded:",
            text: "playback shorter than 30 seconds, and test playback in the Studio.",
          },
        ],
        note: "Why: so you can follow your own progress, so your Clinician can see how your listening is going and guide you, and so the Admin can support you and keep SwaraSanti running.",
      },
      {
        heading: "Who can see it",
        points: [
          { term: "You,", text: "in Account." },
          {
            term: "Your Clinician,",
            text: "if you're a Patient — for as long as your Link lasts and they hold the Clinician role.",
          },
          {
            term: "The Admin,",
            text: "for every User's Listening History, including Users who aren't Patients.",
          },
        ],
        note: "No other User can see it, and we don't sell your data.",
      },
      {
        heading: "Patients and their Clinician",
        intro:
          "If you're a Patient, your account is connected to one Clinician through a Link. Only your Clinician or the Admin can end the Link — you can't end it yourself.",
        points: [
          {
            term: "What your Clinician manages:",
            text: "they can create your account, set your Username and password, and choose which sessions and audio you see.",
          },
          {
            term: "Premium from your Clinician:",
            text: "your Clinician or the Admin can give you Premium. It's on from the start for new Patients and lasts until they turn it off or the Link ends.",
          },
          {
            term: "If the Link ends:",
            text: "your former Clinician can no longer see your Listening History or your password, the stored copy of your password is deleted, and their Premium ends. Your account stays; if you have a Username and password, you can still use them to sign in.",
          },
          {
            term: "Transfer:",
            text: "the Admin can move you to another Clinician. Your Listening History, Premium, Username and the stored copy of your password move with you. From then on the new Clinician has the access described on this page, and the previous one has none.",
          },
          {
            term: "If your Clinician loses their role:",
            text: "they can't access your data until the role returns or the Admin transfers you to another Clinician.",
          },
        ],
      },
      {
        heading: "Passwords",
        intro:
          "Patients who have a password, and Clinicians whose account the Admin created, sign in with a password — and that password can be seen by the people below. Everyone else signs in with an emailed sign-in link and has no password with SwaraSanti.",
        points: [
          {
            term: "Stored encrypted:",
            text: "besides the one-way hash used to check it, we keep an encrypted copy of your password, including one you changed yourself. It's decrypted only on our server, with a key kept outside the database.",
          },
          {
            term: "Who can view or reset it:",
            text: "the Patient's Clinician and the Admin. If the Patient is also a Clinician — or used to be one and still has Patients — only the Admin. The Admin can also view and reset the password of Clinicians whose account the Admin created.",
          },
          {
            term: "Every view is logged:",
            text: "who viewed it, whose password it was, and when. Only the Admin can read this log.",
          },
        ],
        note: "Because it can be seen, don't use a password you also use anywhere else (email, banking).",
      },
      {
        heading: "Username and Personal URL",
        points: [
          {
            term: "Personal URL:",
            text: "every Patient with a Username gets a Personal URL, the SwaraSanti address followed by /p/<username>, which opens a password screen showing their first name. Anyone who opens or guesses that address can learn that the account exists and its first name; everything else stays behind the password.",
          },
          {
            term: "Changing a Username:",
            text: "the old Personal URL keeps forwarding to the new one until someone else takes the old Username, which can't happen for 30 days. The Username of a deleted account is also held for 30 days.",
          },
        ],
      },
      {
        heading: "How long we keep it",
        points: [
          {
            term: "For as long as your account exists,",
            text: "we keep your account data and Listening History.",
          },
          {
            term: "When your account is deleted,",
            text: "your Listening History, your Link to your Clinician and the stored copy of your password are deleted with it. The log of password views keeps when your password was viewed, but no longer says whose it was. Only the Admin can delete an account; see your rights below.",
          },
          {
            term: "If you're a Clinician and your account is deleted,",
            text: "your Custom Audio that other Users still use (assigned to them or published as a Template) moves to the Admin so their Library stays whole; the rest of your Custom Audio is deleted.",
          },
          {
            term: "Payment records",
            text: "are kept separately from your account and aren't deleted with it.",
          },
        ],
      },
      {
        heading: "Your rights under UU PDP",
        intro:
          "Indonesia's Personal Data Protection Law (Undang-Undang Nomor 27 Tahun 2022, UU PDP) gives you the right to:",
        points: [
          {
            term: "Access:",
            text: "see your Listening History in Account at any time, and ask the Admin for the other data we hold about you.",
          },
          {
            term: "Correction:",
            text: "ask the Admin to fix data that's wrong or incomplete, such as your name or email.",
          },
          {
            term: "Deletion:",
            text: "ask the Admin to delete your account together with your Listening History.",
          },
        ],
        note: "Send your request to the data controller below.",
      },
    ],
    contactHeading: "Data controller",
    contactIntro:
      "Questions and requests about your personal data — including requests for access, correction and deletion — are answered by SwaraSanti's operator:",
    contactNote:
      "Include your account name, Username or email so we can find your data. We respond to every request within the time limits set by UU PDP.",
    governing:
      "This policy is available in Indonesian and English. For the purposes of UU PDP, the Indonesian text governs.",
  },
};

export function Privacy() {
  // Browser language picks the first version shown; nothing is stored.
  const [lang, setLang] = useState<Lang>(() =>
    navigator.language.toLowerCase().startsWith("id") ? "id" : "en",
  );
  const copy = POLICY[lang];

  // Every entry point (footer, sign-in forms) sits low on its page; scroll
  // anchoring would keep that spot in view and open the policy at its end.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="privacy" lang={lang}>
      <div className="lang-switch" role="group" aria-label="Bahasa / Language">
        {LANGUAGES.map((l) => (
          <button
            key={l.id}
            lang={l.id}
            aria-pressed={lang === l.id}
            className={lang === l.id ? "selected" : ""}
            onClick={() => setLang(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>

      <header className="privacy-head">
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
        <p className="privacy-effective">{copy.effective}</p>
      </header>

      {copy.sections.map((section) => (
        <section className="privacy-section" key={section.heading}>
          <h2>{section.heading}</h2>
          {section.intro && <p className="section-intro">{section.intro}</p>}
          {section.points && (
            <ul className="privacy-points">
              {section.points.map((p) => (
                <li key={p.term}>
                  <strong>{p.term}</strong> {p.text}
                </li>
              ))}
            </ul>
          )}
          {section.note && <p className="privacy-note">{section.note}</p>}
        </section>
      ))}

      <section className="privacy-section">
        <h2>{copy.contactHeading}</h2>
        <p className="section-intro">{copy.contactIntro}</p>
        <p className="privacy-contact">
          {DATA_CONTROLLER.name} ·{" "}
          <a href={`mailto:${DATA_CONTROLLER.email}`}>{DATA_CONTROLLER.email}</a>
        </p>
        <p className="privacy-note">{copy.contactNote}</p>
      </section>

      <p className="privacy-governing">{copy.governing}</p>
    </div>
  );
}
