import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function s3Config() {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION || "us-east-1";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, ""),
    client: new S3Client({
      region,
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      credentials: { accessKeyId, secretAccessKey }
    })
  };
}

export function hasS3AssetStore() {
  return Boolean(s3Config());
}

export async function uploadSvgAsset(key: string, svg: string) {
  const config = s3Config();
  if (!config) return null;
  await config.client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: svg,
    ContentType: "image/svg+xml; charset=utf-8",
    CacheControl: "public, max-age=31536000, immutable"
  }));
  if (config.publicBaseUrl) return `${config.publicBaseUrl}/${key}`;
  return `https://${config.bucket}.s3.amazonaws.com/${key}`;
}
