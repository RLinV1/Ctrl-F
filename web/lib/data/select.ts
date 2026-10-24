/** Which store to run: DATA_SOURCE=mock for the in-memory mock (no bucket, Pi or desktop), anything else for the S3 store. */
export type DataSource = "mock" | "s3";

export function dataSource(env: Record<string, string | undefined> = process.env): DataSource {
  return env.DATA_SOURCE?.trim().toLowerCase() === "mock" ? "mock" : "s3";
}
