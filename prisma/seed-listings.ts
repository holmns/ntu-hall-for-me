/**
 * The demo listings, as data.
 *
 * Separate from `seed.ts` because that file deletes every listing, message and
 * bucket object before it writes - importing it to read this table would wipe
 * the database as a side effect. `sync-listings.ts` needs the same table
 * without the demolition, so the table lives here and both runners import it.
 */
import type {
  ListingCategory,
  ListingTag,
  RoomType,
} from "../src/generated/prisma/enums";
import { campusCategory } from "../src/lib/campus";
import { NTU_AREA_PLACES, type NtuAreaPlace } from "../src/lib/ntu-area-places";

export type SeedListing = {
  placeId: string;
  title: string;
  description: string;
  category: ListingCategory;
  price: number;
  roomType: RoomType;
  tags: ListingTag[];
  provider: { name: string; email: string };
};

/**
 * The address a seeded room stands at, checked against the campus outline.
 *
 * `category` is written by hand in the table below, but every real write path
 * derives it from the point with `campusCategory`, so the two have to agree or
 * the demo data asserts something the app itself would never store. A hall the
 * trace clips off would seed as off-campus with a real commute attached, which
 * is wrong and invisible on the page - so this throws rather than quietly
 * seeding it. Both runners go through here for exactly that reason.
 */
export function resolvePlace(item: SeedListing): NtuAreaPlace {
  const place = NTU_AREA_PLACES.find((p) => p.id === item.placeId);
  if (!place) throw new Error(`Unknown seed place: ${item.placeId}`);

  const derived = campusCategory({ lat: place.lat, lng: place.lng });
  if (derived !== item.category) {
    throw new Error(
      `"${item.title}" is listed as ${item.category} but ${place.address} falls ${derived} of the campus outline`,
    );
  }
  return place;
}

/**
 * Terms for a seeded listing, derived from what the room already says about
 * itself rather than hand-written twenty times over.
 *
 * Every fourth room gets none of them on purpose. "Ask the provider" is a real
 * state - the fields are optional precisely so someone who has not settled a
 * date can still publish - and a demo where every listing is fully specified
 * would never show it.
 */
export function termsFor(item: SeedListing, index: number) {
  if (index % 4 === 3) return {};

  const onCampus = item.category === "ON_CAMPUS";
  const shortLease = item.tags.includes("SHORT_LEASE");

  return {
    // Spread over the coming few months so the demo has rooms free now and
    // rooms free later, which is the whole point of the field.
    availableFrom: new Date(Date.UTC(2026, 8 + (index % 3), 1)),
    minTermMonths: shortLease ? 4 : onCampus ? 5 : 6,
    maxTermMonths: shortLease ? 6 : onCampus ? 10 : 24,
    // A hall sublet is paid to the hall, not to the student subletting it, so
    // there is usually nothing to put down. A landlord always asks.
    deposit: onCampus ? 0 : item.price,
    housemates:
      item.roomType === "WHOLE_UNIT" ? 0 : item.roomType === "SHARED" ? 3 : 2,
  };
}

