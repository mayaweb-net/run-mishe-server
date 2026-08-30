# Run Mishe — مستندات فنی

این پوشه مرجع تصمیم‌های معماری دیتا و الگوریتم‌های محاسباتی پروژه است.
هر وقت روی این پروژه کار می‌کنی (یا به یک ایجنت رفرنس می‌دهی)، **اول این فایل را بخوان**.

## پروژه چیست

سه محصول روی یک هسته مشترک:

| محصول | مسیر کلاینت | ورودی | خروجی |
| --- | --- | --- | --- |
| ران میشه؟ | `/review` | بازی + CPU + GPU + RAM | اجرا می‌شود / نمی‌شود + مقایسه با min/recommended |
| محاسبه‌گر FPS | `/fps` | بازی + CPU + GPU + RAM + رزولوشن + پریست | FPS متوسط + 1% low |
| بررسی گلوگاه | (هنوز ساخته نشده) | CPU + GPU (+ بازی اختیاری) | درصد گلوگاه و اینکه کدام قطعه محدودکننده است |

هر سه از یک موتور تخمین واحد تغذیه می‌شوند. تفاوتشان فقط در نحوه‌ی نمایش خروجی است.

## فهرست مستندات

| فایل | محتوا |
| --- | --- |
| [`data-model.md`](./data-model.md) | هر مدل Prisma چیست، چرا هست، چه فیلدی را دستی نباید نوشت، SQL هایی که باید دستی به migration اضافه شوند |
| [`estimation.md`](./estimation.md) | فرمول محاسبه‌ی index، فرمول FPS، فرمول گلوگاه، الگوریتم کالیبراسیون، مقادیر پیش‌فرض cold-start |
| [`data-sources.md`](./data-sources.md) | دیتا از کجا می‌آید، پایپلاین ingestion، قوانین نرمال‌سازی نام و matching |
| [`roadmap.md`](./roadmap.md) | فازبندی اجرا، تعریف «تمام‌شده» برای هر فاز، طرح اولیه API |

## معماری دیتا: چهار لایه

```
لایه ۱ — Catalog      Cpu, Gpu, Game, GameRequirement
                      حقایق ثابت، از منابع بیرونی می‌آیند

لایه ۲ — Evidence     Benchmark, CpuBenchmarkScore, GpuBenchmarkScore, FpsSample
                      اندازه‌گیری، همیشه همراه با منبع، تاریخ و درجه‌ی اطمینان

لایه ۳ — Derived      Cpu.gamingIndex, Gpu.gamingIndex, GameProfile, GameScaling
                      محاسبه‌شده توسط job، هیچ‌وقت دستی نوشته نمی‌شود

لایه ۴ — Application  UserBuild, CheckSnapshot, FpsSubmission
                      چیزی که کاربر می‌سازد
```

**قانون شماره ۱:** لایه ۳ باید همیشه از لایه ۱ و ۲ قابل بازتولید کامل باشد. اگر روزی مجبور شدی
`TRUNCATE game_profiles` بزنی، یک اجرای دوباره‌ی job باید همه‌چیز را برگرداند. این تنها چیزی است که
اجازه می‌دهد فرمول‌ها را بدون ترس عوض کنی.

**قانون شماره ۲:** هیچ importer ای مستقیم روی جدول canonical نمی‌نویسد. مسیر همیشه
`ImportBatch` → `ImportRecord` → normalize → upsert است.

**قانون شماره ۳:** `rawPayload` و `rawCpuText`/`rawGpuText` هرگز پاک نمی‌شوند. parser بارها بازنویسی
خواهد شد و باید چیزی برای re-parse داشته باشد.

## فهرست مدل‌ها

مسیر: `src/app/db/prisma/models/`

| فایل | مدل‌ها |
| --- | --- |
| `enums.prisma` | `HardwareKind` `Vendor` `FormFactor` `QualityPreset` `ScreenResolution` `Upscaler` `RequirementTier` `DemandTier` `DataQuality` `ImportStatus` `ImportRecordStatus` `ModerationStatus` `CheckKind` |
| `hardware.prisma` | `Cpu` `Gpu` `HardwareAlias` |
| `benchmark.prisma` | `Benchmark` `CpuBenchmarkScore` `GpuBenchmarkScore` |
| `game.prisma` | `Game` `GameRequirement` `GameRequirementOption` |
| `estimation.prisma` | `FpsSample` `FpsSubmission` `GameProfile` `GameScaling` `DefaultScaling` |
| `app.prisma` | `UserBuild` `CheckSnapshot` |
| `ingest.prisma` | `ImportBatch` `ImportRecord` |
| `user.prisma` | `User` |

