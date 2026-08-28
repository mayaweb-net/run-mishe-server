import { registerAs } from '@nestjs/config';

export default registerAs('kavenegar', () => ({
  apiKey: process.env.KAVENEGAR_API_KEY ?? '',
  otpTemplate: process.env.KAVENEGAR_OTP_TEMPLATE ?? 'passlogin-dastres',
}));
