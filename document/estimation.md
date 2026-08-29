# موتور تخمین

همه‌ی اعداد این فایل **نقطه‌ی شروع** هستند، نه حقیقت مطلق. بعد از اینکه `FpsSample` واقعی جمع شد،
کالیبراسیون جای اکثرشان را می‌گیرد. تا آن موقع همین‌ها خروجی قابل‌دفاعی می‌دهند.

---

## مرحله ۱ — نرمال‌سازی سخت‌افزار به یک عدد

هدف: تبدیل ده‌ها فیلد مشخصات و چند بنچمارک به یک عدد ۰ تا ۱۰۰.

### وزن بنچمارک‌ها

مقدار `Benchmark.weightInIndex` و `Benchmark.category` هنگام seed:

**GPU** (`category = "gpu-gaming"`):

| بنچمارک | slug | وزن | پوشش |
| --- | --- | --- | --- |
| 3DMark Time Spy (Graphics) | `3dmark-time-spy` | 0.30 | DX12، کارت‌های ۲۰۱۶ به بعد |
| 3DMark Steel Nomad | `3dmark-steel-nomad` | 0.30 | نسل جدید |
| PassMark G3D Mark | `passmark-g3d` | 0.30 | تقریباً همه‌چیز، از جمله کارت‌های قدیمی |
| 3DMark Fire Strike (Graphics) | `3dmark-fire-strike` | 0.10 | DX11، پوشش کارت‌های خیلی قدیمی |

بنچمارک‌های `category = "gpu-compute"` (Geekbench OpenCL/Vulkan، Blender Cycles) با
`weightInIndex = 0` وارد `gamingIndex` نمی‌شوند و فقط `computeIndex` را می‌سازند — چون یک کارت
workstation در Blender عالی است ولی در بازی نه.

**CPU:**

| بنچمارک | slug | category | وزن |
| --- | --- | --- | --- |
| PassMark Single Thread Rating | `passmark-cpu-single` | `cpu-single` | 0.70 |
| Geekbench 6 Single-Core | `geekbench6-single` | `cpu-single` | 0.30 |
| PassMark CPU Mark | `passmark-cpu-multi` | `cpu-multi` | 0.65 |
| Geekbench 6 Multi-Core | `geekbench6-multi` | `cpu-multi` | 0.35 |

### فرمول

```
// برای هر بنچمارک، امتیاز را نسبت به بهترین قطعه نرمال کن
n(h, b) = score(h, b) / maxScore(b)

// میانگین وزنی، فقط روی بنچمارک‌هایی که این قطعه دارد
raw(h) = Σ_b  w_b · n(h, b)  /  Σ_b  w_b

// مقیاس نهایی
index(h) = 100 · raw(h) / max_h raw(h)
```

برای CPU دو بار محاسبه می‌شود (یک بار روی `cpu-single`، یک بار روی `cpu-multi`) و بعد:

```
singleThreadIndex = index بر اساس cpu-single
multiThreadIndex  = index بر اساس cpu-multi
gamingIndex       = 100 × normalize(0.65 × singleRaw + 0.35 × multiRaw)
```

نسبت ۶۵/۳۵ چون بازی‌ها هنوز عمدتاً single-thread هستند، ولی موتورهای جدید (UE5، RAGE9) به
multi حساس‌ترند. اگر بعداً دیتای FPS نشان داد این نسبت خطا می‌دهد، همین یک عدد را عوض کن.

### قطعاتی که بنچمارک ندارند

اگر یک قطعه هیچ بنچمارکی با وزن ≥ ۰٫۳ نداشت، `gamingIndex` را از روی مشخصات تخمین بزن و
`quality = ESTIMATED` بگذار:

```
// یک رگرسیون خطی که روی قطعاتی که هم مشخصات دارند هم بنچمارک، fit می‌شود
GPU:  ln(index) ~ ln(shadingUnits × boostClockMhz) + ln(bandwidthGbps) + architectureFactor
CPU:  ln(index) ~ ln(performanceCores + 0.5 × efficiencyCores) + ln(boostClockMhz) + architectureFactor
```

`architectureFactor` یک ضریب per-architecture است که همان رگرسیون یاد می‌گیرد (IPC نسل).

### اجرا

job نرمال‌سازی بعد از **هر** import بنچمارک اجرا می‌شود و `indexCalculatedAt` را می‌نویسد.
چون `maxScore(b)` با آمدن یک کارت جدید عوض می‌شود، این job همیشه **همه‌ی** ردیف‌ها را بازمحاسبه
می‌کند، نه فقط تغییریافته‌ها.

