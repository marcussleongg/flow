export const PRODUCTS = {
  liter: {
    line: "1L Line",
    ratePerHour: 2000,
    materialsPerUnit: { pet: 20, pta: 15, eg: 10 },
  },
  gallon: {
    line: "1G Line",
    ratePerHour: 1500,
    materialsPerUnit: { pet: 65, pta: 45, eg: 20 },
  },
} as const;

export type ProductType = keyof typeof PRODUCTS;
export type Material = "pet" | "pta" | "eg";

export const MATERIALS: Material[] = ["pet", "pta", "eg"];
