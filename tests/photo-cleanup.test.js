import test from "node:test";
import assert from "node:assert/strict";
import { cleanupPhotoJob } from "../supabase/functions/catalog-photo-cleanup/cleanup.ts";

test("cleanup discovers all files, de-duplicates paths and deletes in bounded batches", async () => {
  const removed = [];
  const listed = [];
  const bucket = {
    async list(prefix, options) {
      listed.push(options.offset);
      assert.equal(prefix, "restaurant");
      return {
        data: Array.from(
          { length: options.offset === 0 ? 100 : 5 },
          (_, i) => ({ name: `${i + options.offset}.jpg` }),
        ),
        error: null,
      };
    },
    async remove(paths) {
      removed.push(paths);
      return { error: null };
    },
  };
  await cleanupPhotoJob(bucket, {
    restaurant_id: "restaurant",
    paths: ["restaurant/0.jpg", "restaurant/missing.jpg"],
  });
  assert.deepEqual(listed, [0, 100]);
  assert.equal(removed.length, 2);
  assert.equal(new Set(removed.flat()).size, 106);
  assert.ok(removed.every((batch) => batch.length <= 100));
});

test("cleanup refuses paths in another restaurant namespace", async () => {
  await assert.rejects(
    cleanupPhotoJob(
      {
        list() {
          throw new Error("must not list");
        },
      },
      { restaurant_id: "one", paths: ["two/photo.jpg"] },
    ),
    /invalid_cleanup_path/,
  );
  await assert.rejects(
    cleanupPhotoJob(
      {
        list() {
          throw new Error("must not list");
        },
      },
      { restaurant_id: "one", paths: ["one/../two/photo.jpg"] },
    ),
    /invalid_cleanup_path/,
  );
});

test("storage failures propagate so the worker leaves the durable job for retry", async () => {
  let attempted = 0;
  const job = { restaurant_id: "one", paths: ["one/photo.jpg"] };
  const bucket = {
    async list() {
      return { data: [], error: null };
    },
    async remove() {
      attempted++;
      return { error: attempted === 1 ? new Error("temporary outage") : null };
    },
  };
  await assert.rejects(cleanupPhotoJob(bucket, job), /temporary outage/);
  await cleanupPhotoJob(bucket, job);
  assert.equal(attempted, 2);
});
