export type BillingCountry = {
  name: string;
  currency: string;
  symbol: string;
};

export const COUNTRY_NAMES: string[] = [
  "United States", "United Kingdom", "Canada", "Australia", "Germany", "France", "India", "Japan", "China", "Brazil",
  "South Africa", "Nigeria", "Egypt", "United Arab Emirates", "Saudi Arabia", "Russia", "South Korea", "Italy", "Spain", "Mexico",
  "Argentina", "Chile", "Colombia", "Peru", "Netherlands", "Sweden", "Norway", "Denmark", "Finland", "Switzerland",
  "Austria", "Belgium", "Ireland", "Portugal", "Greece", "Turkey", "Israel", "Singapore", "Malaysia", "Thailand",
  "Vietnam", "Indonesia", "Philippines", "New Zealand", "Pakistan", "Bangladesh", "Sri Lanka", "Nepal",
].sort();

export const BILLING_COUNTRIES: BillingCountry[] = [
  { name: "United States", currency: "USD", symbol: "$" },
  { name: "United Kingdom", currency: "GBP", symbol: "£" },
  { name: "India", currency: "INR", symbol: "₹" },
  { name: "Germany", currency: "EUR", symbol: "€" },
  { name: "France", currency: "EUR", symbol: "€" },
  { name: "Japan", currency: "JPY", symbol: "¥" },
  { name: "Canada", currency: "CAD", symbol: "C$" },
  { name: "Australia", currency: "AUD", symbol: "A$" },
  { name: "United Arab Emirates", currency: "AED", symbol: "د.إ" },
  { name: "Saudi Arabia", currency: "SAR", symbol: "﷼" },
].sort((a, b) => a.name.localeCompare(b.name));
