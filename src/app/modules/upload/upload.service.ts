import { Inject, Injectable } from '@nestjs/common';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from './storage/storage.provider';

@Injectable()
export class UploadService {
  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
  ) {}

  upload(buffer: Buffer, path: string, contentType?: string) {
    return this.storage.upload(buffer, path, contentType);
  }

  delete(path: string) {
    return this.storage.delete(path);
  }

  exists(path: string) {
    return this.storage.exists(path);
  }

  read(path: string) {
    return this.storage.read(path);
  }

  url(path: string) {
    return this.storage.url(path);
  }
}
