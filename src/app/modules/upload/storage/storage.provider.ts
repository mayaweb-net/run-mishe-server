export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StorageProvider {
  upload(buffer: Buffer, path: string, contentType?: string): Promise<string>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<Buffer>;
  url(path: string): string;
  ensureReady(): Promise<void>;
}