---

## مرحله ۲ — مدل FPS

نقطه‌ی مرجع همه‌جا: **1080p / HIGH / بدون upscaler / بدون ray tracing**.

```ts
const S = scaling(gameId, resolution, preset, upscaler, rayTracing); // ضریب GPU
const C = CPU_PRESET_FACTOR[preset];

const fpsGpu = profile.gpuCoef * gpuIndex ** profile.gpuExponent * S;
const fpsCpu = profile.cpuCoef * cpuIndex ** profile.cpuExponent * C;

// soft-min: نه min خشک، نه میانگین
const k = profile.blendK;                       // پیش‌فرض ۸
let fps = (fpsGpu ** -k + fpsCpu ** -k) ** (-1 / k);

fps *= vramPenalty * ramPenalty;
```

**چرا `fpsCpu` ضریب رزولوشن نمی‌گیرد؟** چون کار CPU (منطق بازی، draw call، فیزیک) با تعداد پیکسل
تغییر نمی‌کند. همین یک عدم‌تقارن است که باعث می‌شود سیستم در 720p محدود به CPU و در 4K محدود
به GPU شود — و محاسبه‌گر گلوگاه دقیقاً از همین بیرون می‌آید.

**چرا soft-min و نه `Math.min`؟** چون در سیستم متعادل، FPS واقعی کمی **پایین‌تر** از هر دو سقف
است. با `k = 8`، وقتی `fpsGpu === fpsCpu` خروجی `0.917 ×` آن مقدار می‌شود؛ و هرچه دو سقف از هم
دورتر شوند خروجی به `min` همگرا می‌شود.

| k | افت در حالت کاملاً متعادل |
| --- | --- |
| 4 | ۱۶٪ |
| 6 | ۱۱٪ |
| **8** | **۸٪** |
| 12 | ۶٪ |

---

## جدول پیش‌فرض scaling

`DefaultScaling` را فقط برای شبکه‌ی `resolution × preset` با `upscaler = NONE` و
`rayTracing = false` سیدکن (۲۴ ردیف). ray tracing و upscaler به‌صورت ضریب جداگانه در کد اعمال
می‌شوند، چون تقریباً مستقل‌اند. `GameScaling` هر کدام از این‌ها را می‌تواند override کند.

### ضریب رزولوشن (روی preset = HIGH)

| رزولوشن | ضریب |
| --- | --- |
| `R720P` | 1.55 |
| `R1080P` | 1.00 |
| `R1440P` | 0.66 |
| `UW1440P` (3440×1440) | 0.53 |
| `R2160P` | 0.38 |
| `UW2160P` (5120×2160) | 0.30 |

### ضریب پریست روی GPU

| پریست | ضریب |
| --- | --- |
| `LOW` | 1.45 |
| `MEDIUM` | 1.18 |
| `HIGH` | 1.00 |
| `ULTRA` | 0.87 |

ردیف‌های `DefaultScaling` حاصل‌ضرب این دو هستند: مثلاً `R1440P` + `ULTRA` → `0.66 × 0.87 = 0.574`.

### ضریب پریست روی CPU

```ts
const CPU_PRESET_FACTOR = { LOW: 1.10, MEDIUM: 1.04, HIGH: 1.00, ULTRA: 0.98 };
```

تنظیمات گرافیکی تقریباً روی CPU اثر ندارند؛ آن مقدار کم هم از سایه‌ها و density مربوط می‌شود.

### ضریب ray tracing

```ts
const RT_FACTOR = 0.55;   // پیش‌فرض عمومی
```

این عدد عمداً محافظه‌کارانه است. هزینه‌ی RT شدیداً وابسته به بازی است (سایه‌ی RT در یک بازی ۱۰٪
می‌گیرد، path tracing در Cyberpunk بیش از ۷۰٪). به محض اینکه برای یک بازی نمونه‌ی RT داشتی،
`GameScaling` مقدار واقعی را جای این می‌گذارد.

### ضریب upscaler

بر اساس نسبت رزولوشن رندر:

| Upscaler | رندر | ضریب |
| --- | --- | --- |
| `*_QUALITY` | 67٪ | 1.40 |
| `*_BALANCED` | 58٪ | 1.55 |
| `*_PERFORMANCE` | 50٪ | 1.75 |

DLSS و FSR و XeSS از نظر کارایی تقریباً یکی هستند؛ تفاوتشان کیفیت تصویر است.
**قبل از اعمال، پشتیبانی کارت را چک کن** (`Gpu.dlssVersion` / `fsrVersion` / `supportsXess`) و اگر
پشتیبانی نمی‌کند به کاربر بگو، نه اینکه بی‌صدا ضریب را نادیده بگیری.

