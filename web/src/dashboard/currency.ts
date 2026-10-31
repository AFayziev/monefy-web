import { createContext, useContext } from 'react';

/**
 * The currency amounts are shown in: the export's converted currency across all accounts, or the
 * selected account's own currency inside the stats section. Null until there is data.
 */
export const BaseCurrencyContext = createContext<string | null>(null);

export const useBaseCurrency = () => useContext(BaseCurrencyContext);
