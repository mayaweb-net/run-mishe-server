# منابع داده و پایپلاین ingestion

---

## کاتالوگ سخت‌افزار: وضعیت فعلی

کاتالوگ ساخته شده و داخل مخزن است. **هیچ CSV ای در مخزن نیست** — فقط فایل‌های TypeScript تولیدشده:

| فایل | محتوا |
| --- | --- |
| `seed/hardware/gpu-data.ts` | ۲۵۰ GPU با مشخصات کامل و `gamingIndex` |
| `seed/hardware/cpu-data.ts` | ۲۵۰ CPU دسکتاپ با مشخصات کامل |
| `seed/hardware/types.ts` | تایپ `GpuSeed` و `CpuSeed` |
| `seed/hardware/shared.ts` | نرمال‌سازی نام، slug، ساخت alias |
| `seed/hardware/gpu.ts` / `cpu.ts` | seeder ها |
| `seed/hardware/verify.ts` | اعتبارسنجی آفلاین، بدون دیتابیس |

### منابع هر فیلد

| داده | منبع | لایسنس |
| --- | --- | --- |
| مشخصات GPU + شاخص عملکرد (`gpiScore`) | [GPU Ark](https://gpuark.com/datasets/) | CC BY 4.0 — **attribution الزامی** |
| TMU / ROP / نام نسل / کدنیم دای | dump سبک TechPowerUp | — |
| سیگنال محبوبیت GPU (`retailBoardCount`) | [BuildCores Open DB](https://github.com/buildcores/buildcores-open-db) | ODC-By 1.0 — **attribution الزامی** |
| مشخصات CPU | BuildCores Open DB | ODC-By 1.0 |

هر دو لایسنس اجازه‌ی استفاده‌ی تجاری می‌دهند به شرط ذکر منبع. لینک attribution باید در فوتر سایت
بیاید، نه فقط در این فایل.

### دو رتبه‌بندی مستقل

`popularityRank` و `performanceRank` عمداً از هم جدا هستند:

- **`popularityRank`** از تعداد مدل‌های خرده‌فروشی هر تراشه در BuildCores می‌آید. یعنی «چند شرکت
  از این چیپ کارت ساخته‌اند» که پروکسی خوبی برای «چند نفر این کارت را دارند» است. صدر جدول
  RTX 3060 Ti و RTX 4070 است، نه RTX 5090 — و همین درست است.
- **`performanceRank`** از `gpiScore` می‌آید. صدرش RTX 5090 است.

تراشه‌های لپ‌تاپ در BuildCores کارت خرده‌فروشی ندارند، پس همه‌شان انتهای `popularityRank` جمع
می‌شوند و بر اساس عملکرد مرتب می‌شوند.

### ترکیب کاتالوگ

- GPU: ۱۷۹ دسکتاپ + ۷۱ لپ‌تاپ (فیلد `formFactor` تفکیکشان می‌کند)
- CPU: فقط دسکتاپ. Xeon / EPYC / Threadripper و مدل‌های کم‌مصرف `T` حذف شده‌اند
- کارت‌هایی که هرگز عرضه نشدند (RTX 4090 Ti، Arc B770، …) در لیست `GPU_PHANTOMS` بلاک شده‌اند
- کارت‌های دوتراشه‌ای (GTX TITAN Z، R9 295X2) حذف شده‌اند چون تخمین تک‌GPU توصیفشان نمی‌کند

### شکاف باز: `Cpu.gamingIndex`

**هیچ منبع بنچمارک CPU ای که لایسنس باز داشته باشد پیدا نشد.** BuildCores فقط مشخصات دارد.
بنابراین `Cpu.gamingIndex` برای هر ۲۵۰ ردیف `null` است و seeder عمداً آن را پر نمی‌کند.

این طبق «قانون شماره ۱» در README است: لایه ۳ فقط از روی شواهد لایه ۲ ساخته می‌شود. اگر از روی
مشخصات یک عدد حدسی می‌ساختیم، دیگر قابل بازتولید و قابل دفاع نبود.

**تا وقتی این پر نشود، محاسبه‌ی `fpsCpu` و گلوگاه کار نمی‌کند.** گزینه‌ها:

1. PassMark CPU Mark — لایسنس تجاری دارد، تمیزترین مسیر
2. Geekbench Browser — قابل جست‌وجو، ولی شرایط استفاده را باید بررسی کرد
3. استخراج دستی از ریویوهای معتبر برای ۵۰ CPU پرتکرار، بقیه با رگرسیون روی مشخصات
   (آن ردیف‌ها باید `quality = ESTIMATED` بگیرند)

### بازتولید کاتالوگ

`scripts/build_hardware_seed.py` فایل‌های `*-data.ts` را می‌سازد. ورودی‌هایش در مخزن نیستند و
باید دانلود شوند:

```bash
mkdir -p /tmp/run-mishe-hw
curl -o /tmp/run-mishe-hw/gpuark-gpu-specs.csv \
     https://gpuark.com/datasets/gpuark-gpu-specs.csv
git clone https://github.com/buildcores/buildcores-open-db ../buildcores-open-db

python scripts/build_hardware_seed.py \
    --buildcores ../buildcores-open-db --datasets /tmp/run-mishe-hw

pnpm exec tsx src/app/db/prisma/seed/hardware/verify.ts
```

`gpudb.csv` (برای TMU/ROP) اختیاری است؛ بدون آن آن دو فیلد `null` می‌مانند.

> تابع `normalize()` در اسکریپت پایتون و `normalizeHardwareName()` در `shared.ts` باید **دقیقاً
> یکسان** بمانند. اگر واگرا شوند، اسکریپت ردیف‌هایی تولید می‌کند که به‌نظر متمایزند ولی روی
> unique index دیتابیس برخورد می‌کنند.

---

## کاتالوگ بازی: وضعیت فعلی

کاتالوگ بازی هم داخل مخزن است؛ فقط TypeScript تولیدشده، نه HTML/CSV خام:

| فایل | محتوا |
| --- | --- |
| `seed/games/game-data.ts` | ۲۳۴ بازی + requirementهای ساختاریافته |
| `seed/games/types.ts` | تایپ `GameSeed` و `GameRequirementSeed` |
| `seed/games/game.ts` | seeder (`Game` + `GameRequirement` + option matching) |
| `seed/games/requirement-matcher.ts` | matching دقیق longest-match روی alias |
| `seed/games/verify-requirements.ts` | گزارش پوشش آفلاین، بدون دیتابیس |

### منابع هر فیلد

| داده | منبع | یادداشت |
| --- | --- | --- |
| لیست و محبوبیت (`popularity`) | [Steam Charts](https://steamcharts.com/) top players | ۲۵۰ ردیف؛ ابزارها و launcherها حذف شدند |
| نام، تاریخ، ژانر، سازنده، ناشر، کاور، توضیح کوتاه | Steam Store `appdetails` | `https://store.steampowered.com/api/appdetails?appids={id}` |
| `pc_requirements` (min / recommended) | همان API | HTML خام در `steamSnapshot` نگه داشته می‌شود |
| `GameRequirementOption` | matching روی `HardwareAlias` | فقط exact؛ fuzzy عمداً در seed نیست |

یک اپ (`1329410`، MahjongSoul) از API با `success: false` برگشت؛ ردیف CSV نگه داشته شد ولی
متادیتا/requirement جعلی ساخته نشد.

### بازتولید کاتالوگ بازی

ورودی‌های خام در `.temp/` می‌مانند و commit نمی‌شوند:

```bash
# ۱) tbody جدول Steam Charts را در این مسیر بگذار
#    .temp/steam-charts/game.html
python scripts/parse_steam_charts.py
# → .temp/steam-charts/game.csv

# ۲) fetch استور (کش در .temp/steam-appdetails/)
python scripts/build_game_seed.py
# → seed/games/game-data.ts

pnpm exec tsx src/app/db/prisma/seed/games/verify-requirements.ts
```

---

## منابع
### مشخصات GPU

| منبع | پوشش | فرمت | یادداشت |
| --- | --- | --- | --- |
| [TechPowerUp GPU Database](https://www.techpowerup.com/gpu-specs/) | بهترین تک‌منبع — تقریباً هر GPU از ۱۹۹۸ تا امروز | HTML | ساختار صفحات یکنواخت است، parser ساده می‌شود |
| ویکی‌پدیا: List of Nvidia GPUs / AMD GPUs / Intel Arc | جدول‌های تمیز | HTML table | برای پرکردن فیلدهای جامانده و اعتبارسنجی متقابل |
| NVIDIA / AMD product pages | فقط نسل جاری | HTML / JSON | برای `msrpUsd` و ویژگی‌های نرم‌افزاری (DLSS/FSR) |

### مشخصات CPU

| منبع | پوشش | فرمت |
| --- | --- | --- |
| [Intel ARK](https://ark.intel.com/) | همه‌ی پردازنده‌های اینتل، رسمی | JSON پشت صفحه |
| AMD product pages | همه‌ی پردازنده‌های AMD | HTML |
| TechPowerUp CPU Database | هر دو برند، فرمت یکنواخت | HTML |
| ویکی‌پدیا: List of Intel/AMD processors | جدول‌های تمیز | HTML table |

### بنچمارک

| منبع | چه چیزی | یادداشت |
| --- | --- | --- |
| PassMark (CPU Benchmarks / GPU Benchmarks) | G3D، G2D، CPU Mark، Single Thread | لیست‌های عمومی دارد و لایسنس تجاری هم می‌فروشد. اگر قصد تجاری داری، مسیر لایسنس را برو |
| 3DMark / UL Benchmarks | Time Spy، Fire Strike، Steel Nomad | نتایج در ریویوهای عمومی هم هست |
| Geekbench Browser | Single/Multi، OpenCL، Vulkan | جست‌وجوپذیر |

### کاتالوگ بازی

| منبع | چه چیزی | دسترسی |
| --- | --- | --- |
| Steam Charts | محبوبیت لحظه‌ای، لیست seed اولیه | HTML جدول top players |
| Steam Store API | متادیتا + `pc_requirements` | `https://store.steampowered.com/api/appdetails?appids={id}&l=english` |
| [IGDB API](https://api-docs.igdb.com/) | موتور، نام جایگزین، غنی‌سازی بعدی | رایگان با اکانت Twitch — هنوز به seed وصل نشده |

### FPS واقعی (`FpsSample`)

این سخت‌ترین بخش است و هیچ API آماده‌ای ندارد.

| منبع | کیفیت | `confidence` پیشنهادی |
| --- | --- | --- |
| TechPowerUp GPU reviews | جدول FPS چند بازی × چند کارت، سخت‌افزار تست دقیقاً مشخص | 1.0 |
| Tom's Hardware / Gamers Nexus / Computerbase | همان | 1.0 |
| کانال‌های بنچمارک یوتیوب | حجم زیاد، سخت‌افزار مشخص، ولی تنظیمات گاهی مبهم | 0.6 – 0.7 |
| ثبت کاربران | حجم بالقوه بالا، نویز زیاد | 0.4 |

**استراتژی پیشنهادی برای شروع:** ۵۰ بازی محبوب × ۱۵ GPU پرتکرار × ۳ رزولوشن ≈ ۲۲۰۰ ردیف.
با CSV دستی از ریویوهای معتبر. یکی دو هفته کار است و کل سیستم را از حالت حدسی خارج می‌کند.
از GPU هایی شروع کن که بیشترین سرچ را دارند، نه از قوی‌ترین‌ها.

### هشدار حقوقی

قوانین استفاده‌ی هر منبع را قبل از scrape چک کن. PassMark و IGDB مسیر رسمی/لایسنس‌دار دارند و
برای پروژه‌ای که قرار است عمومی و درآمدزا باشد، همان مسیر امن‌تر است. برای بقیه: rate limit
محترمانه، `User-Agent` صادق، کش کردن پاسخ‌ها تا re-fetch لازم نشود، و attribution در صفحه.

---

## پایپلاین

```
fetch  →  ImportRecord (payload خام)  →  normalize  →  match  →  upsert  →  index job
                    ↓                                     ↓
              نگهداری دائمی                        NEEDS_REVIEW → پنل ادمین
```

هر importer یک `ImportBatch` می‌سازد، همه‌ی ردیف‌های خام را می‌نویسد، و **بعد** در یک مرحله‌ی جدا
پردازش می‌کند. مزیت: مرحله‌ی fetch (کند و شکننده) از مرحله‌ی normalize (سریع و تکرارپذیر) جدا
می‌شود و می‌توانی parser را ده بار عوض کنی بدون یک بار fetch دوباره.

### ترتیب اجرا

ترتیب مهم است چون هر مرحله به قبلی وابسته است:

```
1. gpus            (چون Cpu.integratedGpuId به آن اشاره می‌کند)
2. cpus
3. hardware aliases  (تولیدی، از روی نام‌ها)
4. benchmarks + scores
5. hardware-index job        → gamingIndex پر می‌شود
6. games + requirements      (Steam Charts + Store)  ← الان در seed هست
7. requirement options       (exact match روی alias مرحله ۳)  ← الان در seed هست
8. demand tier               → نیاز به gamingIndex مرحله ۵
9. fps samples
10. calibration job          → GameProfile / GameScaling
```
---

## نرمال‌سازی نام

تابعی که همه‌جا باید استفاده شود، برای هم `normalizedName` و هم `HardwareAlias.alias`:

```ts
function normalizeHardwareName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')      // حذف دیاکریتیک
    .replace(/\((r|tm|c)\)|[®™©]/g, '')   // (R) (TM) و نمادها
    .replace(/\b(processor|cpu|gpu|graphics card|series|edition)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')          // هر جداکننده‌ای → فاصله
    .replace(/\s+/g, ' ')
    .trim();
}
```

نمونه‌ها:

| ورودی | خروجی |
| --- | --- |
| `Intel® Core™ i5-13600K Processor` | `intel core i5 13600k` |
| `NVIDIA GeForce RTX 3060 Ti` | `nvidia geforce rtx 3060 ti` |
| `AMD Ryzen™ 5 5600X` | `amd ryzen 5 5600x` |

**دو دام:**

1. **پسوند مدل را از عدد جدا نکن.** `i5-13600K` باید `13600k` بماند نه `13600 k`، وگرنه با
   `13600` غیرقفل قاطی می‌شود. رجکس بالا این کار را می‌کند چون حرف و عدد چسبیده‌اند.
2. **`Ti` و `Super` و `XT` را هرگز حذف نکن.** `RTX 4070` و `RTX 4070 Ti` و `RTX 4070 Super`
   سه کارت کاملاً متفاوت‌اند.

### تولید alias

پیاده‌سازی در `seed/hardware/shared.ts` (تابع `buildAliases`) است. برای هر قطعه:

```
GPU:  nvidia geforce rtx 4070 ti     ← نام کامل
      geforce rtx 4070 ti            ← بدون نام برند
      rtx 4070 ti                    ← فقط توکن مدل

CPU:  intel core i5 13600k           ← نام کامل
      i5 13600k                      ← بدون "Intel Core"
      intel i5 13600k                ← بدون فقط کلمه‌ی "Core"
```

**عدد خالی هرگز alias نمی‌شود.** `"4070"` بین RTX 4070 و RTX 4070 Ti و RTX 4070 SUPER و نسخه‌ی
لپ‌تاپ مبهم است؛ اگر آن را بسازیم، جستجو یکی را خودسرانه انتخاب می‌کند.

**تراشه‌های لپ‌تاپ توکن مدل خالی نمی‌گیرند.** `"rtx 4070"` همیشه به کارت دسکتاپ می‌رسد، وگرنه
کاربری که کارت دسکتاپ دارد ممکن است تخمین لپ‌تاپ بگیرد.

هر alias فقط به یک قطعه می‌تواند اشاره کند (unique روی `(kind, alias)`). seeder ترتیبی جلو می‌رود
و اولین قطعه‌ای که یک alias را claim کند مالکش می‌ماند؛ بقیه آن alias را از دست می‌دهند و با نام
کامل خودشان پیدا می‌شوند. چون ترتیب بر اساس `popularityRank` است، رایج‌ترین قطعه برنده می‌شود.

---

## Matching: از متن به قطعه

جایی که هم ورودی کاربر و هم متن requirement استیم را resolve می‌کنی.

### seed فعلی (`requirement-matcher.ts`)

برای requirement فقط **exact longest-match** روی aliasهای نرمال‌شده اجرا می‌شود:

1. متن را توکن کن (علامت‌های ®/™ و چسبندگی‌هایی مثل `6600XT` / `gtx1060` را جدا کن).
2. از هر موقعیت، طولانی‌ترین alias مطابق را بگیر تا `RTX 4070 Ti` به `RTX 4070` سقوط نکند.
3. اگر پسوند مدل (`Ti` / `SUPER` / `XT` / …) بعد از match باقی مانده و در alias نبود، رد کن.
4. مدل ناشناخته را به قطعهٔ مشابه وصل نکن — option نمی‌سازیم.

نتیجه با `matchScore = 1` و `needsReview = false` در `GameRequirementOption` upsert می‌شود.
کلید idempotency: `@@unique([requirementId, kind, matchedText])`.

### سرچ API کاربر (هنوز ساخته نشده)

برای autocomplete کاربر سه مرحله‌ی زیر باقی است:

```ts
// ۱. تطابق دقیق روی alias
const exact = await findAlias(kind, normalized);
if (exact) return { hardware: exact, score: 1.0 };

// ۲. تطابق فازی با pg_trgm
const fuzzy = await trigramSearch(kind, normalized);   // similarity > 0.45
if (fuzzy.length === 1 || fuzzy[0].score - fuzzy[1].score > 0.15) {
  return { hardware: fuzzy[0], score: fuzzy[0].score };
}

// ۳. مبهم — ذخیره کن ولی برای بازبینی flag بزن
return { hardware: fuzzy[0] ?? null, score: fuzzy[0]?.score ?? 0, needsReview: true };
```

آستانه‌ی `needsReview` را روی `matchScore < 0.75` بگذار.

### parse کردن متن requirement

متن استیم HTML خام است و همیشه لیست است:

```
"NVIDIA GeForce GTX 1060 6GB or AMD Radeon RX 580 8GB"
"Intel Core i5-8400 / AMD Ryzen 5 2600"
"GTX 1660 Super (6GB) or better"
```

مراحل فعلی در `build_game_seed.py` + `requirement-matcher.ts`:

1. HTML را به متن ساده تبدیل کن و فیلدهای OS/Processor/Graphics/… را جدا کن.
2. RAM / storage / DirectX / SSD را با regex ساختاریافته استخراج کن.
3. کل `rawCpuText` / `rawGpuText` را نگه دار و روی همان متن matching کن
   (جدا کردن با `or`/`/` لازم نیست؛ matcher چند alias را پشت‌سرهم پیدا می‌کند).

**مهم:** `rawCpuText` / `rawGpuText` را همان‌طور که آمده نگه دار. parser حداقل سه بار بازنویسی
خواهد شد و بدون متن خام باید کل استیم را دوباره fetch کنی.

---

## Idempotency

هر importer باید بتواند بدون ترس چند بار اجرا شود:

| جدول | کلید idempotency |
| --- | --- |
| `Cpu` / `Gpu` | `normalizedName` (unique) → upsert |
| `Game` | `steamAppId` یا `igdbId` (unique) → upsert |
| `GameRequirement` | `(gameId, tier)` (unique) → upsert |
| `GameRequirementOption` | `(requirementId, kind, matchedText)` (unique) → upsert؛ optionهای غیرlegacy که دیگر match نمی‌شوند حذف می‌شوند |
| `CpuBenchmarkScore` / `GpuBenchmarkScore` | `(hardwareId, benchmarkId, source)` (unique) |
| `FpsSample` | `dedupeKey` (sha256، فرمولش در `data-model.md`) |
| `ImportRecord` | `(batchId, externalId)` |

**قانون overwrite:** اگر ردیف موجود `quality = VERIFIED` است (کسی دستی درستش کرده)، importer فقط
فیلدهای `null` را پر می‌کند و بقیه را دست نمی‌زند.

---

## کیفیت داده: چه چیزی را مانیتور کن

بعد از هر ingest این‌ها را گزارش بگیر. اگر یکی‌شان از آستانه رد شد، احتمالاً منبع ساختارش عوض شده:

| معیار | آستانه‌ی هشدار |
| --- | --- |
| درصد GPU هایی که `gamingIndex` ندارند | > ۱۵٪ |
| درصد `GameRequirement` هایی که هیچ option ای resolve نشده | > ۲۰٪ |
| درصد `GameRequirementOption` با `needsReview = true` | > ۳۰٪ |
| تعداد `ImportRecord` با وضعیت `FAILED` | > ۵٪ از batch |
| سرچ‌های کاربر بدون نتیجه | لاگ بگیر — بهترین منبع برای alias های جدید |

آخری را جدی بگیر: هر سرچ بی‌نتیجه یعنی یک alias کم داری، و هر alias کم یعنی یک کاربر که فکر
می‌کند سایت کار نمی‌کند.