Frame generation عمداً در ضریب FPS دخالت داده نمی‌شود چون فریم‌های تولیدی latency را کم نمی‌کنند.
اگر خواستی نمایشش بدهی، به‌صورت یک عدد جدا («با Frame Gen ≈ ۱٫۸ برابر») نشان بده نه در خود تخمین.

---

## جریمه‌ی کمبود حافظه

```ts
const vramRatio = gpu.vramGb / need(resolution, preset);
const vramPenalty = vramRatio >= 1 ? 1 : clamp(0.35 + 0.65 * vramRatio, 0.35, 1);

const ramRatio = input.ramGb / profile.ramNeedGb;
const ramPenalty = ramRatio >= 1 ? 1 : clamp(0.5 + 0.5 * ramRatio, 0.5, 1);
```

`need` از `GameProfile.vramNeedGb` می‌آید. مقدار پیش‌فرض بر حسب `DemandTier` وقتی بازی پروفایل
کالیبره ندارد:

| tier | 1080p HIGH | 1440p HIGH | 4K HIGH | 4K ULTRA |
| --- | --- | --- | --- | --- |
| `LIGHT` | 3 | 4 | 5 | 6 |
| `MEDIUM` | 5 | 6 | 8 | 9 |
| `HEAVY` | 7 | 8 | 10 | 12 |
| `EXTREME` | 9 | 11 | 13 | 16 |

`ramNeedGb` پیش‌فرض: `LIGHT` 8، `MEDIUM` 12، `HEAVY` 16، `EXTREME` 24.

کمبود VRAM در واقعیت بیشتر به‌شکل stutter ظاهر می‌شود تا افت میانگین، پس در `onePercentLow`
جریمه‌ی اضافه هم می‌خورد (پایین‌تر).

---

## ۱٪ Low

```ts
const cpuHeadroom = clamp(fpsCpu / fpsGpu - 1, 0, 1);
let lowRatio = 0.58 + 0.18 * cpuHeadroom;      // 0.58 .. 0.76
if (vramRatio < 1) lowRatio *= 0.85;           // کمبود VRAM اول lows را می‌زند
const onePercentLow = fps * lowRatio;
```

منطق: هرچه CPU نسبت به GPU سرتر باشد، فریم‌تایم یکنواخت‌تر است. سیستمی که CPU-bound است
(`cpuHeadroom = 0`) پایین‌ترین نسبت را می‌گیرد.

---

## گلوگاه

هیچ دیتای اضافه‌ای نمی‌خواهد — همان `fpsGpu` و `fpsCpu`:

```ts
const limiting = fpsCpu < fpsGpu ? 'CPU' : 'GPU';
const severity = ((Math.max(fpsGpu, fpsCpu) - Math.min(fpsGpu, fpsCpu)) / Math.max(fpsGpu, fpsCpu)) * 100;
```

| درصد | برچسب |
| --- | --- |
| < ۱۰ | متعادل |
| ۱۰ تا ۲۵ | گلوگاه خفیف |
| ۲۵ تا ۴۵ | گلوگاه قابل‌توجه |
| > ۴۵ | گلوگاه شدید |

**نکته‌ی محصولی:** خروجی را برای هر چهار رزولوشن با هم بده. چون `fpsCpu` ثابت است و `fpsGpu` با
رزولوشن پایین می‌آید، جدول نشان می‌دهد گلوگاه از CPU به GPU جابه‌جا می‌شود — و این دقیقاً همان
چیزی است که کاربر می‌خواهد ببیند. اگر بازی انتخاب نشده بود، از یک پروفایل «متوسط» ساخته‌شده از
میانگین بازی‌های `MEDIUM` استفاده کن و صریح بگو که میانگین است.

---

## مقادیر cold-start

برای بازی‌هایی که `FpsSample` ندارند (اکثریت مطلق کاتالوگ). بر اساس `Game.demandTier`:

```ts
const COLD_START: Record<DemandTier, Omit<Coefficients, 'blendK'>> = {
  LIGHT:   { gpuCoef: 28.5, gpuExponent: 0.75, cpuCoef: 7.0, cpuExponent: 1.0 },
  MEDIUM:  { gpuCoef:  8.75, gpuExponent: 0.82, cpuCoef: 3.0, cpuExponent: 1.0 },
  HEAVY:   { gpuCoef:  3.83, gpuExponent: 0.88, cpuCoef: 1.8, cpuExponent: 1.0 },
  EXTREME: { gpuCoef:  2.02, gpuExponent: 0.92, cpuCoef: 1.3, cpuExponent: 1.0 },
};
```

