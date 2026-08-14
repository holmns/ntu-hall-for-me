/**
 * Brings a database up to date with `seed-listings.ts` without deleting
 * anything.
 *
 *   npm run db:sync
 *
 * `db:seed` is the other way to do this and it starts by dropping every
 * listing, every message and every object in the bucket. That is right for a
 * fresh clone and wrong for a database someone has been using: adding a tag or
 * a room to the table should not cost the demo its chat threads and shortlists.
 * So this runner only ever adds and amends.
 *
 *   - a room in the table with no row yet is created, exactly as the seed would
 *     create it, down to which photos it gets
 *   - a room that already has a row gets its title, description, price, room
 *     type and category brought in line with the table, and gains any tags the
 *     table lists and it does not
 *   - no row is ever deleted, and neither are photos
 *
 * Rows are matched on the seeded provider *and* the address, never the title,
 * so the table stays free to correct a room's own name. What it cannot correct
 * is where the room is: the address is the key, and the commute columns are
 * computed once at creation from it. Moving a place in the address book is
 * therefore a re-seed job, not a sync.
 *
 * Anything a real provider posted is invisible to this: their listings belong
 * to their own user row, which is never one of the seeded demo providers. The
 * flip side is that hand edits made to a *demo* listing through the app are
 * overwritten the next time this runs, because for those rooms the table is the
 * source of truth.
 *
 * Only rows it actually changed are re-embedded. Every field it syncs is part
 * of `listingEmbeddingText`, so a changed row has a stale vector by definition;
 * rows it left alone keep the vector they had.
 *
 * Safe to re-run. A second run reports nothing changed and embeds nothing.
 */
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ListingTag } from "../src/generated/prisma/enums";
import { computeCommute } from "../src/lib/maps";
import {
  embedTexts,
  listingEmbeddingText,
  storeListingEmbeddings,
} from "../src/lib/embeddings";
import { createPhotoPicker } from "./mock-room-photos";
import { attachPhoto } from "./seed-photos";
import { LISTINGS, resolvePlace, termsFor } from "./seed-listings";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  // Walked for every listing, existing or not, and only *used* for the ones
  // being created. The picker is a cursor through each photo pool, so skipping
  // the rooms that already have photos would hand the new ones the covers the
  // old ones are already using. Advancing it in table order means a room gets
  // the same photos here as it would from a full re-seed.
  const pickPhotos = createPhotoPicker();

  const embedInputs: { id: string; text: string }[] = [];
  let created = 0;
  let updated = 0;
  let photoCount = 0;

  console.log(`Syncing ${LISTINGS.length} listings...`);

  for (const [index, item] of LISTINGS.entries()) {
    const place = resolvePlace(item);
    const photos = pickPhotos(item);

    const provider = await prisma.user.upsert({
      where: { email: item.provider.email },
      update: {},
      create: {
        name: item.provider.name,
        email: item.provider.email,
        role: "PROVIDER",
      },
    });

    const existing = await prisma.listing.findFirst({
      where: { providerId: provider.id, address: place.address },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        roomType: true,
        category: true,
        tags: true,
      },
    });

    if (existing) {
      const tags = existing.tags as ListingTag[];
      // Union, not replace. The table says what a room offers; it does not know
      // about anything added by hand since, and a sync is no reason to drop it.
      const gained = item.tags.filter((tag) => !tags.includes(tag));
      const merged = [...tags, ...gained];

      const changes: string[] = [];
      if (existing.title !== item.title) changes.push("title");
      if (existing.description !== item.description) changes.push("description");
      if (existing.price !== item.price) changes.push("price");
      if (existing.roomType !== item.roomType) changes.push("room type");
      if (existing.category !== item.category) changes.push("category");
      if (gained.length > 0) changes.push(gained.join(", "));
      if (changes.length === 0) continue;

      await prisma.listing.update({
        where: { id: existing.id },
        data: {
          title: item.title,
          description: item.description,
          price: item.price,
          roomType: item.roomType,
          category: item.category,
          tags: merged,
        },
      });
      embedInputs.push({
        id: existing.id,
        text: listingEmbeddingText({ ...item, tags: merged }),
      });
      updated += 1;
      console.log(`  ~ ${item.title}: ${changes.join(", ")}`);
      continue;
    }

    // Real Distance Matrix call, same code path as the provider form and the
    // seed, so GOOGLE_MAPS_API_KEY must be set. Only new rows pay for it - an
    // existing room's commute is already stored and its address cannot change
    // here, which is what makes that safe.
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

    const results = await Promise.all(
      photos.map((photo, position) =>
        attachPhoto(prisma, listing.id, photo, position),
      ),
    );
    photoCount += results.filter(Boolean).length;
    created += 1;
    console.log(`  * ${item.title}`);
  }

  if (embedInputs.length > 0) {
    console.log(`Embedding ${embedInputs.length} changed listings...`);
    const vectors = await embedTexts(embedInputs.map((input) => input.text));
    await storeListingEmbeddings(
      embedInputs.map((input, index) => ({
        id: input.id,
        vector: vectors[index],
      })),
    );
  }

  const total = await prisma.listing.count();
  console.log(
    `Done. ${created} created (${photoCount} photos), ${updated} updated, ${total} listings in total.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
