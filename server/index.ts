import { initializeApp, App, cert, ServiceAccount } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { Auth, getAuth } from "firebase-admin/auth";

export type DBUpdateProps = {
  collectionId?: string;
  id?: string;
  data?: object;
  __firebaseIdToken?: string;
};

export type BeforeDBUpdate = ({
  collectionId,
  id,
  data,
}: {
  collectionId: string;
  id?: string;
  data: Record<string, any>;
}) => void | Promise<void>;

export type SanitizeData = <T>(data: Record<string, any>) => Partial<T>;

export type CollectionConfig = {
  sanitize?: SanitizeData;
  beforeCreate?: BeforeDBUpdate;
  beforeUpdate?: BeforeDBUpdate;
  beforeDelete?: BeforeDBUpdate;
};

export type DatabaseConfig = Record<string, CollectionConfig>;

export class ServerBase {
  __app: App;
  __db: Firestore;
  __auth: Auth;

  constructor(
    serviceAccountConfig: ServiceAccount,
    databaseConfig: DatabaseConfig
  ) {
    this.__app = initializeApp({ credential: cert(serviceAccountConfig) });
    this.__db = getFirestore();
    this.__auth = getAuth();
  }

  authenticate = async (idToken: string) => {
    if (!idToken) return null;
    const decodedToken = await this.__auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;
    return uid;
  };

  dbGet = async ({
    collectionId,
    id,
  }: {
    collectionId: string;
    id: string;
  }) => {
    const docRef = this.__db.collection(collectionId).doc(id);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      throw new Error(`No document found at /${collectionId}/${id}.`);
    }

    return {
      ...snapshot.data(),
      id,
    };
  };

  dbUpdate = async ({
    collectionId,
    id,
    data,
    __firebaseIdToken,
  }: DBUpdateProps) => {
    const uid = await this.authenticate(__firebaseIdToken);

    if (!uid) throw new Error("Permission denied.");
    if (!collectionId) throw new Error(`Missing property "collectionId"`);
    if (!data) throw new Error(`Missing property "data"`);

    const createData = {
      ...data,
      createdBy: uid,
      createdAt: Date.now(),
    };

    if (id) {
      const docRef = this.__db.collection(collectionId).doc(id);
      const doc = await docRef.get();
      if (doc.exists) await docRef.update(data);
      else await docRef.set(createData);
      return this.dbGet({ collectionId, id });
    }

    const collectionRef = this.__db.collection(collectionId);
    const newDocRef = await collectionRef.add(createData);
    return this.dbGet({ collectionId, id: newDocRef.id });
  };
}
