# نقشه راه

تخمین‌های زمانی برای یک نفر تمام‌وقت است. هر فاز یک «تعریف تمام‌شده» دارد که قابل دمو باشد —
عمداً طوری چیده شده که از فاز ۳ به بعد در هر فاز چیزی قابل انتشار داشته باشی.

## وضعیت شروع (به‌روز سپتامبر ۲۰۲۶)

| بخش | وضعیت |
| --- | --- |
| `run-mishe-server` | NestJS + Fastify + Prisma + Postgres + Redis. ماژول‌های `hardware` / `game` / `admin` / `benchmark` فعال‌اند |
| `run-mishe-client` | Next، صفحات `/` و `/review` و `/fps` هنوز عمدتاً از mock تغذیه‌اند |
| `run-mishe-admin` | لیست CPU / GPU / Game از API ادمین |

### پیشرفت تقریبی نسبت به کل نقشه راه تا فاز ۳ (اولین انتشار)

| فاز | درصد تقریبی | یادداشت |
| --- | ---: | --- |
| ۰ پایه‌ی دیتا | ~۷۰٪ | اسکیما و seed هست؛ trigram و public search و DefaultScaling مانده |
| ۱ کاتالوگ سخت‌افزار | ~۹۵٪ | کاتالوگ + PassMark + `gamingIndex` CPU/GPU؛ ESTIMATED fallback مانده |
| ۲ کاتالوگ بازی | ~۸۵٪ | ۲۳۴ بازی + matching خوب؛ `demandTier` مانده |
| ۳ «ران میشه؟» | ۰٪ | هنوز شروع نشده |
| ۴+ | ۰٪ | بعد از فاز ۳ |

**جمع تا اولین فیچر قابل انتشار (فاز ۳):** حدود **۶۵–۷۰٪** مسیر دیتا/زیرساخت؛ خود محصول هنوز ۰٪.

**قدم بعدی پیشنهادی:** شروع فاز ۳ (`POST /run-check`) یا بستن باقیمانده‌ی فاز ۰ (`DefaultScaling` / trigram).

---

## فاز ۰ — پایه‌ی دیتا · ~۱ هفته

