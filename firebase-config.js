// ═══════════════════════════════════════════════════════════════════
//  SETUP FIREBASE — Ikuti langkah ini (sekali saja, ~10 menit)
// ═══════════════════════════════════════════════════════════════════
//
//  1. Buka https://console.firebase.google.com → Add project
//  2. Authentication → Sign-in method → Email/Password → Enable
//  3. Authentication → Users → Add user (buat akun admin Waalz, Ilham, dll.)
//  4. Firestore Database → Create database → Production mode
//  5. Firestore → Rules → paste isi file firestore.rules → Publish
//  6. Project Settings → Your apps → Web (</>) → copy config ke bawah
//  7. Push ke GitHub → website online + data shared!
//
//  API key BOLEH di-commit (aman). Keamanan edit di Firestore Rules.
// ═══════════════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "ISI_API_KEY_KAMU",
  authDomain: "ISI_PROJECT_ID.firebaseapp.com",
  projectId: "ISI_PROJECT_ID",
  storageBucket: "ISI_PROJECT_ID.appspot.com",
  messagingSenderId: "ISI_SENDER_ID",
  appId: "ISI_APP_ID",
};
