import { ExactPrice } from "../../domain/types";

import { formatExactPriceUk } from "../../domain/wishlist";

export function getErrorMessageUk(err: unknown): string {
  return err instanceof Error ? err.message : "Сталася неочікувана помилка.";
}

export function formatPriceNumber(val: number | string): string {
  const digits = String(val).replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatWishApproximatePriceUk(
  price: ExactPrice | null,
): string | null {
  if (!price) return null;
  if (price.currency === "UAH" && price.amountMinor % 100 === 0) {
    const whole = new Intl.NumberFormat("uk-UA", {
      maximumFractionDigits: 0,
    }).format(BigInt(price.amountMinor) / 100n);
    return `≈ ${whole} грн`;
  }
  const exact = formatExactPriceUk(price);
  return exact ? `≈ ${exact}` : null;
}