- [x] نوشتن مدل‌های Prisma
- [x] رفع ناهماهنگی مسیر seed در `prisma.config.ts` (به `seed/seed.ts` اشاره می‌کند)
- [x] migration اولیه (`20260830182000_init`)
- [x] ماژول‌های دامنه `hardware` / `game` + کنترلر ادمین (لیست با pagination/search ساده)
- [ ] افزودن SQL دستی از [`data-model.md`](./data-model.md#چیزهایی-که-باید-دستی-به-migration-اضافه-شوند)
      (`pg_trgm` / `unaccent` و ایندکس‌های سرچ) به migration بعدی
- [x] seed جدول‌های ثابت: `DefaultScaling` (۲۴ ردیف)
- [ ] API عمومی سرچ: `GET /hardware/*` و `GET /games` با trigram

**تمام‌شده وقتی:** `GET /hardware/gpus?q=3060` و `GET /games?q=cyber` جواب درست می‌دهند.

---

## فاز ۱ — کاتالوگ سخت‌افزار · ~۱ تا ۲ هفته

- [x] کاتالوگ ۲۵۰ GPU (۱۷۹ دسکتاپ + ۷۱ لپ‌تاپ) با مشخصات کامل
- [x] کاتالوگ ۲۸۶ CPU دسکتاپ با مشخصات کامل
- [x] تولید alias (بدون برخورد؛ حدود ۸۶۴ GPU و ۹۳۱ CPU در verify فعلی)
- [x] `Gpu.gamingIndex` از شاخص GPU Ark، ذخیره‌شده در `GpuBenchmarkScore` تا بازتولیدپذیر بماند
- [x] پایپلاین PassMark (crawl + JSONL + importer + matching محافظه‌کارانه)
      — پوشش تقریبی crawl: CPU تقریباً کامل، GPU ~۸۷٪ (باقی‌مانده عمدتاً Max-Q/Mobile بدون صفحه جدا)
- [x] تمیزکاری catalog: merge editionهای نادر + alias؛ حذف GPUهای عرضه‌نشده
- [x] import اسکور PassMark به DB (`pnpm import:benchmarks`)
- [x] `hardware-index` job — `Cpu`/`Gpu.gamingIndex` از روی `*BenchmarkScore`
      (`pnpm index:hardware`؛ GPU = Ark 0.7 + G3D 0.3؛ CPU = single 65% + multi 35%)
- [ ] رگرسیون fallback برای قطعات بدون بنچمارک (`quality = ESTIMATED`)
- [ ] 3DMark Time Spy: تعریف + وزن رزرو شده؛ منبع per-GPU هنوز نیست

**تمام‌شده وقتی:** بیش از ۸۵٪ GPU ها و CPU ها `gamingIndex` دارند، و مرتب‌سازی بر اساس آن با
رنکینگ‌های شناخته‌شده‌ی بازار همخوان است (این را چشمی چک کن، پنج دقیقه وقت می‌برد و خطاهای فاحش
را نشان می‌دهد).

> پوشش فعلی index: GPU ۱۰۰٪، CPU ~۹۹٪ (یکی بدون PassMark). فاز ۱ از نظر شواهد practically بسته است.

**دستاورد قابل انتشار:** لیست قطعات در ادمین با `gamingIndex`؛ صفحات عمومی `/parts/*` هنوز در کلاینت کامل نیست.

---

## فاز ۲ — کاتالوگ بازی · ~۱ هفته

- [x] لیست محبوبیت از Steam Charts (۲۵۰ ردیف، ۱۶ غیر‌بازی حذف شد → ۲۳۴ بازی)
- [x] fetch متادیتا و `pc_requirements` از Steam Store API → `seed/games/game-data.ts`
- [x] seed `Game` + `GameRequirement` (min/recommended)
- [x] matching دقیق alias روی متن requirement → `GameRequirementOption`
- [ ] محاسبه‌ی `Game.demandTier` از روی سخت‌افزار recommended (نیاز به `gamingIndex`)
- [ ] غنی‌سازی اختیاری با IGDB (موتور، نام فارسی، کاور جایگزین)
- [ ] مرور دستی بازی‌هایی که هیچ option ای resolve نشده‌اند

**پوشش فعلی matching دقیق (آفلاین، سپتامبر ۲۰۲۶):**

| فیلد | فیلدهای دارای متن | فیلدهای با حداقل یک match | option ساخته‌شده |
| --- | --- | --- | --- |
| CPU | ۴۳۰ | ۳۶۲ (~۸۴٪) | ۶۲۴ |
| GPU | ۴۲۲ | ۳۷۳ (~۸۸٪) | ۷۲۶ |

باقی‌مانده‌ها عمدتاً مدل‌های خیلی قدیمی خارج از کاتالوگ، یا متن‌های کلی مثل
`Dual Core 2.8 GHz` / `DirectX 11 compatible` هستند — عمداً fuzzy نمی‌شوند.

**تمام‌شده وقتی:** برای ۹۰٪ بازی‌های محبوب، هر دو tier حداقل یک option با `matchScore = 1`
دارند، یا برای بقیه مسیر `needsReview` در ادمین مشخص است.

---

## فاز ۳ — «ران میشه؟» · ~۳ تا ۴ روز

اولین فیچر واقعی. **هیچ دیتای FPS ای لازم ندارد** — فقط مقایسه‌ی index.

- [ ] `POST /run-check`
- [ ] `CheckSnapshot` و مسیر `/c/{code}`
- [ ] جایگزینی `getRunCheckResult` در `src/config/run-check.ts` با فراخوانی API
- [ ] تبدیل ورودی‌های متن‌آزاد `run-check-page.tsx` به autocomplete

منطق: نتیجه از مقایسه‌ی `gamingIndex` کاربر با بیشترین `gamingIndex` بین option های هر tier
درمی‌آید (زیر minimum / بین min و recommended / بالای recommended)، به‌علاوه‌ی چک RAM و VRAM.

**تمام‌شده وقتی:** قابل انتشار است.

---

## فاز ۴ — تخمین FPS · ~۲ تا ۳ هفته

- [ ] `estimation.engine.ts` به‌صورت توابع خالص + تست
- [ ] seed دستی `FpsSample` (۵۰ بازی × ۱۵ GPU × ۳ رزولوشن)
- [ ] `calibration.job.ts`
- [ ] `POST /fps-estimate` با کش Redis
- [ ] وصل‌کردن `/fps` و حذف `mockResolutions` از `src/config/fps-calculator.ts`
- [ ] نمایش برچسب اطمینان در UI

**تمام‌شده وقتی:** MAPE روی مجموعه‌ی hold-out کمتر از ۱۵٪ است.

سنگین‌ترین فاز، و بیشتر وزنش کار دستی جمع‌آوری دیتاست نه کدنویسی. جمع‌آوری را از همین حالا موازی
با فازهای قبل شروع کن.

---

## فاز ۵ — گلوگاه · ~۳ روز

روی همان استیمیتور سوار است؛ `fpsGpu` و `fpsCpu` از قبل در خروجی engine هستند.

- [ ] `POST /bottleneck`
- [ ] صفحه‌ی جدید در کلاینت با جدول چهار-رزولوشنی
- [ ] حالت «بدون بازی» با پروفایل میانگین

---

## فاز ۶ — رشد

- [ ] ثبت FPS توسط کاربر (`FpsSubmission`) + صف تأیید در `run-mishe-admin`
- [ ] پنل ادمین برای صف `NEEDS_REVIEW` (option های requirement و match های ضعیف)
- [ ] صفحات SEO: یک صفحه به ازای هر بازی، هر GPU، هر CPU، و هر جفت «X در بازی Y»
- [ ] `UserBuild` و ذخیره‌ی سیستم کاربر
- [ ] مقایسه‌ی دو قطعه کنار هم
- [ ] پیشنهاد ارتقا: «با تعویض CPU به X، گلوگاه از ۳۵٪ به ۸٪ می‌رسد»

آخری بهترین قلاب محصولی است و هیچ دیتای جدیدی لازم ندارد — فقط اجرای استیمیتور روی چند کاندید.

---

## طرح اولیه‌ی API

قراردادهای زیر پیشنهادی‌اند و باید قبل از فاز ۳ نهایی شوند.

### سرچ / autocomplete

```
GET /hardware/cpus?q=13600&limit=10
GET /hardware/gpus?q=3060&limit=10
GET /games?q=cyberpunk&limit=10
```

```jsonc
{
  "items": [
    { "id": "...", "slug": "nvidia-geforce-rtx-3060", "name": "NVIDIA GeForce RTX 3060",
      "vendor": "NVIDIA", "vramGb": 12, "gamingIndex": 21.4, "score": 0.92 }
  ]
}
```

### ران میشه؟

```
POST /run-check
{ "gameId": "...", "cpuId": "...", "gpuId": "...", "ramGb": 16 }
```

```jsonc
{
  "verdict": "ABOVE_RECOMMENDED",     // BELOW_MINIMUM | MEETS_MINIMUM | ABOVE_RECOMMENDED
  "runs": true,
  "components": {
    "cpu": { "status": "pass", "userIndex": 42.1, "requiredIndex": 18.0 },
    "gpu": { "status": "pass", "userIndex": 21.4, "requiredIndex": 12.5 },
    "ram": { "status": "pass", "userValue": 16, "required": 12 },
    "vram": { "status": "warn", "userValue": 8, "required": 10 }
  },
  "requirements": { "minimum": { }, "recommended": { } },
  "expectedPerformance": { "resolution": "R1080P", "preset": "HIGH", "fps": 78 },
  "shareCode": "a7Kd92"
}
```

### تخمین FPS

```
POST /fps-estimate
{ "gameId": "...", "cpuId": "...", "gpuId": "...", "ramGb": 16,
  "presets": ["MEDIUM", "HIGH", "ULTRA"],
  "resolutions": ["R1080P", "R1440P", "R2160P"],
  "upscaler": "NONE", "rayTracing": false }
```

```jsonc
{
  "results": [
    { "resolution": "R1080P", "preset": "HIGH",
      "fps": 78, "onePercentLow": 52, "range": [70, 86],
      "limitedBy": "GPU", "bottleneckPercent": 18 }
  ],
  "confidence": "medium",
  "basedOnSamples": 24,
  "shareCode": "b3Xy71"
}
```

خروجی را به‌صورت ماتریس بده نه تک‌نقطه — هزینه‌ی محاسبه‌اش صفر است و UI می‌تواند بدون رفت‌وبرگشت
دوباره، بین پریست‌ها سوییچ کند.

### گلوگاه

```
POST /bottleneck
{ "cpuId": "...", "gpuId": "...", "gameId": "..." | null, "ramGb": 16 }
```

```jsonc
{
  "overall": { "limitedBy": "CPU", "percent": 27, "label": "گلوگاه قابل‌توجه" },
  "byResolution": [
    { "resolution": "R1080P", "limitedBy": "CPU", "percent": 34, "fps": 96 },
    { "resolution": "R1440P", "limitedBy": "CPU", "percent": 11, "fps": 88 },
    { "resolution": "R2160P", "limitedBy": "GPU", "percent": 22, "fps": 54 }
  ],
  "suggestions": [
    { "replace": "CPU", "withId": "...", "withName": "Ryzen 7 5800X3D", "newPercent": 6 }
  ]
}
```

### اسنپ‌شات اشتراک‌گذاری

```
GET /c/{publicCode}
```

`resultJson` منجمدشده را برمی‌گرداند، بدون محاسبه‌ی دوباره.

---

## کارهایی که راحت فراموش می‌شوند

- [ ] rate limit روی endpoint های محاسباتی (`@fastify/rate-limit` از قبل در `register.ts` هست)
- [ ] لاگ سرچ‌های بی‌نتیجه — بهترین منبع alias های جدید
- [ ] `engineVersion` را بعد از هر کالیبراسیون بالا ببر تا کش Redis بی‌اثر شود
- [ ] برچسب اطمینان در UI. تخمین اشتباه با برچسب «تخمینی» قابل بخشش است، بدون برچسب نه
- [ ] attribution منابع در فوتر
- [ ] job زمان‌بندی‌شده برای re-import ماهانه (قطعات جدید مدام می‌آیند)
