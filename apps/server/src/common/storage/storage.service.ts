import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly bucket = process.env.OBJECT_STORAGE_BUCKET!;
  private readonly client = new S3Client({
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
    region: process.env.OBJECT_STORAGE_REGION,
    credentials: {
      accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY!,
      secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY!,
    },
    forcePathStyle: true, // MinIO 필수
  });
  /** presign 전용 클라이언트 — S3 서명에는 호스트가 포함되므로, 브라우저가 접근할 공개 주소로 서명해야
   *  원격(테일스케일 등) 접속에서 미디어 미리보기·업로드가 동작한다. 미설정 시 내부 주소 그대로. */
  private readonly presignClient = process.env.OBJECT_STORAGE_PUBLIC_ENDPOINT
    ? new S3Client({
        endpoint: process.env.OBJECT_STORAGE_PUBLIC_ENDPOINT,
        region: process.env.OBJECT_STORAGE_REGION,
        credentials: {
          accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY!,
          secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY!,
        },
        forcePathStyle: true,
      })
    : this.client;

  async onModuleInit() {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (e: unknown) {
      const name = (e as { name?: string }).name;
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw e;
    }
  }

  presignPut(key: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.presignClient,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: 900 },
    );
  }

  async head(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: res.ContentLength ?? 0 };
    } catch (e: unknown) {
      if ((e as { name?: string }).name === 'NotFound') return null;
      throw e;
    }
  }

  async getBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async putBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  presignGet(key: string): Promise<string> {
    return getSignedUrl(this.presignClient, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: 900,
    });
  }
}
