import Constants from 'expo-constants';
import { useIAP, type Purchase } from 'expo-iap';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { Platform } from 'react-native';

import { LIFETIME_PRODUCT_ID, PREMIUM_TRIAL_DAYS } from './premiumConfig';

type PremiumSource = 'trial' | 'lifetime' | 'expired';

interface PremiumContextValue {
  isLoading: boolean;
  isUnlocked: boolean;
  source: PremiumSource;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  daysLeft: number;
  lifetimeProductId: string;
  lifetimePrice: string | null;
  productLoaded: boolean;
  purchaseInProgress: boolean;
  restoreInProgress: boolean;
  error: string | null;
  purchaseLifetimeAccess: () => Promise<void>;
  restorePurchases: () => Promise<void>;
}

const TRIAL_STARTED_KEY = 'premium.trialStartedAt';
const LIFETIME_UNLOCKED_KEY = 'premium.lifetimeUnlocked';
const DAY_MS = 24 * 60 * 60 * 1000;

const PremiumContext = createContext<PremiumContextValue | null>(null);

export function PremiumProvider({ children }: PropsWithChildren) {
  if (Platform.OS === 'web' || String(Constants.appOwnership) !== 'standalone') {
    return <ExpoGoPremiumProvider>{children}</ExpoGoPremiumProvider>;
  }

  return <NativeIapPremiumProvider>{children}</NativeIapPremiumProvider>;
}

