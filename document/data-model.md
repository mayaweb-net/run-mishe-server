# مدل داده

مرجع: `src/app/db/prisma/models/`. این فایل توضیح می‌دهد هر مدل چه نقشی دارد، کدام فیلدها را
نباید دستی نوشت، و چه چیزهایی را Prisma نمی‌تواند بیان کند و باید دستی به migration اضافه شوند.

---

## لایه ۱ — کاتالوگ سخت‌افزار

### `Cpu` / `Gpu`

هر دو یک ساختار مشترک دارند:

```
هویت        id, slug, normalizedName, name, vendor
دسته‌بندی    family, series, generation, architecture, codename
مشخصات      (متفاوت برای هر کدام)
derived     gamingIndex, indexCalculatedAt   ← فقط توسط index job
منبع        quality, sourceName, sourceUrl, rawPayload
```

**سه فیلد نام و تفاوتشان:**

| فیلد | نمونه | کاربرد |
| --- | --- | --- |
| `name` | `Intel Core i5-13600K` | نمایش به کاربر |
| `slug` | `intel-core-i5-13600k` | URL صفحه‌ی قطعه |
| `normalizedName` | `intel core i5 13600k` | کلید یکتای matching |

قانون نرمال‌سازی در [`data-sources.md`](./data-sources.md#نرمال‌سازی-نام) آمده. هر جا خواستی نام
سخت‌افزار را با چیزی مقایسه کنی، فقط `normalizedName` یا `HardwareAlias.alias` را مقایسه کن، هرگز `name` را.

**ادغام‌هایی که عمداً انجام شده** (لیست اولیه‌ی فیلدها این‌ها را جدا داشت):

| به‌جای | یک فیلد |
| --- | --- |
| `cudaCores` / `streamProcessors` / `shaders` | `Gpu.shadingUnits` — یک کمیت با سه نام تجاری |
| `tdp` / `tbp` / `tgp` | `Gpu.tdpWatt` |
| `cores` / `physicalCores` | `Cpu.performanceCores` + `Cpu.efficiencyCores` |
| `integratedGraphics` / `hasIntegratedGraphics` / `integratedGpuId` | `Cpu.integratedGpuId` — null یعنی iGPU ندارد |
| `isDesktop` / `isMobile` / `isServer` | `formFactor` |
| `rayTracing` / `dlss` / `fsr` بولین | `dlssVersion` / `fsrVersion` عددی — چون DLSS 2 و DLSS 4 قابلیت یکسانی نیستند |

**`quality`** تعیین می‌کند importer اجازه‌ی بازنویسی دارد یا نه: ردیف‌های `VERIFIED` (اصلاح‌شده‌ی دستی)
هیچ‌وقت توسط import بعدی overwrite نمی‌شوند.

### `HardwareAlias`

مهم‌ترین جدول برای کیفیت محصول. کاربر می‌نویسد `3060`، استیم نوشته
`NVIDIA GeForce RTX 3060 Ti 8GB`، ویکی نوشته `GeForce RTX 3060 Ti`. همه باید به یک ردیف برسند.

```
kind + alias  →  cpuId | gpuId
```

`@@unique([kind, alias])` عمدی است: یک رشته نباید به دو قطعه resolve شود. برای رشته‌های مبهم مثل
`3060` باید آگاهانه تصمیم بگیری کدام را بگیرد (پیشنهاد: نسخه‌ی غیر-Ti). `weight` برای مرتب‌سازی
نتایج سرچ فازی است، نه برای رفع ابهام alias دقیق.

منابع alias:
1. خودِ `name` و `normalizedName`.
2. حذف پیشوند برند: `nvidia geforce rtx 4070` → `rtx 4070` → `4070`.
3. واریانت‌های حافظه: `rtx 3060 12gb`، `rx 6700 xt 12gb`.
4. نام‌های لپ‌تاپی: `rtx 4060 laptop`، `rtx 4060 mobile`.
5. غلط‌های رایج کاربران که از لاگ سرچ‌های بی‌نتیجه جمع می‌شوند.

---

## لایه ۱ — کاتالوگ بازی

### `Game`

هویت بازی برای هر سه محصول. کلیدهای بیرونی:

| فیلد | کاربرد |
| --- | --- |
| `steamAppId` | upsert از Steam و لینک به Store |
| `igdbId` | غنی‌سازی بعدی (هنوز seed نشده) |
| `slug` | URL صفحه‌ی بازی |
| `popularity` | عدد فعلی Steam Charts (بازیکنان آنلاین) |
| `demandTier` | cold-start برای استیمیتور؛ هنوز از recommended hardware پر نشده |
| `rawPayload` | snapshot استور (platforms، categories، HTML خام requirement، …) |

### `GameRequirement`

یک tier منتشرشده (`MINIMUM` / `RECOMMENDED` / …). فیلدهای ساختاریافته (`ramGb`، `storageGb`،
`directX`، `needsSsd`) از HTML استیم parse می‌شوند، ولی `rawCpuText` / `rawGpuText` **همیشه**
verbatim می‌مانند تا matcher قابل replay باشد.

### `GameRequirementOption`

یک جایگزین سخت‌افزاری داخل همان tier. کلید idempotency:

```
@@unique([requirementId, kind, matchedText])
```

`matchedText` زیررشته‌ی دقیق متن منبع است (با املای اصلی استیم). optionهایی که از seed می‌آیند
`matchScore = 1` دارند؛ fuzzy/review برای صف ادمین و سرچ کاربر رزرو شده.

---

## لایه ۲ — شواهد

### `Benchmark` + `CpuBenchmarkScore` / `GpuBenchmarkScore`

عمداً دو جدول امتیاز جدا به‌جای یک جدول polymorphic: Prisma رابطه‌ی polymorphic ندارد و این شکل
foreign key واقعی، ایندکس تمیز و تایپ درست در کلاینت می‌دهد.

`@@unique([gpuId, benchmarkId, source])` یعنی هر منبع فقط یک عدد برای هر ترکیب دارد، پس import
دوباره idempotent است. چند منبع برای یک بنچمارک مجاز است و index job آن‌ها را با وزن `sampleCount`
ادغام می‌کند.

`Benchmark.weightInIndex` تنها جایی است که تصمیم می‌گیری کدام بنچمارک چقدر در `gamingIndex` اثر
دارد. مقادیر پیشنهادی در [`estimation.md`](./estimation.md#وزن-بنچمارک‌ها).

### `FpsSample`

**قلب پروژه.** هر ردیف یک اندازه‌گیری واقعی است:

```
(game, gpu, cpu, resolution, preset, upscaler, rayTracing, frameGen)  →  avgFps, onePercentLow
```

- `confidence` وزن ردیف در کالیبراسیون است: ریویو معتبر ≈ ۱٫۰، یوتیوب ≈ ۰٫۷، کاربر ≈ ۰٫۴.
- `dedupeKey` یک sha256 از تاپل نرمال‌شده است تا اجرای دوباره‌ی importer ردیف تکراری نسازد:

```ts
const dedupeKey = sha256(
  [gameId, gpuId, cpuId, resolution, preset, upscaler, rayTracing, frameGen, source, sourceUrl ?? '']
    .join('|'),
);
```

- unique constraint روی خود تاپل نگذاشتیم چون دو منبع مستقل حق دارند برای یک ترکیب عدد متفاوت
  گزارش کنند — و دقیقاً همان پراکندگی است که خطای مدل را واقع‌بینانه می‌کند.

### `FpsSubmission`

دیتای کاربر عمداً در جدول جدا می‌نشیند تا هیچ‌وقت ناخواسته وارد کالیبراسیون نشود. تأیید یک submission
یعنی ساخت یک `FpsSample` با `source = "user"` و `confidence` پایین، و ست‌کردن `promotedSampleId`.

---

## لایه ۳ — محاسبه‌شده

> این جداول را هرگز دستی پر نکن. اگر مقداری اشتباه است، ورودی‌اش را در لایه ۱ یا ۲ درست کن و job را
> دوباره اجرا کن.

### `GameProfile`

خروجی fit شده‌ی هر بازی. نقطه‌ی مرجع همیشه **1080p / HIGH / بدون upscaler / بدون ray tracing** است.

- `gpuCoef`, `gpuExponent` — منحنی سقف GPU
- `cpuCoef`, `cpuExponent` — منحنی سقف CPU
- `blendK` — تیزی soft-min بین این دو
- `vramNeedGb` — JSON با شکل `{ "R1080P": { "HIGH": 6, "ULTRA": 8 }, "R2160P": { ... } }`
- `isCalibrated` — اگر `false` باشد یعنی ضرایب از `Game.demandTier` آمده‌اند نه از اندازه‌گیری.
  **این را حتماً در UI به‌عنوان «تخمینی» نشان بده.**
- `calibrationVersion` — نسخه‌ی الگوریتم، تا بتوانی fit های قدیمی را پیدا و بازسازی کنی.

### `GameScaling` / `DefaultScaling`

ضریب FPS برای هر ترکیب تنظیمات نسبت به نقطه‌ی مرجع.
`GameScaling` مخصوص بازی و fit شده است؛ اگر ردیفی نبود از `DefaultScaling` استفاده کن.
`DefaultScaling` یک بار seed می‌شود (مقادیر در [`estimation.md`](./estimation.md#جدول-پیش‌فرض-scaling)).

---

## لایه ۴ — اپلیکیشن

### `CheckSnapshot`

پشت لینک کوتاه `/c/{publicCode}`. `resultJson` نتیجه‌ی **منجمدشده** است، نه ورودی برای محاسبه‌ی
دوباره: استیمیتور با هر کالیبراسیون عوض می‌شود و لینکی که کاربر share کرده باید همان عددی را نشان
دهد که خودش دیده. `engineVersion` ثبت می‌شود تا بدانی با کدام نسخه ساخته شده.

کلاینت الان این URL را هاردکد می‌سازد
(`src/config/run-check.ts` → `shareUrl: https://runmishe.com/c/...`)؛ در فاز ۳ باید به این جدول وصل شود.

### `UserBuild`

سیستم ذخیره‌شده‌ی کاربر. `anonymousId` هست تا قبل از لاگین هم کار کند و بعد از لاگین بتوانی merge کنی.

---

## لایه ingestion

`ImportBatch` (یک اجرای importer) → `ImportRecord` (یک ردیف خام).

هیچ importer ای مستقیم روی `cpus` / `gpus` / `games` نمی‌نویسد. مزیت‌ها:

- یک scrape خراب فقط `import_records` را کثیف می‌کند، نه کاتالوگ را.
- می‌توانی بدون fetch دوباره، فقط مرحله‌ی normalize را replay کنی.
- ردیف‌های `NEEDS_REVIEW` صف کار پنل ادمین می‌شوند (`run-mishe-admin`).

---

## چیزهایی که باید دستی به migration اضافه شوند

Prisma این‌ها را تولید نمی‌کند. migration اولیه (`20260830182000_init`) جداول را می‌سازد، ولی
اکستنشن‌ها و ایندکس‌های زیر هنوز نیستند. آن‌ها را در یک migration بعدی اضافه کن.

### ۱. اکستنشن‌های Postgres

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
```

### ۲. ایندکس‌های سرچ فازی

برای autocomplete سخت‌افزار و بازی — همان ورودی‌های متن‌آزادی که کلاینت الان دارد.

> **دقت:** نام جدول‌ها snake_case است (چون `@@map` داریم) ولی نام **ستون‌ها** camelCase است، چون
> روی فیلدها `@map` نگذاشته‌ایم و Prisma خودش تبدیل نمی‌کند. پس در هر SQL خامی باید ستون‌ها را
> داخل `"` بگذاری. جزئیات در بخش [کانونشن‌ها](#کانونشن‌ها).

```sql
CREATE INDEX cpus_normalized_name_trgm   ON cpus  USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX gpus_normalized_name_trgm   ON gpus  USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX games_name_trgm             ON games USING gin ("name" gin_trgm_ops);
CREATE INDEX hardware_aliases_alias_trgm ON hardware_aliases USING gin ("alias" gin_trgm_ops);
```

نمونه‌ی کوئری:

```sql
SELECT id, name, similarity("normalizedName", $1) AS score
FROM gpus
WHERE "normalizedName" % $1
ORDER BY score DESC, "gamingIndex" DESC NULLS LAST
LIMIT 10;
```

### ۳. CHECK constraint ها

Prisma نمی‌تواند «دقیقاً یکی از این دو ستون پر باشد» را بیان کند:

```sql
ALTER TABLE hardware_aliases
  ADD CONSTRAINT hardware_aliases_one_target
  CHECK (num_nonnulls("cpuId", "gpuId") = 1);

ALTER TABLE game_requirement_options
  ADD CONSTRAINT game_requirement_options_one_target
  CHECK (num_nonnulls("cpuId", "gpuId") <= 1);

ALTER TABLE cpus ADD CONSTRAINT cpus_gaming_index_range
  CHECK ("gamingIndex" IS NULL OR "gamingIndex" BETWEEN 0 AND 100);
ALTER TABLE gpus ADD CONSTRAINT gpus_gaming_index_range
  CHECK ("gamingIndex" IS NULL OR "gamingIndex" BETWEEN 0 AND 100);
ALTER TABLE fps_samples ADD CONSTRAINT fps_samples_avg_fps_positive
  CHECK ("avgFps" > 0);
```

در `game_requirement_options` از `<= 1` استفاده شده چون parser ممکن است متنی را تشخیص دهد ولی
نتواند به قطعه‌ای resolve کند — آن ردیف با `needsReview = true` و بدون FK ذخیره می‌شود.

### ۴. ایندکس partial برای صف بازبینی

```sql
CREATE INDEX game_requirement_options_review
  ON game_requirement_options ("requirementId")
  WHERE "needsReview" = true;
```

---

## کانونشن‌ها

- نام جدول‌ها snake_case و جمع، از طریق `@@map` (مطابق `users` که از قبل بود).
- نام ستون‌ها camelCase (پیش‌فرض Prisma، بدون `@map`). یعنی در SQL خام باید نقل‌قول شوند:
  `"gamingIndex"` نه `gaming_index`.
  اگر ستون snake_case می‌خواهی، **همین حالا** روی تک‌تک فیلدها `@map` بگذار — بعد از اولین
  migration روی دیتای واقعی، این تغییر گران می‌شود.
- کلید اصلی همه‌جا `String @id @default(uuid())`.
- هر جدولی که ویرایش می‌شود `createdAt` + `updatedAt` دارد؛ جدول‌های فقط-append فقط `createdAt`.
- کلاک‌ها همیشه بر حسب MHz و `Int`. حافظه بر حسب GB و `Int`. کش بر حسب MB و `Float`.
- پول همیشه `Int` بر حسب دلار (بدون سنت) در `msrpUsd`.
- `onDelete: Cascade` برای مالکیت واقعی، `SetNull` برای ارجاع اختیاری (مثل `integratedGpuId`).
