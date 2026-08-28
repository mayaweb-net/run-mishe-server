import appConfig from './app.config';
import authConfig from './auth.config';
import databaseConfig from './database.config';
import jwtConfig from './jwt.config';
import kavenegarConfig from './kavenegar.config';
import redisConfig from './redis.config';

export const configLoaders = [
  appConfig,
  databaseConfig,
  authConfig,
  jwtConfig,
  redisConfig,
  kavenegarConfig,
];
