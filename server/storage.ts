import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = process.env.S3_BUCKET || "music21-private";
const client = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  credentials: process.env.S3_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
      }
    : undefined,
});
const signingClient = process.env.S3_PUBLIC_ENDPOINT
  ? new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_PUBLIC_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      credentials: process.env.S3_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
          }
        : undefined,
    })
  : client;

export async function createUploadUrl(
  key: string,
  contentType: string,
  size: number,
): Promise<string> {
  return getSignedUrl(
    signingClient,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    { expiresIn: 600 },
  );
}

export async function headObject(key: string) {
  return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
}

export async function readObject(key: string): Promise<Uint8Array> {
  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  return result.Body!.transformToByteArray();
}

export async function putJson(key: string, value: unknown): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(value),
      ContentType: "application/json",
      CacheControl: "private, max-age=60",
    }),
  );
}

export async function deleteObject(key?: string | null): Promise<void> {
  if (key)
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
