import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeCommute } from "../src/lib/maps";
import {
  embedTexts,
  listingEmbeddingText,
  storeListingEmbeddings,
} from "../src/lib/embeddings";
import { clearListingImages } from "../src/lib/storage";
import { createPhotoPicker } from "./mock-room-photos";
import { attachPhoto } from "./seed-photos";
import { LISTINGS, resolvePlace, termsFor } from "./seed-listings";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

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

  for (const [index, item] of LISTINGS.entries()) {
    const place = resolvePlace(item);

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
        ...termsFor(item, index),
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
      photos.map((photo, index) => attachPhoto(prisma, listing.id, photo, index)),
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
