/**
 * Fixed addresses for NTU and the west-Singapore neighbourhoods around it.
 *
 * Seed data only. The provider form never reads this: address suggestions come
 * from the Places API, which is required. Coordinates are approximate
 * block-level points, which is enough to hand the seed script a real origin for
 * its Distance Matrix lookup.
 */
export type NtuAreaPlace = {
  id: string;
  address: string;
  area: string;
  lat: number;
  lng: number;
};

export const NTU_AREA_PLACES: NtuAreaPlace[] = [
  // --- On campus (NTU halls of residence) ---
  { id: "hall-2", address: "Hall of Residence 2, 20 Nanyang Ave, Singapore 639798", area: "NTU campus", lat: 1.3521, lng: 103.6852 },
  { id: "hall-6", address: "Hall of Residence 6, 34 Nanyang Cres, Singapore 637001", area: "NTU campus", lat: 1.3467, lng: 103.6873 },
  { id: "hall-9", address: "Hall of Residence 9, 25 Nanyang Cres, Singapore 637002", area: "NTU campus", lat: 1.3455, lng: 103.6861 },
  { id: "hall-11", address: "Hall of Residence 11, 21 Nanyang Cres, Singapore 637003", area: "NTU campus", lat: 1.3449, lng: 103.6849 },
  { id: "banyan-hall", address: "Banyan Hall, 32 Nanyang Cres, Singapore 637004", area: "NTU campus", lat: 1.3463, lng: 103.6885 },
  { id: "tamarind-hall", address: "Tamarind Hall, 28 Nanyang Cres, Singapore 637005", area: "NTU campus", lat: 1.3458, lng: 103.6879 },
  { id: "saraca-hall", address: "Saraca Hall, 30 Nanyang Cres, Singapore 637006", area: "NTU campus", lat: 1.3461, lng: 103.6891 },
  { id: "crescent-hall", address: "Crescent Hall, 16 Nanyang Cres, Singapore 637007", area: "NTU campus", lat: 1.3444, lng: 103.6840 },
  { id: "pioneer-hall", address: "Pioneer Hall, 18 Nanyang Cres, Singapore 637008", area: "NTU campus", lat: 1.3447, lng: 103.6835 },
  { id: "graduate-hall-1", address: "Graduate Hall 1, 8 Nanyang Ave, Singapore 639799", area: "NTU campus", lat: 1.3508, lng: 103.6829 },

  // --- Pioneer / Boon Lay ---
  { id: "blk-644-jw81", address: "Blk 644 Jurong West St 61, Singapore 640644", area: "Pioneer", lat: 1.3396, lng: 103.6969 },
  { id: "blk-651-jw61", address: "Blk 651 Jurong West St 61, Singapore 640651", area: "Pioneer", lat: 1.3383, lng: 103.6981 },
  { id: "blk-181-boonlay", address: "Blk 181 Boon Lay Dr, Singapore 640181", area: "Boon Lay", lat: 1.3459, lng: 103.7136 },
  { id: "blk-221-boonlay", address: "Blk 221 Boon Lay Pl, Singapore 640221", area: "Boon Lay", lat: 1.3466, lng: 103.7188 },
  { id: "lakeside-tower", address: "Lakeside Tower, 51 Yuan Ching Rd, Singapore 618645", area: "Lakeside", lat: 1.3418, lng: 103.7212 },

  // --- Jurong West ---
  { id: "blk-419-jw42", address: "Blk 419 Jurong West St 42, Singapore 640419", area: "Jurong West", lat: 1.3492, lng: 103.7220 },
  { id: "blk-505-jw52", address: "Blk 505 Jurong West St 52, Singapore 640505", area: "Jurong West", lat: 1.3502, lng: 103.7186 },
  { id: "blk-960-jw81", address: "Blk 960 Jurong West St 81, Singapore 640960", area: "Jurong West", lat: 1.3489, lng: 103.6982 },
  { id: "the-centris", address: "The Centris, 20 Jurong West Central 3, Singapore 648331", area: "Jurong West", lat: 1.3399, lng: 103.7060 },
  { id: "lakeholmz", address: "Lakeholmz, 41 Corporation Rd, Singapore 649822", area: "Jurong West", lat: 1.3378, lng: 103.7145 },

  // --- Clementi / Dover ---
  { id: "blk-322-clementi", address: "Blk 322 Clementi Ave 5, Singapore 120322", area: "Clementi", lat: 1.3145, lng: 103.7648 },
  { id: "blk-441-clementi", address: "Blk 441 Clementi Ave 3, Singapore 120441", area: "Clementi", lat: 1.3131, lng: 103.7666 },
  { id: "clementi-woods", address: "Clementi Woods Condominium, 3 West Coast Rd, Singapore 127147", area: "Clementi", lat: 1.3072, lng: 103.7639 },

  // --- Bukit Batok / Chinese Garden (still commutable) ---
  { id: "blk-155-bb", address: "Blk 155 Bukit Batok St 11, Singapore 650155", area: "Bukit Batok", lat: 1.3494, lng: 103.7452 },
  { id: "chinese-garden-rd", address: "Blk 132 Yuan Ching Rd, Singapore 618678", area: "Chinese Garden", lat: 1.3396, lng: 103.7268 },
];