export const LISTINGS: SeedListing[] = [
  // -------------------------------------------------------------------------
  // On-campus sublets (informal, student-to-student)
  // -------------------------------------------------------------------------
  {
    placeId: "hall-6",
    title: "Hall 6 single room sublet, Aug to Dec",
    description:
      "Going on exchange next semester so subletting my Hall 6 single. Room is on the quieter side of the block, away from the lounge, so you actually get to sleep before 2am. Aircon is the paid-per-tick kind. Comes with the standard hall desk, wardrobe and bed. Shared bathroom down the corridor, cleaned daily. Best for someone who wants to be a 10 minute walk from LT and not deal with buses at 8am.",
    category: "ON_CAMPUS",
    price: 420,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "STUDY_DESK",
      "QUIET",
      "SHORT_LEASE",
      "ANY_GENDER",
      "CLEANING_INCLUDED",
      "NO_SMOKING",
      "ETHERNET_INCLUDED",
    ],
    provider: { name: "Wei Jie Tan", email: "weijie.tan@demo.ntu" },
  },
  {
    placeId: "hall-2",
    title: "Hall 2 double room, one slot open",
    description:
      "Sharing a double in Hall 2. My roommate moved out. I'm in CS year 3, usually out at lab till late, pretty low maintenance. Hall 2 is close to the canteen and the shuttle stop. Social block, there's always something happening, so probably not ideal if you want total silence.",
    category: "ON_CAMPUS",
    price: 310,
    roomType: "SHARED",
    tags: [
      "STUDY_DESK",
      "SHORT_LEASE",
      "MALE_ONLY",
      "NEAR_BUS_STOP",
      "NEAR_FOOD",
      "SOCIAL",
      "ETHERNET_INCLUDED",
    ],
    provider: { name: "Arjun Menon", email: "arjun.menon@demo.ntu" },
  },
  {
    placeId: "banyan-hall",
    title: "Banyan Hall single with ensuite",
    description:
      "Banyan single, ensuite bathroom, aircon included in the fee. Newer block so everything still works. Quiet floor. Female only as it's a female wing.",
    category: "ON_CAMPUS",
    price: 560,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "ENSUITE",
      "FURNISHED",
      "STUDY_DESK",
      "QUIET",
      "FEMALE_ONLY",
      "WATER_HEATER",
      "NO_SMOKING",
    ],
    provider: { name: "Priya Raman", email: "priya.raman@demo.ntu" },
  },
  {
    placeId: "crescent-hall",
    title: "Crescent Hall room, immediate",
    description: "Crescent Hall single. Available now. Msg me.",
    category: "ON_CAMPUS",
    price: 400,
    roomType: "SINGLE",
    tags: ["STUDY_DESK", "ANY_GENDER", "SHORT_LEASE"],
    provider: { name: "Marcus Lee", email: "marcus.lee@demo.ntu" },
  },
  {
    placeId: "graduate-hall-1",
    title: "Graduate Hall studio share, postgrad preferred",
    description:
      "Postgrad studio in Graduate Hall 1. Own study corner, shared pantry with one other person. Quiet by default, most people here are writing theses. Aircon, wifi and utilities all bundled into the hall fee so there's no separate bill to sort out. Happy to do a longer lease through to next June.",
    category: "ON_CAMPUS",
    price: 640,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "WIFI_INCLUDED",
      "UTILITIES_INCLUDED",
      "STUDY_DESK",
      "QUIET",
      "LONG_LEASE",
      "ANY_GENDER",
      "CLEANING_INCLUDED",
      "NO_SMOKING",
      "ETHERNET_INCLUDED",
    ],
    provider: { name: "Nurul Aisyah", email: "nurul.aisyah@demo.ntu" },
  },

  // -------------------------------------------------------------------------
  // Pioneer / Boon Lay
  // -------------------------------------------------------------------------
  {
    placeId: "blk-644-jw81",
    title: "Common room in Pioneer HDB, 2 stops to NTU",
    description:
      "Common room in a 4-room flat at Pioneer. I'm the owner, I live here with my wife, we're out at work most of the day. Room fits a queen bed, has aircon and a study table. Cooking is fine, we just ask you clean up after. Bus 179 from downstairs goes straight into campus, about 15 minutes door to door. No agent fee since you're dealing with me directly.",
    category: "OFF_CAMPUS",
    price: 750,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "FURNISHED",
      "WIFI_INCLUDED",
      "COOKING_ALLOWED",
      "NO_AGENT_FEE",
      "NEAR_MRT",
      "ANY_GENDER",
      "LONG_LEASE",
      "NEAR_BUS_STOP",
      "WATER_HEATER",
    ],
    provider: { name: "Mdm Chua", email: "chua.family@demo.sg" },
  },
  {
    placeId: "blk-651-jw61",
    title: "Cheap shared room Pioneer, students only",
    description:
      "Sharing with 1 other NTU student. Bunk setup. Cheap because it's shared, if you need your own space this is not it. Wifi included. 12 min walk to Pioneer MRT.",
    category: "OFF_CAMPUS",
    price: 450,
    roomType: "SHARED",
    tags: [
      "AIRCON",
      "WIFI_INCLUDED",
      "NEAR_MRT",
      "NO_AGENT_FEE",
      "ANY_GENDER",
      "OWNER_NOT_STAYING",
    ],
    provider: { name: "Daniel Ong", email: "daniel.ong@demo.sg" },
  },
  {
    placeId: "blk-181-boonlay",
    title: "Master bedroom w/ ensuite, Boon Lay",
    description:
      "Master bedroom with attached bathroom in Boon Lay. Fully furnished: queen bed, wardrobe, study desk, aircon. Washing machine in the unit, free to use. Utilities included in the rent, no arguing over the bill at the end of the month. Boon Lay MRT and Jurong Point are a 6 minute walk, so groceries and food are sorted. Prefer someone staying at least a year.",
    category: "OFF_CAMPUS",
    price: 1100,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "ENSUITE",
      "FURNISHED",
      "WIFI_INCLUDED",
      "UTILITIES_INCLUDED",
      "WASHING_MACHINE",
      "STUDY_DESK",
      "NEAR_MRT",
      "LONG_LEASE",
      "ANY_GENDER",
      "WATER_HEATER",
      "NEAR_FOOD",
    ],
    provider: { name: "Kelvin Sim", email: "kelvin.sim@demo.sg" },
  },
  {
    placeId: "blk-221-boonlay",
    title: "Quiet common room, female tenant preferred",
    description:
      "Looking for a female tenant for the common room. I'm a retired teacher, I live alone and I keep things quiet, no parties. You'd have the room and share the kitchen and living room. I do ask for no overnight guests. There's a small cat, so you'd need to be ok with cats. Very peaceful place to study.",
    category: "OFF_CAMPUS",
    price: 680,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "FURNISHED",
      "WIFI_INCLUDED",
      "COOKING_ALLOWED",
      "QUIET",
      "PET_FRIENDLY",
      "FEMALE_ONLY",
      "NO_AGENT_FEE",
      "NO_SMOKING",
    ],
    provider: { name: "Mrs Devi", email: "devi.home@demo.sg" },
  },
  {
    placeId: "lakeside-tower",
    title: "Lakeside condo room, pool and gym",
    description:
      "Room in a condo at Lakeside. Pool, gym, tennis court, the usual condo stuff. Room is furnished with a study desk and aircon. Utilities and wifi included. It's a 20 min bus to NTU or 10 min drive if you have a car. Suits someone who wants a nicer living situation and doesn't mind paying for it.",
    category: "OFF_CAMPUS",
    price: 1250,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "FURNISHED",
      "WIFI_INCLUDED",
      "UTILITIES_INCLUDED",
      "STUDY_DESK",
      "WASHING_MACHINE",
      "NEAR_MRT",
      "ANY_GENDER",
      "LONG_LEASE",
      "GYM_ACCESS",
      "POOL_ACCESS",
      "PARKING",
      "BALCONY",
      "NEAR_BUS_STOP",
    ],
    provider: { name: "Rachel Koh", email: "rachel.koh@demo.sg" },
  },

  // -------------------------------------------------------------------------
  // Jurong West
  // -------------------------------------------------------------------------
  {
    placeId: "blk-419-jw42",
    title: "Common room Jurong West St 42",
    description:
      "Common room available. Aircon, wifi, furnished with bed and desk. Family unit, we have a primary school kid so evenings can be a bit noisy until around 9pm, being upfront about that. Cooking allowed, halal kitchen. No agent fee.",
    category: "OFF_CAMPUS",
    price: 700,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "FURNISHED",
      "WIFI_INCLUDED",
      "COOKING_ALLOWED",
      "NO_AGENT_FEE",
      "STUDY_DESK",
      "ANY_GENDER",
      "HALAL_KITCHEN",
    ],
    provider: { name: "Faizal Rahman", email: "faizal.rahman@demo.sg" },
  },
  {
    placeId: "blk-505-jw52",
    title: "Room for rent JW St 52",
    description: "Room available immediately. Aircon. $650. Call to view.",
    category: "OFF_CAMPUS",
    price: 650,
    roomType: "SINGLE",
    tags: ["AIRCON", "ANY_GENDER"],
    provider: { name: "Mr Tan", email: "tan.rental@demo.sg" },
  },
  {
    placeId: "blk-960-jw81",
    title: "Study-friendly room, 10 min bus to NTU",
    description:
      "I rent out one room in my flat and I specifically look for students. Previous two tenants were both NTU engineering. The room has a proper study desk with a good lamp, and I keep the flat quiet after 10pm because I work early shifts. Aircon, wifi, washing machine. Short lease is fine if you're only here for a semester. Bus 199 to NTU is about 10 minutes.",
    category: "OFF_CAMPUS",
    price: 720,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "FURNISHED",
      "WIFI_INCLUDED",
      "STUDY_DESK",
      "QUIET",
      "WASHING_MACHINE",
      "SHORT_LEASE",
      "NO_AGENT_FEE",
      "ANY_GENDER",
      "NEAR_BUS_STOP",
    ],
    provider: { name: "Serene Yap", email: "serene.yap@demo.sg" },
  },
  {
    placeId: "the-centris",
    title: "The Centris master room above Jurong Point",
    description:
      "Master room at The Centris, literally on top of Jurong Point mall and Boon Lay interchange. Ensuite bathroom, fully furnished, aircon. Everything you need is downstairs. Rent is on the higher side but you're paying for the location. Utilities included.",
    category: "OFF_CAMPUS",
    price: 1350,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "ENSUITE",
      "FURNISHED",
      "WIFI_INCLUDED",
      "UTILITIES_INCLUDED",
      "NEAR_MRT",
      "WASHING_MACHINE",
      "LONG_LEASE",
      "ANY_GENDER",
      "NEAR_BUS_STOP",
      "NEAR_FOOD",
      "GYM_ACCESS",
      "POOL_ACCESS",
    ],
    provider: { name: "Jonathan Ng", email: "jonathan.ng@demo.sg" },
  },
  {
    placeId: "lakeholmz",
    title: "Whole 2-bedroom unit, share with a friend",
    description:
      "Entire 2 bedroom unit at Lakeholmz available. Good if two of you want to move in together and not deal with a landlord in the same house. Furnished, aircon in both rooms, washing machine, full kitchen. Pets are fine. Minimum one year lease.",
    category: "OFF_CAMPUS",
    price: 2400,
    roomType: "WHOLE_UNIT",
    tags: [
      "AIRCON",
      "FURNISHED",
      "COOKING_ALLOWED",
      "WASHING_MACHINE",
      "PET_FRIENDLY",
      "LONG_LEASE",
      "NO_AGENT_FEE",
      "ANY_GENDER",
      "OWNER_NOT_STAYING",
      "VISITORS_ALLOWED",
      "POOL_ACCESS",
      "PARKING",
    ],
    provider: { name: "Adeline Wong", email: "adeline.wong@demo.sg" },
  },

  // -------------------------------------------------------------------------
  // Clementi / Bukit Batok
  // -------------------------------------------------------------------------
  {
    placeId: "blk-322-clementi",
    title: "Clementi common room, direct bus to NTU",
    description:
      "Common room in Clementi. Bus 199 goes direct to NTU, roughly half an hour. Clementi has better food and the MRT is a 5 minute walk. Room is furnished, aircon, wifi included. I'm an easygoing landlord, I don't hover, just pay on time and keep the common areas tidy.",
    category: "OFF_CAMPUS",
    price: 850,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "FURNISHED",
      "WIFI_INCLUDED",
      "NEAR_MRT",
      "COOKING_ALLOWED",
      "NO_AGENT_FEE",
      "ANY_GENDER",
      "VISITORS_ALLOWED",
      "NEAR_BUS_STOP",
      "NEAR_FOOD",
    ],
    provider: { name: "Henry Lim", email: "henry.lim@demo.sg" },
  },
  {
    placeId: "blk-441-clementi",
    title: "Budget shared room Clementi, male only",
    description:
      "Shared room, two single beds, male tenants only. Cheapest option in Clementi you'll find. Aircon runs at night. Wifi included. Cooking allowed.",
    category: "OFF_CAMPUS",
    price: 500,
    roomType: "SHARED",
    tags: [
      "AIRCON",
      "WIFI_INCLUDED",
      "COOKING_ALLOWED",
      "MALE_ONLY",
      "NEAR_MRT",
      "SHORT_LEASE",
    ],
    provider: { name: "Ravi Kumar", email: "ravi.kumar@demo.sg" },
  },
  {
    placeId: "clementi-woods",
    title: "Clementi Woods condo, quiet ensuite",
    description:
      "Ensuite room in a low-density condo near West Coast Park. Extremely quiet, surrounded by greenery, good if you're the sort who needs silence to focus. Furnished, aircon, own bathroom, utilities included. Longer commute to NTU than the Jurong options, be aware of that.",
    category: "OFF_CAMPUS",
    price: 1400,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "ENSUITE",
      "FURNISHED",
      "UTILITIES_INCLUDED",
      "WIFI_INCLUDED",
      "QUIET",
      "STUDY_DESK",
      "LONG_LEASE",
      "ANY_GENDER",
      "POOL_ACCESS",
      "GYM_ACCESS",
      "BALCONY",
      "WATER_HEATER",
    ],
    provider: { name: "Grace Tan", email: "grace.tan@demo.sg" },
  },
  {
    placeId: "blk-155-bb",
    title: "Bukit Batok room, cheap and simple",
    description:
      "No frills room in Bukit Batok. Bed, fan, small wardrobe. There's aircon but it's an old unit and I'd rather you use the fan. Kitchen access. Bus to NTU takes a while, about 35 min, but rent is low.",
    category: "OFF_CAMPUS",
    price: 560,
    roomType: "SINGLE",
    tags: ["COOKING_ALLOWED", "NO_AGENT_FEE", "ANY_GENDER", "SHORT_LEASE"],
    provider: { name: "Uncle Poh", email: "poh.rental@demo.sg" },
  },
  {
    placeId: "chinese-garden-rd",
    title: "Chinese Garden room, pet friendly",
    description:
      "Room in a flat facing Chinese Garden. I have two dogs, so you need to genuinely like dogs, not just tolerate them. Room is furnished with aircon and a desk. Washing machine, cooking allowed, wifi and utilities in the rent. Nice area to run in the mornings.",
    category: "OFF_CAMPUS",
    price: 780,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "FURNISHED",
      "WIFI_INCLUDED",
      "UTILITIES_INCLUDED",
      "PET_FRIENDLY",
      "COOKING_ALLOWED",
      "WASHING_MACHINE",
      "STUDY_DESK",
      "ANY_GENDER",
    ],
    provider: { name: "Melissa Chin", email: "melissa.chin@demo.sg" },
  },

  // ---------------------------------------------------------------------------
  // More halls. The first five on-campus rooms were all quiet singles, which
  // made "on campus" read as one kind of room - these are the loud block, the
  // fan-only block and the shared bed that hall life actually also is.
  // ---------------------------------------------------------------------------
  {
    placeId: "hall-9",
    title: "Hall 9 single, free from January",
    description:
      "Off on internship next semester so my Hall 9 single is free from January. Hall 9 is one of the louder halls, there's almost always something on in the lounge and supper runs happen at midnight, which I loved and you might not. Standard hall furniture, desk with a LAN point that is much faster than the wifi. Canteen 9 is downstairs and the campus bus stop is right outside.",
    category: "ON_CAMPUS",
    price: 430,
    roomType: "SINGLE",
    tags: [
      "STUDY_DESK",
      "SOCIAL",
      "ETHERNET_INCLUDED",
      "NEAR_FOOD",
      "NEAR_BUS_STOP",
      "SHORT_LEASE",
      "ANY_GENDER",
    ],
    provider: { name: "Ethan Sim", email: "ethan.sim@demo.ntu" },
  },
  {
    placeId: "hall-11",
    title: "Hall 11 double, taking over my roommate's bed",
    description:
      "My roommate graduated and I would rather pick who moves in than get assigned someone. Two beds, two desks, one wardrobe each, fan only. I am year 2 NBS, out most evenings, and I do not study in the room so you can have it quiet in the day. Female only, it is a female floor. Hall 11 is a five minute walk to the sports hall and the canteen.",
    category: "ON_CAMPUS",
    price: 300,
    roomType: "SHARED",
    tags: [
      "STUDY_DESK",
      "SOCIAL",
      "ETHERNET_INCLUDED",
      "NEAR_FOOD",
      "SHORT_LEASE",
      "FEMALE_ONLY",
    ],
    provider: { name: "Chloe Ng", email: "chloe.ng@demo.ntu" },
  },
  {
    placeId: "tamarind-hall",
    title: "Tamarind Hall single, aircon and own bathroom",
    description:
      "North Hill single with its own bathroom and aircon in the fee. Newest blocks on campus so the water heater actually works and the room is properly sealed. Cleaning covers the common areas weekly. It is a quieter hall than the older ones, most people here keep to themselves in the evenings. Koufu and the supermarket are at the bottom of the hill.",
    category: "ON_CAMPUS",
    price: 590,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "ENSUITE",
      "FURNISHED",
      "STUDY_DESK",
      "WATER_HEATER",
      "CLEANING_INCLUDED",
      "ETHERNET_INCLUDED",
      "NO_SMOKING",
      "QUIET",
      "NEAR_FOOD",
      "ANY_GENDER",
    ],
    provider: { name: "Isabelle Tay", email: "isabelle.tay@demo.ntu" },
  },
  {
    placeId: "saraca-hall",
    title: "Saraca Hall single, whole academic year",
    description:
      "Saraca single, ensuite, aircon. I want someone taking it for the full year rather than one semester, so please only message me if you can commit to that. Quiet floor and I mean it, the people on this corridor are mostly final year and in the library till late. Weekly cleaning of the shared pantry and corridor is included.",
    category: "ON_CAMPUS",
    price: 550,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "ENSUITE",
      "FURNISHED",
      "STUDY_DESK",
      "WATER_HEATER",
      "CLEANING_INCLUDED",
      "QUIET",
      "NO_SMOKING",
      "LONG_LEASE",
      "ANY_GENDER",
    ],
    provider: { name: "Rui Feng Chua", email: "ruifeng.chua@demo.ntu" },
  },
  {
    placeId: "pioneer-hall",
    title: "Pioneer Hall room, cheapest on campus",
    description:
      "Fan room in Pioneer Hall, one of the older blocks. No aircon, the fan is loud, the furniture is scratched and the lift is slow. In exchange it is the cheapest room you will find inside the campus and you can walk to lectures in ten minutes. Very active hall, lots of sports and hall events, the block is not quiet on weekends. Canteen and bus stop are both a minute away.",
    category: "ON_CAMPUS",
    price: 360,
    roomType: "SINGLE",
    tags: [
      "STUDY_DESK",
      "SOCIAL",
      "ETHERNET_INCLUDED",
      "NEAR_FOOD",
      "NEAR_BUS_STOP",
      "SHORT_LEASE",
      "ANY_GENDER",
    ],
    provider: { name: "Haziq Ismail", email: "haziq.ismail@demo.ntu" },
  },

  // ---------------------------------------------------------------------------
  // More off-campus, reaching further out than the original set: a condo by
  // Lakeside MRT, the closest HDB block to campus, and Jurong East for anyone
  // who will trade the commute for the flat.
  // ---------------------------------------------------------------------------
  {
    placeId: "blk-962-jw91",
    title: "Closest block to campus, wired internet in the room",
    description:
      "About as near to NTU as you can live without being inside it, and bus 199 from downstairs goes straight in. The room has a proper desk and there is a LAN cable run to it from the router, the last tenant was an NTU student who gamed and did not trust the wifi. Aircon, washing machine, no smoking anywhere in the flat. I am strict about that and about noise after 11pm. Dealing with me directly, no agent.",
    category: "OFF_CAMPUS",
    price: 800,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "FURNISHED",
      "WIFI_INCLUDED",
      "ETHERNET_INCLUDED",
      "STUDY_DESK",
      "WASHING_MACHINE",
      "QUIET",
      "NO_SMOKING",
      "NEAR_BUS_STOP",
      "NO_AGENT_FEE",
      "ANY_GENDER",
    ],
    provider: { name: "Jia Hui Low", email: "jiahui.low@demo.sg" },
  },
  {
    placeId: "blk-267-boonlay",
    title: "Common room Boon Lay Dr, halal household",
    description:
      "Common room in our flat at Boon Lay Drive. We are a Malay family and the kitchen is halal, so nothing non-halal can be cooked or stored here, please be sure that works for you before asking. Room is furnished with aircon, wardrobe and a table. You are welcome to cook. No smoking in the flat. Bus stop downstairs and Boon Lay MRT is two stops away. No agent, you deal with us.",
    category: "OFF_CAMPUS",
    price: 690,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "FURNISHED",
      "WIFI_INCLUDED",
      "COOKING_ALLOWED",
      "HALAL_KITCHEN",
      "NO_SMOKING",
      "NEAR_BUS_STOP",
      "NEAR_MRT",
      "NO_AGENT_FEE",
      "ANY_GENDER",
    ],
    provider: { name: "Siti Nordin", email: "siti.nordin@demo.sg" },
  },
  {
    placeId: "parc-vista",
    title: "Parc Vista condo room, 5 min walk to Lakeside MRT",
    description:
      "Room in our condo unit at Parc Vista. We rent the whole unit out, so no owner living with you, and the other two rooms are taken by working adults who are out all day. Pool, gym and a carpark lot if you drive. The room opens onto the balcony. Aircon, water heater, wifi and utilities all in the rent. Lakeside MRT is a five minute walk, though getting to NTU from here is a proper journey - you would be picking this for the condo and the MRT, not the commute.",
    category: "OFF_CAMPUS",
    price: 1150,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "FURNISHED",
      "WIFI_INCLUDED",
      "UTILITIES_INCLUDED",
      "WATER_HEATER",
      "BALCONY",
      "POOL_ACCESS",
      "GYM_ACCESS",
      "PARKING",
      "OWNER_NOT_STAYING",
      "NEAR_MRT",
      "LONG_LEASE",
      "ANY_GENDER",
    ],
    provider: { name: "Cheryl Lim", email: "cheryl.lim@demo.sg" },
  },
  {
    placeId: "blk-517-jw52",
    title: "Shared room JW St 52, two NTU students already in",
    description:
      "Bed going in a shared room, the two of us already here are both NTU year 2. Owner does not stay in the flat, it is just students, so nobody is checking what time you come home. We cook together most nights and it does get noisy, this is not the place if you want silence. Aircon, wifi, bus stop and the coffee shop are downstairs. Happy with one semester.",
    category: "OFF_CAMPUS",
    price: 430,
    roomType: "SHARED",
    tags: [
      "AIRCON",
      "WIFI_INCLUDED",
      "COOKING_ALLOWED",
      "SOCIAL",
      "VISITORS_ALLOWED",
      "OWNER_NOT_STAYING",
      "NEAR_BUS_STOP",
      "NEAR_FOOD",
      "SHORT_LEASE",
      "ANY_GENDER",
    ],
    provider: { name: "Karthik Nair", email: "karthik.nair@demo.sg" },
  },
  {
    placeId: "westmere",
    title: "Westmere master room, Jurong East",
    description:
      "Master bedroom with attached bathroom in a Jurong East condo. Be honest with yourself about the commute before you enquire: it is the better part of an hour each way to NTU and that does not get better. What you get for it is a big room, a proper bathroom with a heater, pool and gym downstairs, and a lot more space than a Jurong West common room at this price. Friends staying over is fine. Utilities and wifi included, minimum one year.",
    category: "OFF_CAMPUS",
    price: 1300,
    roomType: "SINGLE",
    tags: [
      "AIRCON",
      "ENSUITE",
      "FURNISHED",
      "WIFI_INCLUDED",
      "UTILITIES_INCLUDED",
      "WATER_HEATER",
      "POOL_ACCESS",
      "GYM_ACCESS",
      "PARKING",
      "VISITORS_ALLOWED",
      "NEAR_MRT",
      "LONG_LEASE",
      "ANY_GENDER",
    ],
    provider: { name: "Alvin Teo", email: "alvin.teo@demo.sg" },
  },
];
