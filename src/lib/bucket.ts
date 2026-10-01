import "server-only";

import { AwsClient } from "aws4fetch";

/** Private Neon Object Storage bucket holding catalogue images (synced by nat_ingest.upload). */
const BUCKET = "nat-media";

let client: AwsClient | null = null;

function aws() {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_ENDPOINT_URL_S3 } = process.env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_ENDPOINT_URL_S3) return null;
  client ??= new AwsClient({ accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY, region: AWS_REGION, service: "s3" });
  return client;
}

/** Signed GET of one object (path-style URL, as Neon requires). Null when storage isn't configured. */
export async function getObject(key: string) {
  const c = aws();
  if (!c) return null;
  const url = `${process.env.AWS_ENDPOINT_URL_S3!.replace(/\/+$/, "")}/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
  return c.fetch(url, { method: "GET" });
}
