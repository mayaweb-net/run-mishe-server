# Run Mishe — از صفر تا دیتای آماده

همه‌ی دستورها از **ریشه‌ی `run-mishe-server`** اجرا می‌شوند.

```text
Docker (Postgres + Redis)
  → .env + pnpm install
  → prisma generate / migrate / seed
  → crawl PassMark
  → import benchmarks
  → index hardware (gamingIndex)
```

---

## ۱) وابستگی‌ها و env

```bash
pnpm install
cp .env.example .env
```

مقدار پیش‌فرض دیتابیس (با Compose پایین یکی است):

```text
DATABASE_URL=postgresql://run-mishe:run-mishe@localhost:55432/run-mishe
```

Redis در `.env`:

```text
REDIS_HOST=localhost
REDIS_PORT=16363
REDIS_PASSWORD=run-mishe
```

---

## ۲) بالا آوردن دیتابیس و Redis

```bash
docker compose -f docker/pg.docker-compose.yml up -d
docker compose -f docker/redis.docker-compose.yml up -d
```

| سرویس    | پورت میزبان | داخل کانتینر |
| -------- | ----------- | ------------ |
| Postgres | `55432`     | `5432`       |
| Redis    | `16363`     | `6379`       |

وضعیت:

```bash
docker compose -f docker/pg.docker-compose.yml ps
docker compose -f docker/redis.docker-compose.yml ps
```

خاموش کردن:

```bash
docker compose -f docker/pg.docker-compose.yml down
docker compose -f docker/redis.docker-compose.yml down
```

حذف volume پستگرس (دیتای DB پاک می‌شود):

```bash
docker compose -f docker/pg.docker-compose.yml down -v
```

---

## ۳) اسکیما + seed کاتالوگ

```bash
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm exec prisma db seed
```

Seed می‌ریزد:

- GPU / CPU + alias
- بازی‌ها + requirement options
- تعریف بنچمارک‌ها + اسکور GPU Ark (GPI)

چک آفلاین (بدون DB):

```bash
pnpm exec tsx src/app/db/prisma/seed/hardware/verify.ts
pnpm exec tsx src/app/db/prisma/seed/games/verify-requirements.ts
```

مرور UI دیتابیس (اختیاری):

```bash
pnpm prisma:studio
```

---

## ۴) بنچمارک PassMark → اسکور → index

این مرحله اینترنت می‌خواهد (crawl) و ممکن است چند دقیقه طول بکشد.

```bash
# فقط PassMark (3DMark عمداً خالی است)
pnpm crawler:cpu -- --source passmark
pnpm crawler:gpu -- --source passmark

# JSONL → جدول *BenchmarkScore
pnpm import:benchmarks

# ساخت gamingIndex برای CPU و GPU
pnpm index:hardware
```

خروجی خام (gitignored):

```text
data/benchmarks/cpu/passmark/
data/benchmarks/gpu/passmark/
data/benchmarks/*/missed/passmark/   ← gapهای واقعی
data/benchmarks/gpu/missed/3dmark/  ← نویز؛ نادیده بگیر
```

اگر crawl قبلاً گرفته شده و فقط می‌خواهی دوباره وارد/ایندکس کنی:

```bash
pnpm import:benchmarks
pnpm index:hardware
```

---

## ۵) سرور API (اختیاری)

```bash
pnpm start:dev
```

پیش‌فرض: `http://localhost:4002/api`  
ادمین: لیست CPU / GPU / Game

---

## چک‌لیست سریع «دیتا آماده‌ست؟»

- [ ] Postgres و Redis بالا هستند
- [ ] `prisma db seed` بدون خطا تمام شده
- [ ] `import:benchmarks` برای CPU/GPU `rejected` نزدیک صفر دارد
- [ ] `index:hardware` تقریباً همه‌ی CPU/GPUها را `updated` کرده
- [ ] در Studio یا ادمین، `gamingIndex` روی CPU و GPU پر است

---

## مسیر کامل یک‌جا (کپی)

```bash
pnpm install
cp .env.example .env

docker compose -f docker/pg.docker-compose.yml up -d
docker compose -f docker/redis.docker-compose.yml up -d

pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm exec prisma db seed

pnpm crawler:cpu -- --source passmark
pnpm crawler:gpu -- --source passmark
pnpm import:benchmarks
pnpm index:hardware

pnpm start:dev
```

جزئیات بیشتر:

- معماری دیتا: [`../document/README.md`](../document/README.md)
- بنچمارک: [`../scripts/benchmarks/README.md`](../scripts/benchmarks/README.md)
- فرمول index: [`../document/estimation.md`](../document/estimation.md)