نمونه‌ی مرجع هر tier: `LIGHT` = CS2 / Valorant، `MEDIUM` = Fortnite / GTA V / Apex،
`HEAVY` = Cyberpunk 2077 / RDR2 / Starfield، `EXTREME` = Alan Wake 2 / Black Myth Wukong.

توان GPU عمداً کمتر از ۱ است: بازی‌های سبک با کارت ضعیف هم FPS بالا می‌دهند، پس منحنی‌شان
مسطح‌تر است. بازی‌های سنگین به خطی نزدیک‌ترند.

### تعیین خودکار `demandTier`

از `gamingIndex` سخت‌افزار توصیه‌شده در `GameRequirement(tier = RECOMMENDED)`:

| بیشترین `gamingIndex` بین GPU های recommended | tier |
| --- | --- |
| < 8 | `LIGHT` |
| 8 تا 18 | `MEDIUM` |
| 18 تا 32 | `HEAVY` |
| ≥ 32 | `EXTREME` |

بعد از ingest، ۵۰ بازی محبوب را دستی مرور کن — تولیدکننده‌ها گاهی requirement را غیرواقعی
می‌نویسند.

### درستی‌سنجی سریع اعداد بالا

RTX 4060 (`gamingIndex ≈ 25`) + Ryzen 5 3600 (`gamingIndex ≈ 45`)، Cyberpunk 2077، 1080p HIGH:

```
fpsGpu = 3.83 × 25^0.88 = 65
fpsCpu = 1.8  × 45^1.00 = 81
fps    = (65^-8 + 81^-8)^(-1/8) ≈ 64
گلوگاه = (81 − 65) / 81 = ۲۰٪ روی GPU
```

اندازه‌گیری واقعی این ترکیب حدود ۶۰ تا ۶۵ FPS است. cold-start بدون هیچ دیتای FPS این را می‌دهد؛
با کالیبراسیون بهتر هم می‌شود.

---

## کالیبراسیون

job ای که برای هر بازی با نمونه‌ی کافی اجرا می‌شود و `GameProfile` + `GameScaling` را می‌نویسد.

### حداقل دیتای لازم

| چیزی که fit می‌شود | حداقل |
| --- | --- |
| منحنی GPU | ۶ نمونه روی حداقل ۴ GPU متمایز |
| منحنی CPU | ۴ نمونه روی حداقل ۳ CPU متمایز |
| یک ردیف `GameScaling` | ۳ نمونه در همان سطل |

هر چیزی که به حد نصاب نرسد، مقدار cold-start خودش را نگه می‌دارد. `isCalibrated` فقط وقتی `true`
می‌شود که منحنی GPU fit شده باشد.

### الگوریتم

چون مدل توانی است، در فضای لگاریتمی خطی می‌شود و با weighted OLS حل می‌شود:

```
ln(fps) = ln(coef) + exponent · ln(index)
```

**گام ۱ — انتخاب نمونه برای منحنی GPU.** فقط نمونه‌هایی که CPU در آن‌ها محدودکننده نیست:
`cpuIndex ≥ 80` یا `resolution ≥ R1440P`.

**گام ۲ — برگرداندن به نقطه‌ی مرجع.** هر نمونه را بر ضریب scaling خودش تقسیم کن (پاس اول با
`DefaultScaling`):

```ts
const y = sample.avgFps / scaling(sample.resolution, sample.preset, sample.upscaler, sample.rayTracing);
const x = gpu.gamingIndex;
```

**گام ۳ — weighted OLS.** وزن هر نمونه `confidence` آن است:

```ts
const X = Math.log(x), Y = Math.log(y), w = sample.confidence;
// جمع‌ها روی همه‌ی نمونه‌ها
const b = (Sw * Sxy - Sx * Sy) / (Sw * Sxx - Sx * Sx);   // exponent
const a = (Sy - b * Sx) / Sw;                            // ln(coef)

profile.gpuExponent = clamp(b, 0.6, 1.15);
profile.gpuCoef = Math.exp(a);
```

clamp کردن توان ضروری است: با دیتای کم، رگرسیون راحت به توان ۰٫۲ یا ۲٫۵ می‌رسد که فیزیکی نیست.

**گام ۴ — منحنی CPU.** همان کار روی نمونه‌هایی با `gpuIndex ≥ 85` و `resolution ≤ R1080P`،
با تقسیم بر `CPU_PRESET_FACTOR`.

