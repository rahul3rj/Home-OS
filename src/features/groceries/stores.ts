/**
 * Quick-order stores (sub-agent 2).
 *
 * Each entry is a VERIFIED web search URL: the OS opens the store's own app
 * when it is installed (all four claim their domains) and the browser
 * otherwise — so there is no installed-app detection to maintain and no
 * undocumented native scheme to rot. BB Now is deliberately absent: it has no
 * confirmed search route, and opening its home page would break the promise
 * that the item comes up searched.
 *
 * The default store is per DEVICE (each phone may prefer a different app), so
 * it lives in local prefs, not the database.
 */

import { getStored, setStored } from '@/lib/storage';

/**
 * Countries for quick ordering. India has apps today; everywhere else shows
 * None until its list is added. To add one: append `{ id, name }` here and
 * tag its stores below — the picker, the reset and the order flow all follow
 * this table with no other changes.
 */
export const COUNTRIES = [
  { id: 'IN', name: 'India' },
  { id: 'OTHER', name: 'Other' },
] as const;

export type StoreCountryId = (typeof COUNTRIES)[number]['id'];

export const STORES = [
  { id: 'zepto', name: 'Zepto', countries: ['IN'] },
  { id: 'blinkit', name: 'Blinkit', countries: ['IN'] },
  { id: 'swiggy', name: 'Swiggy Instamart', countries: ['IN'] },
  { id: 'flipkart', name: 'Flipkart Minutes', countries: ['IN'] },
] as const;

export type StoreAppId = (typeof STORES)[number]['id'];

/** Apps serving a country. Empty means None — the only honest option there. */
export function storesForCountry(country: StoreCountryId): readonly StoreAppId[] {
  return STORES.filter((store) => (store.countries as readonly string[]).includes(country)).map(
    (store) => store.id,
  );
}

export function storeName(id: StoreAppId): string {
  return STORES.find((store) => store.id === id)?.name ?? id;
}

export function countryName(id: StoreCountryId): string {
  return COUNTRIES.find((country) => country.id === id)?.name ?? id;
}

const STORE_KEY = 'home-os.grocery-store';
const COUNTRY_KEY = 'home-os.grocery-country';

export function readStoreId(): StoreAppId | null {
  const raw = getStored(STORE_KEY);
  return STORES.some((store) => store.id === raw) ? (raw as StoreAppId) : null;
}

export function writeStoreId(id: StoreAppId | null): void {
  setStored(STORE_KEY, id ?? '');
}

/** Defaults to India, so existing devices keep the apps they already had. */
export function readCountryId(): StoreCountryId {
  const raw = getStored(COUNTRY_KEY);
  return COUNTRIES.some((country) => country.id === raw) ? (raw as StoreCountryId) : 'IN';
}

export function writeCountryId(id: StoreCountryId): void {
  setStored(COUNTRY_KEY, id);
}

/** Search URL for the item. Always openable: app when installed, browser if not. */
export function orderUrl(store: StoreAppId, itemName: string): string {
  const query = encodeURIComponent(itemName.trim());
  switch (store) {
    case 'zepto':
      return `https://www.zepto.com/search?query=${query}`;
    case 'blinkit':
      return `https://blinkit.com/s/?q=${query}`;
    case 'swiggy':
      return `https://www.swiggy.com/stores/instamart/search?query=${query}`;
    case 'flipkart':
      return `https://www.flipkart.com/search?q=${query}&marketplace=HYPERLOCAL`;
  }
}
