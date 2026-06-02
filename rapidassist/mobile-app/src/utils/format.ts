export function formatCurrency(amount: number) {
  return `Rs. ${amount.toLocaleString("en-PK")}`;
}

export function compactAddress(address?: string | null) {
  if (!address) return "Location not selected";
  return address.length > 42 ? `${address.slice(0, 39)}...` : address;
}

