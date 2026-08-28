import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  otpTtlSeconds: parseInt(process.env.AUTH_OTP_TTL ?? '600', 10),
  tempFinishTtlSeconds: parseInt(
    process.env.AUTH_TEMP_FINISH_TTL ?? '86400',
    10,
  ),
}));
