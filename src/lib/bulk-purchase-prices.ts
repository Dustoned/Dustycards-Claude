export function distributeTotalPurchasePrice(totalPrice: number, itemCount: number): number[] {
  if (!Number.isFinite(totalPrice) || totalPrice < 0) {
    throw new Error("Total purchase price must be a positive number or zero");
  }
  if (!Number.isInteger(itemCount) || itemCount <= 0) {
    throw new Error("Item count must be a positive integer");
  }

  const totalCents = Math.round(totalPrice * 100);
  const baseCents = Math.floor(totalCents / itemCount);
  const remainder = totalCents % itemCount;

  return Array.from({ length: itemCount }, (_, index) =>
    Number(((baseCents + (index < remainder ? 1 : 0)) / 100).toFixed(2))
  );
}
