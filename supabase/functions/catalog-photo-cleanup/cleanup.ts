type PhotoBucket = {
  list: (
    prefix: string,
    options: { limit: number; offset: number },
  ) => Promise<{ data: { name: string }[] | null; error: unknown }>;
  remove: (paths: string[]) => Promise<{ error: unknown }>;
};
type CleanupJob = { restaurant_id: string; paths: string[] };

export async function cleanupPhotoJob(bucket: PhotoBucket, job: CleanupJob) {
  const prefix = `${job.restaurant_id}/`;
  const validPath = (path: string) =>
    path.startsWith(prefix) &&
    path
      .split("/")
      .every(
        (part) => part && part !== "." && part !== ".." && !part.includes("\\"),
      );
  if (job.paths.some((path) => !validPath(path)))
    throw new Error("invalid_cleanup_path");
  const paths = new Set(job.paths);
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(job.restaurant_id, {
      limit: 100,
      offset,
    });
    if (error) throw error;
    for (const file of data ?? []) paths.add(`${prefix}${file.name}`);
    if ((data?.length ?? 0) < 100) break;
  }
  const allPaths = [...paths];
  if (allPaths.some((path) => !validPath(path)))
    throw new Error("invalid_cleanup_path");
  for (let i = 0; i < allPaths.length; i += 100) {
    const { error } = await bucket.remove(allPaths.slice(i, i + 100));
    if (error) throw error;
  }
}
