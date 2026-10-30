import {
  IconArrowDownRight,
  IconArrowsLeftRight,
  IconArrowUpRight,
  IconBabyCarriage,
  IconBriefcase,
  IconBus,
  IconCar,
  IconCash,
  IconCategory,
  IconCreditCard,
  IconCurrencyDollar,
  IconDeviceMobile,
  IconFlag,
  IconGift,
  IconHeartbeat,
  IconHome,
  IconPackage,
  IconPercentage,
  IconPigMoney,
  IconReceipt,
  IconShirt,
  IconShoppingCart,
  IconSparkles,
  IconToolsKitchen2,
  IconUsers,
  IconWallet,
  IconWeight,
  type Icon,
} from '@tabler/icons-react';
import type { KindFilter } from '../../../shared/dashboard';

export const KINDS: Record<KindFilter, { color: string; icon: Icon; label: string }> = {
  expense: { color: 'red', icon: IconArrowDownRight, label: 'Expense' },
  income: { color: 'brand', icon: IconArrowUpRight, label: 'Income' },
  transfer: { color: 'blue', icon: IconArrowsLeftRight, label: 'Transfer' },
  initial: { color: 'violet', icon: IconFlag, label: 'Initial' },
};

/** Stored kind (`transfer_out`, …) to its UI group. */
export const kindGroup = (kind: string): KindFilter =>
  kind.startsWith('transfer') ? 'transfer' : (kind as KindFilter);

/** Monefy's default category names (the export is in Russian) and common English ones. */
const CATEGORY_ICONS: [RegExp, Icon][] = [
  [/питание|продукт|food|grocer/i, IconShoppingCart],
  [/такси|taxi|доставка/i, IconCar],
  [/транспорт|transport/i, IconBus],
  [/общепит|кафе|restaurant|eating/i, IconToolsKitchen2],
  [/жиль|дом|house|home/i, IconHome],
  [/подар|праздн|gift/i, IconGift],
  [/спорт|sport/i, IconWeight],
  [/связь|phone|communication/i, IconDeviceMobile],
  [/здоров|health/i, IconHeartbeat],
  [/одежд|cloth/i, IconShirt],
  [/семья|family/i, IconUsers],
  [/дет|kids/i, IconBabyCarriage],
  [/счета|налог|bills|tax/i, IconReceipt],
  [/кредит|loan/i, IconPercentage],
  [/депозит|deposit|savings/i, IconPigMoney],
  [/зарплат|salary/i, IconBriefcase],
  [/гигиен|уход|toilet|care/i, IconSparkles],
  [/разное|other/i, IconPackage],
];

export const categoryIcon = (category: string): Icon =>
  CATEGORY_ICONS.find(([pattern]) => pattern.test(category))?.[1] ?? IconCategory;

export function accountIcon(account: string, currency: string): Icon {
  if (currency === 'USD') {
    return IconCurrencyDollar;
  }

  if (/card|карт/i.test(account)) {
    return IconCreditCard;
  }

  if (/налич|cash/i.test(account)) {
    return IconCash;
  }

  return IconWallet;
}
