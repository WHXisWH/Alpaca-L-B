// RWA Asset Templates with Pre-configured Risk Parameters
export interface AssetTemplate {
  id: string;
  name: string;
  emoji: string;
  category: string;
  value: bigint;      // Value in nano MAS
  pd: number;         // Probability of Default (basis points)
  lgd: number;        // Loss Given Default (basis points)
  description: string;
}

export interface AssetCategory {
  id: string;
  name: string;
  emoji: string;
  description: string;
  templates: AssetTemplate[];
}

export const RWA_CATEGORIES: AssetCategory[] = [
  {
    id: "real_estate",
    name: "Real Estate",
    emoji: "🏠",
    description: "Properties, land, and real estate assets",
    templates: [
      {
        id: "luxury_residential",
        name: "Luxury Residential",
        emoji: "🏰",
        category: "real_estate",
        value: BigInt(50_000_000_000), // 50 MAS
        pd: 80,    // 0.8% default probability
        lgd: 1500, // 15% loss rate
        description: "High-end residential properties with premium locations"
      },
      {
        id: "standard_residential",
        name: "Standard Residential",
        emoji: "🏠",
        category: "real_estate",
        value: BigInt(25_000_000_000), // 25 MAS
        pd: 120,   // 1.2%
        lgd: 2000, // 20%
        description: "Standard family homes and residential units"
      },
      {
        id: "commercial_property",
        name: "Commercial Property",
        emoji: "🏢",
        category: "real_estate",
        value: BigInt(80_000_000_000), // 80 MAS
        pd: 150,   // 1.5%
        lgd: 2500, // 25%
        description: "Office buildings, retail spaces, and commercial real estate"
      },
      {
        id: "industrial_land",
        name: "Industrial Land",
        emoji: "🏭",
        category: "real_estate",
        value: BigInt(30_000_000_000), // 30 MAS
        pd: 200,   // 2%
        lgd: 3000, // 30%
        description: "Industrial zones, factories, and manufacturing facilities"
      }
    ]
  },
  {
    id: "vehicles",
    name: "Vehicles",
    emoji: "🚗",
    description: "Automobiles, boats, and transportation assets",
    templates: [
      {
        id: "luxury_car",
        name: "Luxury Vehicle",
        emoji: "🏎️",
        category: "vehicles",
        value: BigInt(15_000_000_000), // 15 MAS
        pd: 300,   // 3% (higher depreciation)
        lgd: 4000, // 40%
        description: "Premium cars, sports cars, and luxury vehicles"
      },
      {
        id: "standard_car",
        name: "Standard Vehicle",
        emoji: "🚗",
        category: "vehicles",
        value: BigInt(5_000_000_000),  // 5 MAS
        pd: 400,   // 4%
        lgd: 4500, // 45%
        description: "Standard passenger cars and family vehicles"
      },
      {
        id: "heavy_truck",
        name: "Commercial Truck",
        emoji: "🚛",
        category: "vehicles",
        value: BigInt(20_000_000_000), // 20 MAS
        pd: 250,   // 2.5%
        lgd: 3500, // 35%
        description: "Heavy trucks, commercial vehicles, and transport equipment"
      },
      {
        id: "yacht",
        name: "Yacht",
        emoji: "🛥️",
        category: "vehicles",
        value: BigInt(40_000_000_000), // 40 MAS
        pd: 350,   // 3.5%
        lgd: 5000, // 50%
        description: "Luxury boats, yachts, and marine vessels"
      }
    ]
  },
  {
    id: "receivables",
    name: "Receivables",
    emoji: "📋",
    description: "Financial instruments and receivable assets",
    templates: [
      {
        id: "bank_note",
        name: "Bank Acceptance",
        emoji: "🏦",
        category: "receivables",
        value: BigInt(10_000_000_000), // 10 MAS
        pd: 50,    // 0.5% (bank credit)
        lgd: 500,  // 5%
        description: "Bank-guaranteed promissory notes and acceptances"
      },
      {
        id: "corporate_receivable",
        name: "Corporate Receivable",
        emoji: "📊",
        category: "receivables",
        value: BigInt(8_000_000_000),  // 8 MAS
        pd: 180,   // 1.8%
        lgd: 2000, // 20%
        description: "Corporate accounts receivable and business debts"
      },
      {
        id: "trade_receivable",
        name: "Trade Receivable",
        emoji: "🚢",
        category: "receivables",
        value: BigInt(12_000_000_000), // 12 MAS
        pd: 220,   // 2.2%
        lgd: 2800, // 28%
        description: "International trade receivables and export credits"
      },
      {
        id: "invoice_financing",
        name: "Invoice Financing",
        emoji: "📄",
        category: "receivables",
        value: BigInt(6_000_000_000),  // 6 MAS
        pd: 300,   // 3%
        lgd: 3500, // 35%
        description: "Invoice factoring and short-term receivables"
      }
    ]
  },
  {
    id: "collectibles",
    name: "Collectibles",
    emoji: "🎨",
    description: "Art, collectibles, and luxury items",
    templates: [
      {
        id: "fine_art",
        name: "Fine Art",
        emoji: "🖼️",
        category: "collectibles",
        value: BigInt(35_000_000_000), // 35 MAS
        pd: 100,   // 1% (stable value)
        lgd: 3000, // 30%
        description: "Paintings, sculptures, and fine artwork"
      },
      {
        id: "vintage_wine",
        name: "Vintage Wine",
        emoji: "🍷",
        category: "collectibles",
        value: BigInt(8_000_000_000),  // 8 MAS
        pd: 150,   // 1.5%
        lgd: 3500, // 35%
        description: "Rare wines and vintage collections"
      },
      {
        id: "luxury_watch",
        name: "Luxury Watch",
        emoji: "⌚",
        category: "collectibles",
        value: BigInt(18_000_000_000), // 18 MAS
        pd: 120,   // 1.2%
        lgd: 2500, // 25%
        description: "High-end watches and timepieces"
      },
      {
        id: "precious_metals",
        name: "Precious Metals",
        emoji: "🥇",
        category: "collectibles",
        value: BigInt(22_000_000_000), // 22 MAS
        pd: 80,    // 0.8%
        lgd: 1000, // 10%
        description: "Gold, silver, platinum, and precious metal assets"
      }
    ]
  },
  {
    id: "infrastructure",
    name: "Infrastructure",
    emoji: "⚡",
    description: "Energy, mining, and infrastructure assets",
    templates: [
      {
        id: "solar_farm",
        name: "Solar Farm",
        emoji: "☀️",
        category: "infrastructure",
        value: BigInt(100_000_000_000), // 100 MAS
        pd: 180,   // 1.8%
        lgd: 3000, // 30%
        description: "Solar panel installations and renewable energy projects"
      },
      {
        id: "mining_equipment",
        name: "Mining Equipment",
        emoji: "⛏️",
        category: "infrastructure",
        value: BigInt(60_000_000_000), // 60 MAS
        pd: 300,   // 3%
        lgd: 4000, // 40%
        description: "Heavy mining machinery and extraction equipment"
      },
      {
        id: "wind_turbine",
        name: "Wind Turbine",
        emoji: "🌪️",
        category: "infrastructure",
        value: BigInt(45_000_000_000), // 45 MAS
        pd: 200,   // 2%
        lgd: 3200, // 32%
        description: "Wind power generation equipment and installations"
      },
      {
        id: "data_center",
        name: "Data Center",
        emoji: "🖥️",
        category: "infrastructure",
        value: BigInt(120_000_000_000), // 120 MAS
        pd: 150,   // 1.5%
        lgd: 2800, // 28%
        description: "Server infrastructure and data processing facilities"
      }
    ]
  }
];

// Helper functions
export const getTemplateById = (templateId: string): AssetTemplate | undefined => {
  for (const category of RWA_CATEGORIES) {
    const template = category.templates.find(t => t.id === templateId);
    if (template) return template;
  }
  return undefined;
};

export const getCategoryById = (categoryId: string): AssetCategory | undefined => {
  return RWA_CATEGORIES.find(c => c.id === categoryId);
};

export const formatMASValue = (nanoMAS: bigint): string => {
  return (Number(nanoMAS) / 1_000_000_000).toFixed(1);
};

export const formatRiskParams = (pd: number, lgd: number): string => {
  return `PD: ${(pd / 100).toFixed(2)}% | LGD: ${(lgd / 100).toFixed(1)}%`;
};