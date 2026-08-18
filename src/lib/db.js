import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

/* ---------- tills ---------- */
/* Each laptop picks its identity once. The methods listed here are the only
   ones that laptop will ever offer, so nobody can take a card on the machine
   with no terminal. */

export const TILLS = {
  windows: {
    id: 'windows',
    name: 'Windows till',
    methods: ['cash', 'qr'],
    hasDrawer: true,
  },
  macbook: {
    id: 'macbook',
    name: 'MacBook till',
    methods: ['qr', 'card'],
    hasDrawer: false,
  },
};

export const METHODS = {
  cash: { id: 'cash', label: 'Cash', key: 'F1' },
  qr: { id: 'qr', label: "Touch 'n Go", key: 'F2' },
  card: { id: 'card', label: 'Card', key: 'F3' },
};

const TILL_KEY = 'pos.till';
export const getTill = () => TILLS[localStorage.getItem(TILL_KEY)] || null;
export const setTill = (id) => localStorage.setItem(TILL_KEY, id);

/* ---------- products ---------- */

export function watchProducts(cb, onError) {
  return onSnapshot(
    query(collection(db, 'products'), orderBy('sort', 'asc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('products', err);
      onError?.(firestoreMessage(err));
    }
  );
}

/** Firestore's errors are terse. Turn the common ones into instructions. */
export function firestoreMessage(err) {
  if (err?.code === 'permission-denied') {
    return (
      'Firestore refused to read the products. Almost always one of these: ' +
      'the rules from firestore.rules have not been published yet, or your ' +
      'document in the users collection has active set as the TEXT "true" ' +
      'instead of the boolean true. In the Firebase console the field type ' +
      'must say boolean, and role must be exactly admin or user in lower case.'
    );
  }
  if (err?.code === 'failed-precondition') {
    return (
      'Firestore needs an index for this query. Open the browser console — ' +
      'the error there has a link that creates it in one click.'
    );
  }
  if (err?.code === 'unavailable') {
    return 'No connection to Firestore. Check the wifi and reload.';
  }
  return `${err?.code || 'Error'} — ${err?.message || 'something went wrong'}`;
}

export const saveProduct = (id, data) =>
  setDoc(doc(db, 'products', id), data, { merge: true });

export const newProductRef = () => doc(collection(db, 'products'));

export const removeProduct = (id) => deleteDoc(doc(db, 'products', id));

/* ---------- sales ---------- */

/** Receipt numbers are per-till so the two laptops can never collide. */
async function nextReceiptNo(tillId) {
  const ref = doc(db, 'counters', tillId);
  const prefix = tillId === 'windows' ? 'W' : 'M';
  try {
    const n = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const next = (snap.exists() ? snap.data().n : 0) + 1;
      tx.set(ref, { n: next }, { merge: true });
      return next;
    });
    return `${prefix}${String(n).padStart(4, '0')}`;
  } catch {
    // Offline or contended: fall back to a local sequence. Still unique per
    // till because of the prefix, and the sale is never blocked.
    const n = Number(localStorage.getItem('pos.localNo') || 0) + 1;
    localStorage.setItem('pos.localNo', String(n));
    return `${prefix}L${String(n).padStart(4, '0')}`;
  }
}

/**
 * Writes the sale. Does NOT await the server round-trip — the local write
 * lands immediately and Firestore syncs it whenever the network allows.
 */
export async function recordSale(sale, tillId, cashier) {
  const receiptNo = await nextReceiptNo(tillId);
  const payload = {
    ...sale,
    receiptNo,
    till: tillId,
    cashierUid: cashier?.uid || '',
    cashierName: cashier?.name || '',
    createdAt: serverTimestamp(),
    localAt: Timestamp.now(),
  };
  addDoc(collection(db, 'sales'), payload).catch((e) =>
    console.error('sale sync failed (kept locally)', e)
  );
  return { ...payload, receiptNo };
}

export function watchSalesSince(since, cb, onError) {
  return onSnapshot(
    query(
      collection(db, 'sales'),
      where('localAt', '>=', Timestamp.fromDate(since)),
      orderBy('localAt', 'desc')
    ),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('sales', err);
      onError?.(firestoreMessage(err));
    }
  );
}
