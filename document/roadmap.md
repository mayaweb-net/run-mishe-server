# نقشه راه

تخمین‌های زمانی برای یک نفر تمام‌وقت است. هر فاز یک «تعریف تمام‌شده» دارد که قابل دمو باشد —
عمداً طوری چیده شده که از فاز ۳ به بعد در هر فاز چیزی قابل انتشار داشته باشی.

## وضعیت شروع

| بخش | وضعیت |
| --- | --- |
| `run-mishe-server` | اسکلت NestJS + Fastify + Prisma + Postgres + Redis. فقط مدل `User`. `src/app/modules/` خالی است |
| `run-mishe-client` | Next 16، سه صفحه (`/`, `/review`, `/fps`)، همه از mock در `src/config/*.ts` تغذیه می‌شوند. هیچ لایه‌ی fetch ای وجود ندارد |
| `run-mishe-admin` | React + Vite، لایه‌ی UI در حال ساخت |

---

## فاز ۰ — پایه‌ی دیتا · ~۱ هفته

- [x] نوشتن مدل‌های Prisma
- [x] رفع ناهماهنگی مسیر seed در `prisma.config.ts` (به `seed/seed.ts` اشاره می‌کند)
- [ ] `prisma migrate dev --create-only`، افزودن SQL دستی از [`data-model.md`](./data-model.md#چیزهایی-که-باید-دستی-به-migration-اضافه-شوند)، سپس apply
- [ ] seed جدول‌های ثابت: `Benchmark` (بقیه‌ی ردیف‌ها)، `DefaultScaling` (۲۴ ردیف)
- [ ] ماژول `hardware`: سرچ trigram روی `HardwareAlias`
- [ ] ماژول `games`: سرچ trigram

**تمام‌شده وقتی:** `GET /hardware/gpus?q=3060` و `GET /games?q=cyber` جواب درست می‌دهند.

---

## فاز ۱ — کاتالوگ سخت‌افزار · ~۱ تا ۲ هفته

- [x] کاتالوگ ۲۵۰ GPU (۱۷۹ دسکتاپ + ۷۱ لپ‌تاپ) با مشخصات کامل
- [x] کاتالوگ ۲۵۰ CPU دسکتاپ با مشخصات کامل
- [x] تولید alias (۶۳۸ برای GPU، ۷۹۰ برای CPU) بدون هیچ برخوردی
- [x] `Gpu.gamingIndex` از شاخص GPU Ark، ذخیره‌شده در `GpuBenchmarkScore` تا بازتولیدپذیر بماند
- [ ] **منبع بنچمارک CPU** — بلاک‌کننده‌ی `Cpu.gamingIndex`، جزئیات در
      [`data-sources.md`](./data-sources.md#شکاف-باز-cpugamingindex)
- [ ] `hardware-index.job.ts` — بازمحاسبه‌ی `gamingIndex` از روی `*BenchmarkScore`
- [ ] رگرسیون fallback برای قطعات بدون بنچمارک (`quality = ESTIMATED`)

**تمام‌شده وقتی:** بیش از ۸۵٪ GPU ها و CPU ها `gamingIndex` دارند، و مرتب‌سازی بر اساس آن با
رنکینگ‌های شناخته‌شده‌ی بازار همخوان است (این را چشمی چک کن، پنج دقیقه وقت می‌برد و خطاهای فاحش
را نشان می‌دهد).

> GPU ها الان ۱۰۰٪ پوشش دارند، CPU ها صفر. تا وقتی منبع بنچمارک CPU پیدا نشود، فاز ۳ (که به
> `fpsCpu` نیاز دارد) نمی‌تواند شروع شود.

**دستاورد قابل انتشار:** صفحات `/parts/cpu` و `/parts/gpu` که همین حالا در
`src/config/navigation.ts` لینک دارند ولی صفحه ندارند.

---

## فاز ۲ — کاتالوگ بازی · ~۱ هفته

- [ ] importer IGDB (نام، تاریخ، ژانر، کاور، موتور)
- [ ] importer Steam برای `pc_requirements`
- [ ] parser متن requirement → `GameRequirementOption`
- [ ] محاسبه‌ی `Game.demandTier` از روی سخت‌افزار recommended
- [ ] مرور دستی ۵۰ بازی محبوب

**تمام‌شده وقتی:** برای ۹۰٪ بازی‌های محبوب، هر دو tier حداقل یک option با `matchScore > 0.75` دارند.

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
