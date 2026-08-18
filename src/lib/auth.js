import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, workerAuth, db, missingConfig, setupError } from '../firebase';

export const ROLES = {
  admin: {
    id: 'admin',
    label: 'Admin',
    blurb: 'Everything a cashier can do, plus creating and managing accounts.',
  },
  user: {
    id: 'user',
    label: 'Cashier',
    blurb: 'Sells, adds and edits products, sees the sales history.',
  },
};

/** Watches who is signed in. Returns an unsubscribe. */
export function watchAuth(onChange, onError) {
  if (missingConfig.length) {
    onError?.(
      `Firebase config is incomplete — missing: ${missingConfig.join(', ')}.`
    );
    return () => {};
  }
  if (setupError || !auth) {
    onError?.(`Firebase failed to start: ${setupError?.message || 'unknown error'}`);
    return () => {};
  }
  return onAuthStateChanged(auth, onChange);
}

/**
 * Watches the signed-in person's profile: their name, role, and whether the
 * account is still switched on. This is the real gate — an auth account with
 * no profile here can't do anything.
 */
export function watchProfile(uid, onChange, onError) {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => onChange(snap.exists() ? { uid, ...snap.data() } : null),
    (e) => onError?.(readable(e))
  );
}

export function watchUsers(cb, onError) {
  return onSnapshot(
    query(collection(db, 'users'), orderBy('name', 'asc')),
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))),
    (e) => onError?.(readable(e))
  );
}

export async function signIn(email, password) {
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: readable(e) };
  }
}

export const signOut = () => fbSignOut(auth);

/**
 * Creates a staff account. Admin only — enforced by the Firestore rules, not
 * just by hiding the button.
 *
 * Runs on the secondary connection so the admin's own session survives.
 */
export async function createAccount({ email, password, name, role }) {
  const clean = email.trim().toLowerCase();
  if (!clean || !password || !name.trim()) {
    return { ok: false, message: 'Name, email and password are all needed.' };
  }
  if (password.length < 6) {
    return { ok: false, message: 'Firebase needs a password of at least 6 characters.' };
  }

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(workerAuth, clean, password);
  } catch (e) {
    return { ok: false, message: readable(e) };
  }

  try {
    // Written from the ADMIN's session, so the rules can check the role.
    await setDoc(doc(db, 'users', cred.user.uid), {
      email: clean,
      name: name.trim(),
      role: role === 'admin' ? 'admin' : 'user',
      active: true,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    return {
      ok: false,
      message:
        'The login was created but the profile was not: ' +
        readable(e) +
        ' — that person cannot sign in until an admin adds their profile.',
    };
  } finally {
    // Never leave the throwaway connection holding a session.
    await fbSignOut(workerAuth).catch(() => {});
  }

  return { ok: true, uid: cred.user.uid };
}

export const setUserActive = (uid, active) =>
  updateDoc(doc(db, 'users', uid), { active });

export const setUserRole = (uid, role) =>
  updateDoc(doc(db, 'users', uid), { role: role === 'admin' ? 'admin' : 'user' });

export const renameUser = (uid, name) =>
  updateDoc(doc(db, 'users', uid), { name: name.trim() });

/** Turns Firebase's error codes into something a person can act on. */
function readable(e) {
  const code = e?.code || '';
  const map = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account with that email.',
    'auth/invalid-email': 'That email address is not valid.',
    'auth/user-disabled': 'That account has been disabled in Firebase.',
    'auth/too-many-requests':
      'Too many failed attempts. Wait a minute and try again.',
    'auth/email-already-in-use': 'Someone already has an account with that email.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/operation-not-allowed':
      'Email/password sign-in is switched off. Firebase console → ' +
      'Authentication → Sign-in method → Email/Password → Enable.',
    'auth/network-request-failed': 'No connection to Firebase. Check the wifi.',
    'permission-denied':
      'Firestore refused that. Check the rules are published, and that your ' +
      'own profile has role "admin".',
  };
  return map[code] || `${code || 'Error'} — ${e?.message || 'something went wrong'}`;
}
