import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  doc 
} from 'firebase/firestore';
import { auth, db, googleProvider, OperationType, handleFirestoreError } from '../lib/firebase';
import { Ad } from '../types';

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  ads: Ad[];
  isCloudSyncActive: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  saveAd: (adData: Omit<Ad, 'id' | 'createdAt'> & { id?: string }) => Promise<void>;
  deleteAd: (id: string) => Promise<void>;
  syncLocalToCloud: (localAds: Ad[]) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [ads, setAds] = useState<Ad[]>([]);
  const [isCloudSyncActive, setIsCloudSyncActive] = useState<boolean>(false);

  // Monitor status check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsCloudSyncActive(!!currentUser);
      if (!currentUser) {
        // Enforce fallback lock to local storage when not signed in
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync in real-time when authenticated
  useEffect(() => {
    if (!user) {
      setAds([]);
      return;
    }

    setLoading(true);
    const path = 'ads';
    const adsQuery = query(collection(db, path), where('userId', '==', user.uid));

    // Handle snapshot securely
    const unsubscribe = onSnapshot(
      adsQuery,
      (snapshot) => {
        const fetchedAds: Ad[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data) {
            fetchedAds.push({
              id: data.id || docSnap.id,
              userId: data.userId,
              title: data.title || 'Anuncio sin título',
              rawText: data.rawText || '',
              hook: data.hook || '',
              scenes: Array.isArray(data.scenes) ? data.scenes : [],
              speechPace: data.speechPace || 'normal',
              theme: data.theme || 'Estrategia de Marketing Deficiente',
              used: !!data.used,
              createdAt: data.createdAt || Date.now()
            });
          }
        });
        // Sort chronologically (newest first)
        fetchedAds.sort((a, b) => b.createdAt - a.createdAt);
        setAds(fetchedAds);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error during Google Sign-In:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error during Sign-Out:', error);
      throw error;
    }
  };

  const generateId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'ad_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
  };

  const saveAd = async (adData: Omit<Ad, 'id' | 'createdAt'> & { id?: string }) => {
    if (!user) {
      throw new Error('Debes iniciar sesión para guardar en la nube.');
    }

    const id = adData.id || generateId();
    const adDocRef = doc(db, 'ads', id);
    const finalAd: Ad = {
      id,
      userId: user.uid,
      title: adData.title,
      rawText: adData.rawText,
      hook: adData.hook,
      scenes: adData.scenes,
      speechPace: adData.speechPace,
      theme: adData.theme || 'Estrategia de Marketing Deficiente',
      used: !!adData.used,
      createdAt: adData.id ? (ads.find((a) => a.id === adData.id)?.createdAt || Date.now()) : Date.now(),
    };

    try {
      await setDoc(adDocRef, finalAd);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `ads/${id}`);
    }
  };

  const deleteAd = async (id: string) => {
    if (!user) {
      throw new Error('Debes iniciar sesión para eliminar de la nube.');
    }

    const adDocRef = doc(db, 'ads', id);
    try {
      await deleteDoc(adDocRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `ads/${id}`);
    }
  };

  // Sync existing offline local storage ads with Firebase profile
  const syncLocalToCloud = async (localAds: Ad[]) => {
    if (!user || localAds.length === 0) return;

    for (const ad of localAds) {
      const adDocRef = doc(db, 'ads', ad.id);
      const syncedAd: Ad = {
        ...ad,
        userId: user.uid, // re-assign to signed-in owner identifier
      };
      try {
        await setDoc(adDocRef, syncedAd);
      } catch (error) {
        console.error(`Error de sincronización para anuncio ${ad.id}:`, error);
      }
    }
  };

  return (
    <FirebaseContext.Provider
      value={{
        user,
        loading,
        ads,
        isCloudSyncActive,
        signInWithGoogle,
        logout,
        saveAd,
        deleteAd,
        syncLocalToCloud,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase debe ser utilizado dentro de un FirebaseProvider.');
  }
  return context;
};