function ExpoGoPremiumProvider({ children }: PropsWithChildren) {
  const [bootstrapped, setBootstrapped] = useState(false);
  const [trialStartedAtMs, setTrialStartedAtMs] = useState<number | null>(null);
  const [lifetimeUnlocked, setLifetimeUnlocked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const [storedTrialStartedAt, storedLifetimeUnlocked] = await Promise.all([
        readPremiumStore(TRIAL_STARTED_KEY),
        readPremiumStore(LIFETIME_UNLOCKED_KEY),
      ]);

      const firstSeenAt = storedTrialStartedAt ? Number(storedTrialStartedAt) : Date.now();
      if (!storedTrialStartedAt) {
        // Expo Go nema IAP native modul, ale trial stav se ma chovat stejne jako v buildu.
        await writePremiumStore(TRIAL_STARTED_KEY, String(firstSeenAt));
      }

      if (!cancelled) {
        setTrialStartedAtMs(Number.isFinite(firstSeenAt) ? firstSeenAt : Date.now());
        setLifetimeUnlocked(storedLifetimeUnlocked === 'true');
        setBootstrapped(true);
      }
    }

    void bootstrap().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Premium bootstrap failed');
        setBootstrapped(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const trialEndsAtMs =
    trialStartedAtMs === null ? null : trialStartedAtMs + PREMIUM_TRIAL_DAYS * DAY_MS;
  const daysLeft =
    trialEndsAtMs === null ? 0 : Math.max(0, Math.ceil((trialEndsAtMs - now) / DAY_MS));
  const trialActive = trialEndsAtMs === null ? false : now < trialEndsAtMs;
  const isUnlocked = lifetimeUnlocked || trialActive;
  const source: PremiumSource = lifetimeUnlocked ? 'lifetime' : trialActive ? 'trial' : 'expired';

  const purchaseLifetimeAccess = useCallback(async () => {
    setError('Purchases require a development build or TestFlight.');
  }, []);

  const restorePurchases = useCallback(async () => {
    setError('Restore requires a development build or TestFlight.');
  }, []);

  const value = useMemo<PremiumContextValue>(
    () => ({
      isLoading: !bootstrapped,
      isUnlocked,
      source,
      trialStartedAt: trialStartedAtMs === null ? null : new Date(trialStartedAtMs),
      trialEndsAt: trialEndsAtMs === null ? null : new Date(trialEndsAtMs),
      daysLeft,
      lifetimeProductId: LIFETIME_PRODUCT_ID,
      lifetimePrice: null,
      productLoaded: false,
      purchaseInProgress: false,
      restoreInProgress: false,
      error,
      purchaseLifetimeAccess,
      restorePurchases,
    }),
    [
      bootstrapped,
      daysLeft,
      error,
      isUnlocked,
      purchaseLifetimeAccess,
      restorePurchases,
      source,
      trialEndsAtMs,
      trialStartedAtMs,
    ],
  );

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

function NativeIapPremiumProvider({ children }: PropsWithChildren) {
  const [bootstrapped, setBootstrapped] = useState(false);
  const [trialStartedAtMs, setTrialStartedAtMs] = useState<number | null>(null);
  const [lifetimeUnlocked, setLifetimeUnlocked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [purchaseInProgress, setPurchaseInProgress] = useState(false);
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlockLifetime = useCallback(async () => {
    await writePremiumStore(LIFETIME_UNLOCKED_KEY, 'true');
    setLifetimeUnlocked(true);
  }, []);

  const {
    connected,
    products,
    availablePurchases,
    fetchProducts,
    finishTransaction,
    getAvailablePurchases,
    requestPurchase,
    restorePurchases: restoreStorePurchases,
  } = useIAP({
    onPurchaseSuccess: (purchase) => {
      void (async () => {
        if (!isLifetimePurchase(purchase)) return;
        await unlockLifetime();
        await finishTransaction({ purchase, isConsumable: false });
        setPurchaseInProgress(false);
      })();
    },
    onPurchaseError: (purchaseError) => {
      setError(purchaseError.message);
      setPurchaseInProgress(false);
    },
    onError: (iapError) => {
      setError(iapError.message);
      setPurchaseInProgress(false);
      setRestoreInProgress(false);
    },
  });

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const [storedTrialStartedAt, storedLifetimeUnlocked] = await Promise.all([
        readPremiumStore(TRIAL_STARTED_KEY),
        readPremiumStore(LIFETIME_UNLOCKED_KEY),
      ]);

      const firstSeenAt = storedTrialStartedAt ? Number(storedTrialStartedAt) : Date.now();
      if (!storedTrialStartedAt) {
        // Trial start držíme mimo JS state, aby běžný reinstall/cache reload nerozhodil paywall.
        await writePremiumStore(TRIAL_STARTED_KEY, String(firstSeenAt));
      }

      if (!cancelled) {
        setTrialStartedAtMs(Number.isFinite(firstSeenAt) ? firstSeenAt : Date.now());
        setLifetimeUnlocked(storedLifetimeUnlocked === 'true');
        setBootstrapped(true);
      }
    }

    void bootstrap().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Premium bootstrap failed');
        setBootstrapped(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!connected) return;
    void fetchProducts({ skus: [LIFETIME_PRODUCT_ID], type: 'in-app' });
    void getAvailablePurchases();
  }, [connected, fetchProducts, getAvailablePurchases]);

  useEffect(() => {
    if (availablePurchases.some(isLifetimePurchase)) {
      void unlockLifetime();
    }
  }, [availablePurchases, unlockLifetime]);

  const lifetimeProduct = products.find((product) => product.id === LIFETIME_PRODUCT_ID) ?? null;
  const trialEndsAtMs =
    trialStartedAtMs === null ? null : trialStartedAtMs + PREMIUM_TRIAL_DAYS * DAY_MS;
  const daysLeft =
    trialEndsAtMs === null ? 0 : Math.max(0, Math.ceil((trialEndsAtMs - now) / DAY_MS));
  const trialActive = trialEndsAtMs === null ? false : now < trialEndsAtMs;
  const isUnlocked = lifetimeUnlocked || trialActive;
  const source: PremiumSource = lifetimeUnlocked ? 'lifetime' : trialActive ? 'trial' : 'expired';

  const purchaseLifetimeAccess = useCallback(async () => {
    setError(null);
    setPurchaseInProgress(true);
    try {
      await requestPurchase({
        type: 'in-app',
        request: {
          apple: {
            sku: LIFETIME_PRODUCT_ID,
            andDangerouslyFinishTransactionAutomatically: false,
          },
          google: {
            skus: [LIFETIME_PRODUCT_ID],
          },
        },
      });
    } catch (err) {
      setPurchaseInProgress(false);
      setError(err instanceof Error ? err.message : 'Purchase failed');
    }
  }, [requestPurchase]);

  const restoreLifetimePurchases = useCallback(async () => {
    setError(null);
    setRestoreInProgress(true);
    try {
      await restoreStorePurchases();
      await getAvailablePurchases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoreInProgress(false);
    }
  }, [getAvailablePurchases, restoreStorePurchases]);

  const value = useMemo<PremiumContextValue>(
    () => ({
      isLoading: !bootstrapped,
      isUnlocked,
      source,
      trialStartedAt: trialStartedAtMs === null ? null : new Date(trialStartedAtMs),
      trialEndsAt: trialEndsAtMs === null ? null : new Date(trialEndsAtMs),
      daysLeft,
      lifetimeProductId: LIFETIME_PRODUCT_ID,
      lifetimePrice: lifetimeProduct?.displayPrice ?? null,
      productLoaded: Boolean(lifetimeProduct),
      purchaseInProgress,
      restoreInProgress,
      error,
      purchaseLifetimeAccess,
      restorePurchases: restoreLifetimePurchases,
    }),
    [
      bootstrapped,
      daysLeft,
      error,
      isUnlocked,
      lifetimeProduct,
      purchaseInProgress,
      purchaseLifetimeAccess,
      restoreInProgress,
      restoreLifetimePurchases,
      source,
      trialEndsAtMs,
      trialStartedAtMs,
    ],
  );

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium(): PremiumContextValue {
  const value = useContext(PremiumContext);
  if (!value) {
    throw new Error('usePremium must be used inside PremiumProvider');
  }
  return value;
}

function isLifetimePurchase(purchase: Purchase): boolean {
  return (
    purchase.productId === LIFETIME_PRODUCT_ID ||
    purchase.ids?.includes(LIFETIME_PRODUCT_ID) === true
  );
}

async function readPremiumStore(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  return SecureStore.getItemAsync(key);
}

async function writePremiumStore(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(key, value);
}
