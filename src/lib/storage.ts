import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { IMAGE_EXTENSION, type AcceptedImageType } from "./images";

/**
 * Supabase Storage write path for listing photos.
 *
 * Uploads go through the server, never straight from the browser. Auth here is
 * NextAuth, so `auth.uid()` inside a storage RLS policy is always null and an
 * ownership policy could never pass. The bucket is public for reads and the
 * service role key does the writes, which means the only thing standing
 * between a caller and the bucket is the authorisation in `createListing`.
 *
 * There is no `server-only` package in this project (see `maps.ts`), so this
 * guard is what keeps the service role key out of a client bundle.
 */
if (typeof window !== "undefined") {
  throw new Error("src/lib/storage.ts must not be imported from the browser");
}

export const LISTING_IMAGE_BUCKET = "listing-images";

/** A year. Object paths carry a uuid, so a file at a path never changes. */
const CACHE_CONTROL = "31536000";

let cachedClient: SupabaseClient | null = null;

function credentials(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

/**
 * Whether photo uploads are available. Follows the same rule as the Maps and
 * OpenRouter keys: without credentials the feature disappears from the UI
 * rather than breaking the page.
 */
export function hasImageStorage(): boolean {
  return credentials() !== null;
}

function admin(): SupabaseClient {
  const creds = credentials();
  if (!creds) {
    throw new Error("Supabase storage is not configured");
  }
  cachedClient ??= createClient(creds.url, creds.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export type StoredImage = { url: string; storagePath: string };

/**
 * Uploads one photo and returns its public URL.
 *
 * The listing id is the first path segment on purpose: storage RLS policies
 * match on `(storage.foldername(name))[1]`, so ownership rules stay possible
 * if this ever moves to direct browser uploads.
 */
export async function uploadListingImage(
  listingId: string,
  bytes: Uint8Array,
  mimeType: AcceptedImageType,
): Promise<StoredImage> {
  const path = `${listingId}/${crypto.randomUUID()}.${IMAGE_EXTENSION[mimeType]}`;

  const { error } = await admin()
    .storage.from(LISTING_IMAGE_BUCKET)
    .upload(path, bytes, {
      contentType: mimeType,
      cacheControl: CACHE_CONTROL,
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload failed for ${path}: ${error.message}`);
  }

  const { data } = admin()
    .storage.from(LISTING_IMAGE_BUCKET)
    .getPublicUrl(path);

  return { url: data.publicUrl, storagePath: path };
}

/**
 * Best-effort cleanup, used to roll back a half-finished post. A leftover
 * object is only wasted bytes, so a failure here must not mask the real error
 * that triggered the rollback.
 */
export async function removeListingImages(paths: string[]): Promise<void> {
  if (paths.length === 0 || !hasImageStorage()) return;
  try {
    await admin().storage.from(LISTING_IMAGE_BUCKET).remove(paths);
  } catch (error) {
    console.error("[storage] failed to clean up uploaded images:", error);
  }
}

/**
 * Empties the bucket. Only for `db:seed`, which deletes every listing row and
 * would otherwise leave their objects behind on each re-seed.
 */
export async function clearListingImages(): Promise<number> {
  if (!hasImageStorage()) return 0;
  const client = admin();
  let removed = 0;

  // Objects are stored under `<listingId>/`, so the top level lists folders.
  const { data: folders, error } = await client.storage
    .from(LISTING_IMAGE_BUCKET)
    .list("", { limit: 1000 });
  if (error) {
    console.error("[storage] could not list the bucket:", error.message);
    return 0;
  }

  for (const folder of folders ?? []) {
    const { data: files } = await client.storage
      .from(LISTING_IMAGE_BUCKET)
      .list(folder.name, { limit: 1000 });
    const paths = (files ?? []).map((file) => `${folder.name}/${file.name}`);
    if (paths.length === 0) continue;
    await client.storage.from(LISTING_IMAGE_BUCKET).remove(paths);
    removed += paths.length;
  }

  return removed;
}