## سه تصمیم کلیدی که این طراحی را شکل داده

**۱. همه‌چیز به یک عدد خلاصه می‌شود.**
موتور تخمین هیچ‌وقت `cudaCores` یا `baseClock` نمی‌بیند. فقط `Gpu.gamingIndex` و `Cpu.gamingIndex`
(هر دو ۰ تا ۱۰۰) را مصرف می‌کند. بقیه‌ی فیلدهای مشخصات فقط برای نمایش و فیلتر هستند. این یعنی
اضافه‌کردن یک بنچمارک جدید، کل سیستم را بهتر می‌کند بدون اینکه یک خط از استیمیتور عوض شود.

**۲. بدون دیتای واقعی FPS، هیچ فرمولی دقیق نیست.**
`FpsSample` قلب پروژه است. فرمول‌ها فقط شکل منحنی را تعیین می‌کنند؛ ضرایب از روی اندازه‌گیری واقعی
fit می‌شوند. جدول `GameProfile` خروجی همان fit است.

**۳. سقف CPU مستقل از رزولوشن است.**
`fpsCpu` هیچ ضریب رزولوشنی نمی‌گیرد ولی `fpsGpu` می‌گیرد. همین یک عدم‌تقارن، هم رفتار واقعی
سخت‌افزار را بازتولید می‌کند و هم محاسبه‌گر گلوگاه را مجانی به شما می‌دهد.

## خلاصه‌ی فرمول (جزئیات در `estimation.md`)

```
fpsGpu = profile.gpuCoef × gpuIndex ^ profile.gpuExponent × scaling(res, preset, upscaler, rt)
fpsCpu = profile.cpuCoef × cpuIndex ^ profile.cpuExponent × cpuPresetFactor(preset)

fps    = (fpsGpu ^ -k + fpsCpu ^ -k) ^ (-1/k)        // k = profile.blendK ≈ 8
fps   ×= vramPenalty × ramPenalty

bottleneckPercent = (max(fpsGpu, fpsCpu) − min(fpsGpu, fpsCpu)) / max(fpsGpu, fpsCpu) × 100
limitingComponent = fpsCpu < fpsGpu ? "CPU" : "GPU"
```

## وضعیت فعلی

- [x] اسکیما نوشته و با `prisma validate` تأیید شده
- [x] مسیر seed در `prisma.config.ts` اصلاح شد
- [x] کاتالوگ سخت‌افزار: ۲۵۰ GPU و ۲۵۰ CPU، seed شده و روی Postgres واقعی تست شده
- [x] `Gpu.gamingIndex` برای هر ۲۵۰ کارت پر است (از شاخص GPU Ark)
- [ ] `Cpu.gamingIndex` — **هنوز خالی است**، منبع بنچمارک CPU لازم داریم
- [ ] seed جداول ثابت (`Benchmark` های دیگر، `DefaultScaling`)
- [ ] importer بازی‌ها (IGDB + Steam)
- [ ] موتور تخمین
- [ ] ماژول‌های Nest و کنترلرها

جزئیات کاتالوگ و اینکه چطور بازتولید می‌شود در
[`data-sources.md`](./data-sources.md#کاتالوگ-سخت‌افزار-وضعیت-فعلی) آمده.

## دستورها

```bash
docker compose -f docker/pg.docker-compose.yml up -d   # Postgres روی پورت 5434
docker compose -f docker/redis.docker-compose.yml up -d

pnpm prisma:generate
pnpm prisma:migrate:dev --name hardware_game_estimation
pnpm exec prisma db seed
pnpm prisma:studio

# اعتبارسنجی کاتالوگ بدون نیاز به دیتابیس
pnpm exec tsx src/app/db/prisma/seed/hardware/verify.ts
```
