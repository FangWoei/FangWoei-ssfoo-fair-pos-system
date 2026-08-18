import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

/* ═══════════════════════════════════════════════════════════════
   Your Firebase project: ssfoo-fair-20b61
   Already filled in. Nothing to do here.
   ═══════════════════════════════════════════════════════════════ */

const firebaseConfig = {
  apiKey: 'AIzaSyC78HLXuXu4Olw2mV7TWLWnQWmkHwePAMo',
  authDomain: 'ssfoo-fair-20b61.firebaseapp.com',
  projectId: 'ssfoo-fair-20b61',
  storageBucket: 'ssfoo-fair-20b61.firebasestorage.app',
  messagingSenderId: '1002782281636',
  appId: '1:1002782281636:web:1f546bf292a335cb88bb31',
};

/* ═══════════════════════════════════════════════════════════════
   Nothing below here needs editing.
   ═══════════════════════════════════════════════════════════════ */

// Anything left blank above falls back to .env, so either approach works.
const env = import.meta.env;
const config = {
  apiKey: firebaseConfig.apiKey || env.VITE_FB_API_KEY,
  authDomain: firebaseConfig.authDomain || env.VITE_FB_AUTH_DOMAIN,
  projectId: firebaseConfig.projectId || env.VITE_FB_PROJECT_ID,
  storageBucket: firebaseConfig.storageBucket || env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: firebaseConfig.messagingSenderId || env.VITE_FB_MSG_SENDER_ID,
  appId: firebaseConfig.appId || env.VITE_FB_APP_ID,
};

const REQUIRED = ['apiKey', 'authDomain', 'projectId', 'appId'];
export const missingConfig = REQUIRED.filter((k) => !config[k]);

/* Startup diagnostic. Open F12 -> Console to see it.
   If "VITE_ keys Vite loaded" comes back empty, your .env file is not being
   read — wrong folder, or named .env.txt, or the dev server needs a restart. */
console.log(
  '%cTill startup',
  'font-weight:bold',
  {
    'config source': firebaseConfig.apiKey ? 'firebase.js (hard-coded)' : '.env',
    'VITE_ keys Vite loaded': Object.keys(env).filter((k) => k.startsWith('VITE_')),
    'projectId in use': config.projectId || '(none)',
    'missing': missingConfig.length ? missingConfig : 'nothing — good',
  }
);

/* Set up inside a try/catch so a bad config shows a readable message on
   screen instead of killing the whole page before React can mount. */

let app = null;
let db = null;
let auth = null;
let workerAuth = null;
let setupError = null;

if (missingConfig.length === 0) {
  try {
    app = initializeApp(config);

    // Offline cache: a dropped wifi at the fair doesn't stop the till.
    // Sales queue locally and sync when the connection comes back.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });

    auth = getAuth(app);

    /* A second, throwaway connection to the same project, used only when an
       admin creates a staff account.

       Firebase signs you in as whoever you just created. Doing that on the
       main connection would boot the admin out mid-shift. This one keeps its
       session in memory only, so the admin's own login is never touched. */
    const worker = initializeApp(config, 'account-maker');
    workerAuth = initializeAuth(worker, { persistence: inMemoryPersistence });
  } catch (e) {
    setupError = e;
    console.error('Firebase setup failed:', e);
  }
}

export { db, auth, workerAuth, setupError, onAuthStateChanged };
