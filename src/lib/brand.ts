// The public demo (DEMO_DB=1, exposed as NEXT_PUBLIC_DEMO at build) carries a neutral brand;
// every other build is the mill's own.
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

export const BRAND = IS_DEMO
  ? { name: "Weaving Mills ERP", short: "Weaving ERP", mark: "WEAVING ERP", logo: "/demo-logo.svg" }
  : { name: "SK Weaving Mills", short: "SK Mills", mark: "SK MILLS", logo: "/sk-logo.png" };
