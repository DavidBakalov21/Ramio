import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
  } from '@aws-sdk/client-s3';
  import { randomUUID } from 'node:crypto';
  import { ConfigService } from '@nestjs/config';
  import { Inject, Injectable } from '@nestjs/common';
  import { GetObjectCommand } from '@aws-sdk/client-s3';
  import { Stream } from 'stream';
  @Injectable()
  export class StorageService {
    constructor(
      @Inject('S3Client')
      private readonly s3Client: S3Client,
      private readonly config: ConfigService,
    ) {}
  
    private buildS3Url(bucket: string, key: string): string {
      const region = this.config.get<string>('S3_REGION') ?? 'eu-north-1';
      return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    }
  
    async uploadFile(
      file: Express.Multer.File,
      bucketName: string,
    ): Promise<{ url: string; key: string }> {
      const fileKey = `${randomUUID()}-${file.originalname}`;
  
      try {
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: fileKey,
            Body: file.buffer,
            ContentType: file.mimetype,
          }),
        );
  
        const url = this.buildS3Url(bucketName, fileKey);
        return { url, key: fileKey };
      } catch (error) {
        console.error('Error uploading file:', error);
        throw new Error('Failed to upload file');
      }
    }
    async overwriteFile(
      file: Express.Multer.File,
      bucketName: string,
      fileKey: string,
    ): Promise<{ url: string; key: string }> {
      try {
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: fileKey,
            Body: file.buffer,
            ContentType: file.mimetype,
          }),
        );
  
        const url = this.buildS3Url(bucketName, fileKey);
        return { url, key: fileKey };
      } catch (error) {
        console.error('Error overwriting file:', error);
        throw new Error('Failed to overwrite file');
      }
    }
    async downloadFile(
      key: string,
      bucketName: string,
    ): Promise<{ stream: Stream; contentType: string }> {
      try {
        const getObjectResult = await this.s3Client.send(
          new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
          }),
        );
  
        if (!getObjectResult.Body) {
          throw new Error('File not found or no body returned');
        }
  
        return {
          stream: getObjectResult.Body as Stream,
          contentType: getObjectResult.ContentType || 'application/octet-stream',
        };
      } catch (error) {
        console.error('Error downloading file:', error);
        throw new Error('Failed to download file');
      }
    }
    async deleteFile(key: string, bucketName: string): Promise<void> {
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key,
          }),
        );
        console.log(`File "${key}" deleted successfully`);
      } catch (error) {
        console.error(`Error deleting file "${key}":`, error);
        throw new Error('Failed to delete file');
      }
    }
    async getRandomImageFromBucket(): Promise<string> {
      try {
        const bucketName = this.config.get<string>('S3_BUCKET_BACKGROUND');
        if (!bucketName) {
          throw new Error('Bucket name is not defined in config');
        }
        console.log('Bucket name:', bucketName);
        const listResult = await this.s3Client.send(
          new ListObjectsV2Command({
            Bucket: bucketName,
          }),
        );
  
        if (!listResult.Contents || listResult.Contents.length === 0) {
          throw new Error('No objects found in bucket');
        }
  
        const objectsToChoose = listResult.Contents;
        const randomIndex = Math.floor(Math.random() * objectsToChoose.length);
        const randomObject = objectsToChoose[randomIndex];
  
        if (!randomObject.Key) {
          throw new Error('Randomly selected object has no key');
        }
        return this.buildS3Url(bucketName, randomObject.Key);
      } catch (error) {
        console.error('Error fetching random image:', error);
        throw new Error('Failed to get random image from bucket');
      }
    }
  }
  