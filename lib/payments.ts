import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

/** Payments are switched off for the TestFlight test. Set EXPO_PUBLIC_PAYMENTS_ENABLED=true to turn them on. */
export const PAYMENTS_ENABLED = process.env.EXPO_PUBLIC_PAYMENTS_ENABLED === 'true';
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
export const ENTITLEMENT = 'plus';
let configured = false;
let configuredUser: string | null = null;
let configuration: Promise<void> = Promise.resolve();

export function configurePayments(userId: string) {
  if (!PAYMENTS_ENABLED) return Promise.resolve();
  configuration = configuration.catch(() => {}).then(async () => {
  if (Platform.OS === 'web') throw new Error('Subscriptions are available in the mobile app.');
  const apiKey = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) throw new Error('Subscriptions are not configured in this build.');
  if (!configured) { Purchases.configure({ apiKey, appUserID: userId }); configured = true; }
  else if (configuredUser !== userId) await Purchases.logIn(userId);
  configuredUser = userId;
  });
  return configuration;
}
/** True when the person can use the app: always while payments are off. */
export async function hasAccess(userId?: string) {
  if (!PAYMENTS_ENABLED) return true;
  if (userId) await configurePayments(userId);
  if (!configured) throw new Error('Subscriptions are not configured in this build.');
  const info = await Purchases.getCustomerInfo(); return !!info.entitlements.active[ENTITLEMENT];
}
export async function getPackages(): Promise<PurchasesPackage[]> {
  if (!PAYMENTS_ENABLED) return [];
  await configuration;
  if (!configured) return [];
  const o = await Purchases.getOfferings();
  return o.current?.availablePackages ?? [];
}
export async function buy(p: PurchasesPackage) { const r = await Purchases.purchasePackage(p); return !!r.customerInfo.entitlements.active[ENTITLEMENT]; }
export async function restore() { const info = await Purchases.restorePurchases(); return !!info.entitlements.active[ENTITLEMENT]; }
