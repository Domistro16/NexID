import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuid } from 'uuid';
import { config, isS3Configured } from '../config';

/**
 * Storage service for S3/Cloudflare R2 video storage
 * Handles upload, deletion, and signed URL generation for private videos
 */
export class StorageService {
    private s3: S3Client | null = null;
    private bucket: string;

    constructor() {
        this.bucket = config.s3Bucket;

        if (isS3Configured()) {
            this.s3 = new S3Client({
                region: config.s3Region,
                endpoint: config.s3Endpoint,
                credentials: {
                    accessKeyId: config.s3AccessKey!,
                    secretAccessKey: config.s3SecretKey!,
                },
                // For Cloudflare R2 compatibility
                forcePathStyle: true,
            });
        }
    }

    /**
     * Check if storage is configured and available
     */
    isAvailable(): boolean {
        return this.s3 !== null;
    }

    /**
     * Upload a video file to S3/R2
     * @param courseId - The course ID
     * @param file - The file buffer
     * @param filename - Original filename (used for extension)
     * @param contentType - MIME type of the video
     * @returns The storage key for the uploaded file
     */
    async uploadVideo(
        courseId: number,
        file: Buffer,
        filename: string,
        contentType?: string
    ): Promise<string> {
        if (!this.s3) {
            throw new Error('S3 storage is not configured');
        }

        const ext = filename.split('.').pop() || 'mp4';
        const key = `videos/course_${courseId}/${uuid()}.${ext}`;

        await this.s3.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: file,
            ContentType: contentType || `video/${ext}`,
        }));

        return key;
    }

    /**
     * Delete a video from S3/R2
     * @param key - The storage key of the file to delete
     */
    async deleteVideo(key: string): Promise<void> {
        if (!this.s3) {
            throw new Error('S3 storage is not configured');
        }

        await this.s3.send(new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
    }

    /**
     * Generate a signed URL for video streaming
     * @param key - The storage key of the video
     * @param expiresIn - URL expiration time in seconds (default: 2 hours)
     * @returns Signed URL for accessing the video
     */
    async getSignedVideoUrl(key: string, expiresIn = 7200): Promise<string> {
        if (!this.s3) {
            throw new Error('S3 storage is not configured');
        }

        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        return getSignedUrl(this.s3, command, { expiresIn });
    }

    /**
     * Check if a video exists in storage
     * @param key - The storage key to check
     */
    async videoExists(key: string): Promise<boolean> {
        if (!this.s3) {
            return false;
        }

        try {
            await this.s3.send(new HeadObjectCommand({
                Bucket: this.bucket,
                Key: key,
            }));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get video metadata (size, content type, etc.)
     * @param key - The storage key
     */
    async getVideoMetadata(key: string): Promise<{ contentLength?: number; contentType?: string } | null> {
        if (!this.s3) {
            return null;
        }

        try {
            const response = await this.s3.send(new HeadObjectCommand({
                Bucket: this.bucket,
                Key: key,
            }));

            return {
                contentLength: response.ContentLength,
                contentType: response.ContentType,
            };
        } catch {
            return null;
        }
    }
}

// Singleton instance
let storageServiceInstance: StorageService | null = null;

export function getStorageService(): StorageService {
    if (!storageServiceInstance) {
        storageServiceInstance = new StorageService();
    }
    return storageServiceInstance;
}
