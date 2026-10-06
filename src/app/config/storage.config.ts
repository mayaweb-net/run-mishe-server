import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:19000',
  region: process.env.S3_REGION ?? 'us-east-1',
  accessKey: process.env.S3_ACCESS_KEY ?? 'run-mishe',
  secretKey: process.env.S3_SECRET_KEY ?? 'run-mishe-s3-secret',
  bucket: process.env.S3_BUCKET ?? 'run-mishe',
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
  publicBasePath: process.env.STORAGE_PUBLIC_BASE_PATH ?? '/api/files',
}));