**گام ۵ — `GameScaling`.** حالا که منحنی مرجع را داری، برای هر سطل تنظیمات با ≥ ۳ نمونه:

```ts
multiplier = weightedMean(sample.avgFps / predictedReferenceFps(sample));
```

**گام ۶ — تکرار.** گام ۲ تا ۵ را یک بار دیگر اجرا کن، این بار با `GameScaling` تازه به‌جای
`DefaultScaling`. دو پاس کافی است؛ تفاوت پاس سوم کمتر از خطای اندازه‌گیری است.

**گام ۷ — `blendK`.** اگر ≥ ۱۵ نمونه داری، `k` را روی `{4, 6, 8, 10, 12}` جست‌وجو کن و هرکدام
خطای hold-out را کمینه کرد بردار. زیر ۱۵ نمونه، همان ۸ را نگه دار.

**گام ۸ — ثبت.** `rSquared` (در فضای log)، `sampleCount`، `calibratedAt`،
`calibrationVersion` را بنویس و `isCalibrated = true` کن.

### اعتبارسنجی

قبل از نوشتن نتیجه، ۲۰٪ نمونه‌ها را کنار بگذار و روی همان‌ها بسنج:

| معیار | هدف |
| --- | --- |
| MAPE | < ۱۵٪ |
| صدک ۹۰ خطای مطلق درصدی | < ۲۵٪ |
| یکنواختی | با ثابت‌بودن بقیه‌ی ورودی‌ها، `gpuIndex` بیشتر نباید FPS کمتر بدهد |

اگر MAPE بدتر از cold-start همان tier شد، **نتیجه را ننویس** و بازی را برای بازبینی flag کن —
تقریباً همیشه یعنی یکی از نمونه‌ها به سخت‌افزار اشتباه match شده.

---

## جایگاه در کد

```
src/app/modules/estimation/
├── estimation.constants.ts   جدول‌های بالا: scaling، cold-start، جریمه‌ها
├── estimation.engine.ts      توابع خالص. بدون Prisma، بدون Redis، بدون async
├── estimation.service.ts     خواندن profile/scaling، کش، صدا زدن engine
├── estimation.controller.ts
└── jobs/
    ├── hardware-index.job.ts
    └── calibration.job.ts
```

**`estimation.engine.ts` باید کاملاً خالص باشد.** ورودی‌اش یک آبجکت ساده است و خروجی‌اش یک آبجکت
ساده. این تنها راهی است که بتوانی صدها تست روی ترکیب‌های واقعی بنویسی و فرمول را بدون ترس عوض کنی:

```ts
export interface EstimateInput {
  gpuIndex: number;
  cpuIndex: number;
  vramGb: number;
  ramGb: number;
  resolution: ScreenResolution;
  preset: QualityPreset;
  upscaler: Upscaler;
  rayTracing: boolean;
  profile: Coefficients;      // از GameProfile یا cold-start
  scaling: number;            // از GameScaling یا DefaultScaling
  vramNeedGb: number;
}

export interface EstimateOutput {
  fps: number;
  onePercentLow: number;
  fpsGpu: number;             // سقف GPU، قبل از blend — ورودی محاسبه‌گر گلوگاه
  fpsCpu: number;             // سقف CPU
  limitedBy: 'CPU' | 'GPU';
  bottleneckPercent: number;
  vramPenalty: number;
  ramPenalty: number;
  confidence: 'high' | 'medium' | 'low';   // از isCalibrated و rSquared و sampleCount
}
```

### کش

خروجی سرویس در Redis (که از قبل در پروژه هست) کش می‌شود:

```
est:v{engineVersion}:{gameId}:{gpuId}:{cpuId}:{ramGb}:{resolution}:{preset}:{upscaler}:{rt}
TTL = ۲۴ ساعت
```

بعد از هر اجرای کالیبراسیون `engineVersion` را بالا ببر تا کل کش به‌جای پاک‌شدن، بی‌اثر شود.

### `confidence` که به کاربر نشان می‌دهی

| شرط | برچسب |
| --- | --- |
| `isCalibrated && rSquared > 0.9 && sampleCount >= 15` | بالا |
| `isCalibrated` | متوسط |
| در غیر این صورت (cold-start) | تخمینی |

این را حتماً در UI بیاور. تخمین اشتباه با برچسب «تخمینی» قابل بخشش است؛ همان تخمین بدون برچسب،
اعتماد کاربر را می‌سوزاند.
