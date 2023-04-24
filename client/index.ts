import { initializeApp, FirebaseOptions, FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  Auth,
  setPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
} from "firebase/auth";
import {
  doc,
  collection,
  Firestore,
  FirestoreError,
  getFirestore,
  onSnapshot,
  query,
  QueryConstraint,
  where,
  orderBy,
  updateDoc,
  getDoc,
  setDoc,
  deleteDoc,
  connectFirestoreEmulator,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { v4 as uuid } from "uuid";

export type ApiConfig = {
  updateItem: string;
};

export { where, orderBy, arrayUnion, arrayRemove };

export class ClientBase {
  __apiConfig: ApiConfig;
  __app: FirebaseApp;
  __auth: Auth;
  __db: Firestore;
  firebaseIdToken: string;

  constructor(firebaseConfig: FirebaseOptions, useEmulator: boolean) {
    this.__app = initializeApp(firebaseConfig);
    this.__auth = getAuth(this.__app);
    this.__db = getFirestore();

    if (useEmulator) {
      connectFirestoreEmulator(this.__db, "localhost", 6969);
      connectAuthEmulator(this.__auth, "http://localhost:4242");
    }
  }

  authenticate = async () => {
    const user = this.__auth.currentUser;
    console.log("authenticating...", user);
    if (!user) {
      this.firebaseIdToken = null;
      return;
    }

    if (!this.firebaseIdToken) {
      const idToken = await user.getIdToken(true);
      this.firebaseIdToken = idToken;
    }
  };

  signUp = async ({ email, password }: { email: string; password: string }) => {
    await setPersistence(this.__auth, browserLocalPersistence);
    createUserWithEmailAndPassword(this.__auth, email, password)
      .then((userCredential) => {
        // Signed in
        const user = userCredential.user;
        // ...
      })
      .catch((error) => {
        const errorCode = error.code;
        const errorMessage = error.message;
        // ..
      });
  };

  logIn = async ({ email, password }: { email: string; password: string }) => {
    await setPersistence(this.__auth, browserLocalPersistence);
    signInWithEmailAndPassword(this.__auth, email, password)
      .then((userCredential) => {
        // Signed in
        const user = userCredential.user;
        console.log("logged in as", user);
        // ...
      })
      .catch((error) => {
        console.log(error);
        const errorCode = error.code;
        const errorMessage = error.message;
      });
  };

  getItem = async <T>({
    collectionId,
    id,
  }: {
    collectionId: string;
    id: string;
  }) => {
    const docRef = doc(this.__db, `${collectionId}/${id}`);
    const snapshot = await getDoc(docRef);
    const snapshotData = snapshot.data();

    if (snapshotData) {
      return { ...snapshotData, id } as unknown as T;
    }

    return undefined;
  };

  updateItem = async <T>({
    collectionId,
    id,
    data,
  }: {
    collectionId: string;
    id?: string;
    data: Record<string, any>;
  }) => {
    if (id) {
      const docRef = doc(this.__db, `${collectionId}/${id}`);
      const snapshot = await getDoc(docRef);
      const snapshotData = snapshot.data();

      if (snapshotData) {
        await updateDoc(docRef, data);
        return id;
      }
    }

    const createData = {
      ...data,
      createdBy: this.__auth.currentUser.uid,
      createdAt: Date.now(),
    };

    const newDocId = id || uuid();
    const newDocRef = doc(this.__db, `${collectionId}/${newDocId}`);
    await setDoc(newDocRef, createData);
    return newDocId;
  };

  deleteItem = async <T>({
    collectionId,
    id,
  }: {
    collectionId: string;
    id?: string;
  }) => {
    const docRef = doc(this.__db, `${collectionId}/${id}`);
    await deleteDoc(docRef);
  };

  watchItem = <T>({
    collectionId,
    id,
    onChange,
    onError,
  }: {
    collectionId: string;
    id: string;
    onChange: (data: T) => void;
    onError?: (error: FirestoreError) => void;
  }) => {
    const docRef = doc(this.__db, `${collectionId}/${id}`);
    const unsubscribe = onSnapshot(docRef, {
      next: (snapshot) => {
        const snapshotData = snapshot.data() as T;
        const data = snapshotData
          ? { ...snapshotData, id: snapshot.id }
          : undefined;
        onChange(data);
      },
      error: (error) => {
        onError && onError(error);
      },
    });
    return unsubscribe;
  };

  watchQuery = <T>({
    collectionId,
    constraints,
    onChange,
    onError,
  }: {
    collectionId: string;
    constraints: QueryConstraint[];
    onChange: (data: T[]) => void;
    onError?: (error: FirestoreError) => void;
  }) => {
    const collectionRef = collection(this.__db, collectionId);
    const queryRef = query(collectionRef, ...constraints);
    const unsubscribe = onSnapshot(queryRef, {
      next: (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
        }));
        onChange(data as T[]);
      },
      error: (error) => {
        onError && onError(error);
      },
    });
    return unsubscribe;
  };
}
