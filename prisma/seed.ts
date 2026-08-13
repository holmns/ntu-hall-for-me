import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type {
  ListingCategory,
  ListingTag,
  RoomType,
} from "../src/generated/prisma/enums";
import { computeCommute } from "../src/lib/maps";
import {
  embedTexts,
  listingEmbeddingText,
  storeListingEmbeddings,
} from "../src/lib/embeddings";
import { NTU_AREA_PLACES } from "../src/lib/ntu-area-places";
import { sniffImageType } from "../src/lib/images";
import { clearListingImages, uploadListingImage } from "../src/lib/storage";
import {
  createPhotoPicker,
  photoUrl,
  PHOTO_HEIGHT,
  PHOTO_WIDTH,
  type MockPhoto,
} from "./mock-room-photos";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type SeedListing = {
  placeId: string;
  title: string;
  description: string;
  category: ListingCategory;
  price: number;
  roomType: RoomType;
  tags: ListingTag[];
  provider: { name: string; email: string };
};

const LISTINGS: SeedListing[] = [
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
    tags: ["AIRCON", "STUDY_DESK", "QUIET", "SHORT_LEASE", "ANY_GENDER"],
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
    tags: ["STUDY_DESK", "SHORT_LEASE", "MALE_ONLY"],
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
    tags: ["AIRCON", "WIFI_INCLUDED", "NEAR_MRT", "NO_AGENT_FEE", "ANY_GENDER"],
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
];

/**
 * Downloads a photo and puts it in the listing-images bucket, so the seeded
 * rows go through exactly the same storage path as a provider upload.
 *
 * Returns null instead of throwing: a demo database with no photos is a much
 * better outcome than a seed that dies because the network was down.
 */
async function attachPhoto(
  listingId: string,
  photo: MockPhoto,
  position: number,
): Promise<boolean> {
  try {
    const response = await fetch(photoUrl(photo));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    const mimeType = sniffImageType(bytes);
    if (!mimeType) throw new Error("not a recognised image");

    const stored = await uploadListingImage(listingId, bytes, mimeType);
    await prisma.listingImage.create({
      data: {
        listingId,
        url: stored.url,
        storagePath: stored.storagePath,
        mimeType,
        width: PHOTO_WIDTH,
        height: PHOTO_HEIGHT,
        alt: photo.alt,
        position,
      },
    });
    return true;
  } catch (error) {
    console.warn(`  ! photo ${photo.id} skipped:`, (error as Error).message);
    return false;
  }
}

async function main() {
  console.log("Clearing existing demo data...");
  await prisma.message.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: "@demo." } } });

  // Listing rows are gone, so their objects in the bucket are orphans now.
  const removed = await clearListingImages();
  if (removed > 0) console.log(`Removed ${removed} orphaned images.`);
  const pickPhotos = createPhotoPicker();
  let photoCount = 0;
  const embedInputs: { id: string; text: string }[] = [];

  console.log(`Seeding ${LISTINGS.length} listings...`);

  for (const item of LISTINGS) {
    const place = NTU_AREA_PLACES.find((p) => p.id === item.placeId);
    if (!place) throw new Error(`Unknown seed place: ${item.placeId}`);

    const provider = await prisma.user.upsert({
      where: { email: item.provider.email },
      update: {},
      create: {
        name: item.provider.name,
        email: item.provider.email,
        role: "PROVIDER",
      },
    });

    // Real Distance Matrix call, same code path as the provider form, so
    // GOOGLE_MAPS_API_KEY must be set before seeding.
    const commute = await computeCommute(
      { lat: place.lat, lng: place.lng },
      item.category,
    );
    const listing = await prisma.listing.create({
      data: {
        providerId: provider.id,
        title: item.title,
        description: item.description,
        category: item.category,
        price: item.price,
        roomType: item.roomType,
        tags: item.tags,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        distanceMeters: commute.distanceMeters,
        distanceWalkingMin: commute.walkingMin,
        distanceTransitMin: commute.transitMin,
        distanceDrivingMin: commute.drivingMin,
      },
      select: { id: true },
    });

    embedInputs.push({ id: listing.id, text: listingEmbeddingText(item) });

    const photos = pickPhotos(item);
    const results = await Promise.all(
      photos.map((photo, index) => attachPhoto(listing.id, photo, index)),
    );
    photoCount += results.filter(Boolean).length;
  }

  // One batched call rather than one per listing. Seeded rows must be embedded
  // the same way posted ones are, or search would rank the demo data below
  // anything a provider adds by hand.
  console.log(`Embedding ${embedInputs.length} listings...`);
  const vectors = await embedTexts(embedInputs.map((input) => input.text));
  await storeListingEmbeddings(
    embedInputs.map((input, index) => ({ id: input.id, vector: vectors[index] })),
  );

  // A demo seeker so the chat thread has a plausible counterparty.
  await prisma.user.upsert({
    where: { email: "seeker@demo.ntu" },
    update: {},
    create: {
      name: "Demo Seeker",
      email: "seeker@demo.ntu",
      role: "SEEKER",
    },
  });

  const count = await prisma.listing.count();
  console.log(`Done. ${count} listings and ${photoCount} photos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
