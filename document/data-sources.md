# منابع داده و پایپلاین ingestion

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
| [IGDB API](https://api-docs.igdb.com/) | نام، تاریخ، ژانر، کاور، موتور | رایگان با اکانت Twitch. **بهترین گزینه برای شروع** |
| Steam Store API | `pc_requirements` (min و recommended) | `https://store.steampowered.com/api/appdetails?appids={id}&l=english` |
| SteamSpy / Steam charts | محبوبیت، برای `Game.isPopular` | عمومی |

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
6. games                     (IGDB)
7. game requirements         (Steam) → نیاز به alias های مرحله ۳
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

برای هر قطعه، بعد از upsert این‌ها را بساز:

```
1. normalizedName خودش                         → "nvidia geforce rtx 4070 ti"
2. بدون نام برند                                → "geforce rtx 4070 ti" → "rtx 4070 ti"
3. بدون پیشوند خط محصول                         → "4070 ti"
4. با ظرفیت حافظه                               → "rtx 4070 ti 12gb"
5. واریانت لپ‌تاپ (اگر formFactor = LAPTOP)      → "rtx 4070 laptop" / "rtx 4070 mobile"
6. برای CPU: بدون کلمه‌ی core/ryzen             → "i5 13600k" / "5600x"
```

اگر alias تولیدشده با unique constraint برخورد کرد، آن را **دور بینداز** و در لاگ بنویس — یعنی
مبهم است و باید دستی تصمیم بگیری کدام قطعه صاحبش شود.

---

## Matching: از متن به قطعه

جایی که هم ورودی کاربر و هم متن requirement استیم را resolve می‌کنی. سه مرحله، به ترتیب:

```ts
// ۱. تطابق دقیق روی alias — اکثر موارد اینجا حل می‌شود
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

مراحل:

1. HTML را به متن ساده تبدیل کن.
2. روی جداکننده‌ها split کن: ` or `, ` / `, `,`, ` | `, ` یا `.
3. عبارت‌های اضافه را حذف کن: `or better`, `or equivalent`, `minimum`, `recommended`, `and above`.
4. هر قطعه را جدا نرمال و match کن.
5. برای هر کدام یک `GameRequirementOption` بساز — حتی آن‌هایی که resolve نشدند
   (با `cpuId = null`, `gpuId = null`, `needsReview = true`, و `matchedText` پرشده).

**مهم:** `rawCpuText` / `rawGpuText` را همان‌طور که آمده نگه دار. parser حداقل سه بار بازنویسی
خواهد شد و بدون متن خام باید کل استیم را دوباره fetch کنی.

---

## Idempotency

هر importer باید بتواند بدون ترس چند بار اجرا شود:

| جدول | کلید idempotency |
| --- | --- |
| `Cpu` / `Gpu` | `normalizedName` (unique) → upsert |
| `Game` | `steamAppId` یا `igdbId` (unique) → upsert |
| `GameRequirement` | `(gameId, tier)` (unique) → upsert، و option های قبلی را حذف و بازتولید کن |
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
