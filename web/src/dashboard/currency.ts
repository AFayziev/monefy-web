import { createContext, useContext } from 'react';

/** The export's converted currency: what totals, charts and the all-accounts balance are in. */
export const BaseCurrencyContext = createContext('UZS');

export const useBaseCurrency = () => useContext(BaseCurrencyContext);
