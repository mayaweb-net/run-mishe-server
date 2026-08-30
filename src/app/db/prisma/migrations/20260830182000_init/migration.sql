-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "hardware_kind" AS ENUM ('CPU', 'GPU');

-- CreateEnum
CREATE TYPE "vendor" AS ENUM ('INTEL', 'AMD', 'NVIDIA', 'APPLE', 'QUALCOMM', 'ARM', 'OTHER');

-- CreateEnum
CREATE TYPE "form_factor" AS ENUM ('DESKTOP', 'LAPTOP', 'SERVER', 'INTEGRATED', 'CONSOLE');

-- CreateEnum
CREATE TYPE "quality_preset" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'ULTRA');

-- CreateEnum
CREATE TYPE "screen_resolution" AS ENUM ('R720P', 'R1080P', 'R1440P', 'R2160P', 'UW1440P', 'UW2160P');

-- CreateEnum
CREATE TYPE "upscaler" AS ENUM ('NONE', 'DLSS_QUALITY', 'DLSS_BALANCED', 'DLSS_PERFORMANCE', 'FSR_QUALITY', 'FSR_BALANCED', 'FSR_PERFORMANCE', 'XESS_QUALITY', 'XESS_BALANCED');

-- CreateEnum
CREATE TYPE "requirement_tier" AS ENUM ('MINIMUM', 'RECOMMENDED', 'HIGH', 'ULTRA');

-- CreateEnum
CREATE TYPE "demand_tier" AS ENUM ('LIGHT', 'MEDIUM', 'HEAVY', 'EXTREME');

-- CreateEnum
CREATE TYPE "data_quality" AS ENUM ('VERIFIED', 'IMPORTED', 'ESTIMATED');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "import_record_status" AS ENUM ('PENDING', 'APPLIED', 'SKIPPED', 'NEEDS_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "moderation_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "check_kind" AS ENUM ('RUN_CHECK', 'FPS', 'BOTTLENECK');

-- CreateTable
CREATE TABLE "user_builds" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousId" TEXT,
    "name" TEXT,
    "cpuId" TEXT NOT NULL,
    "gpuId" TEXT NOT NULL,
    "ramGb" INTEGER NOT NULL,
    "storageIsSsd" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_builds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_snapshots" (
    "id" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "kind" "check_kind" NOT NULL,
    "gameId" TEXT,
    "cpuId" TEXT NOT NULL,
    "gpuId" TEXT NOT NULL,
    "ramGb" INTEGER NOT NULL,
    "inputJson" JSONB NOT NULL,
    "resultJson" JSONB NOT NULL,
    "engineVersion" INTEGER NOT NULL DEFAULT 1,
    "userId" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmarks" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "target" "hardware_kind" NOT NULL,
    "category" TEXT,
    "version" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'points',
    "higherIsBetter" BOOLEAN NOT NULL DEFAULT true,
    "weightInIndex" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cpu_benchmark_scores" (
    "id" TEXT NOT NULL,
    "cpuId" TEXT NOT NULL,
    "benchmarkId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "minScore" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "sampleCount" INTEGER,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cpu_benchmark_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gpu_benchmark_scores" (
    "id" TEXT NOT NULL,
    "gpuId" TEXT NOT NULL,
    "benchmarkId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "minScore" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "sampleCount" INTEGER,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gpu_benchmark_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fps_samples" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gpuId" TEXT NOT NULL,
    "cpuId" TEXT NOT NULL,
    "resolution" "screen_resolution" NOT NULL,
    "preset" "quality_preset" NOT NULL,
    "upscaler" "upscaler" NOT NULL DEFAULT 'NONE',
    "rayTracing" BOOLEAN NOT NULL DEFAULT false,
    "frameGen" BOOLEAN NOT NULL DEFAULT false,
    "ramGb" INTEGER,
    "avgFps" DOUBLE PRECISION NOT NULL,
    "onePercentLow" DOUBLE PRECISION,
    "minFps" DOUBLE PRECISION,
    "maxFps" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fps_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fps_submissions" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gpuId" TEXT NOT NULL,
    "cpuId" TEXT NOT NULL,
    "resolution" "screen_resolution" NOT NULL,
    "preset" "quality_preset" NOT NULL,
    "upscaler" "upscaler" NOT NULL DEFAULT 'NONE',
    "rayTracing" BOOLEAN NOT NULL DEFAULT false,
    "frameGen" BOOLEAN NOT NULL DEFAULT false,
    "ramGb" INTEGER,
    "avgFps" DOUBLE PRECISION NOT NULL,
    "onePercentLow" DOUBLE PRECISION,
    "submittedById" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "status" "moderation_status" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "promotedSampleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fps_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_profiles" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gpuCoef" DOUBLE PRECISION NOT NULL,
    "gpuExponent" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "cpuCoef" DOUBLE PRECISION NOT NULL,
    "cpuExponent" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "blendK" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "vramNeedGb" JSONB NOT NULL,
    "ramNeedGb" INTEGER NOT NULL DEFAULT 16,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "rSquared" DOUBLE PRECISION,
    "isCalibrated" BOOLEAN NOT NULL DEFAULT false,
    "calibratedAt" TIMESTAMP(3),
    "calibrationVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_scalings" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "resolution" "screen_resolution" NOT NULL,
    "preset" "quality_preset" NOT NULL,
    "upscaler" "upscaler" NOT NULL DEFAULT 'NONE',
    "rayTracing" BOOLEAN NOT NULL DEFAULT false,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_scalings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "default_scalings" (
    "id" TEXT NOT NULL,
    "resolution" "screen_resolution" NOT NULL,
    "preset" "quality_preset" NOT NULL,
    "upscaler" "upscaler" NOT NULL DEFAULT 'NONE',
    "rayTracing" BOOLEAN NOT NULL DEFAULT false,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "note" TEXT,

    CONSTRAINT "default_scalings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameFa" TEXT,
    "releaseDate" TIMESTAMP(3),
    "engine" TEXT,
    "developer" TEXT,
    "publisher" TEXT,
    "genres" TEXT[],
    "coverUrl" TEXT,
    "description" TEXT,
    "steamAppId" INTEGER,
    "igdbId" INTEGER,
    "demandTier" "demand_tier" NOT NULL DEFAULT 'MEDIUM',
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "popularity" INTEGER,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "quality" "data_quality" NOT NULL DEFAULT 'IMPORTED',
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_requirements" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "tier" "requirement_tier" NOT NULL,
    "rawCpuText" TEXT,
    "rawGpuText" TEXT,
    "os" TEXT,
    "ramGb" INTEGER,
    "vramGb" INTEGER,
    "storageGb" INTEGER,
    "directX" TEXT,
    "needsSsd" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_requirement_options" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "kind" "hardware_kind" NOT NULL,
    "cpuId" TEXT,
    "gpuId" TEXT,
    "matchedText" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_requirement_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cpus" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" "vendor" NOT NULL,
    "family" TEXT,
    "series" TEXT,
    "generation" INTEGER,
    "codename" TEXT,
    "architecture" TEXT,
    "socket" TEXT,
    "releaseDate" TIMESTAMP(3),
    "performanceCores" INTEGER NOT NULL,
    "efficiencyCores" INTEGER NOT NULL DEFAULT 0,
    "threads" INTEGER NOT NULL,
    "baseClockMhz" INTEGER,
    "boostClockMhz" INTEGER,
    "l2CacheMb" DOUBLE PRECISION,
    "l3CacheMb" DOUBLE PRECISION,
    "tdpWatt" INTEGER,
    "maxTempC" INTEGER,
    "processNodeNm" INTEGER,
    "formFactor" "form_factor" NOT NULL DEFAULT 'DESKTOP',
    "isUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "isX3d" BOOLEAN NOT NULL DEFAULT false,
    "integratedGpuId" TEXT,
    "memoryTypes" TEXT[],
    "memoryChannels" INTEGER,
    "maxMemoryGb" INTEGER,
    "pcieVersion" DOUBLE PRECISION,
    "pcieLanes" INTEGER,
    "instructionSets" TEXT[],
    "singleThreadIndex" DOUBLE PRECISION,
    "multiThreadIndex" DOUBLE PRECISION,
    "gamingIndex" DOUBLE PRECISION,
    "indexCalculatedAt" TIMESTAMP(3),
    "msrpUsd" INTEGER,
    "quality" "data_quality" NOT NULL DEFAULT 'IMPORTED',
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cpus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gpus" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" "vendor" NOT NULL,
    "family" TEXT,
    "series" TEXT,
    "generation" INTEGER,
    "architecture" TEXT,
    "codename" TEXT,
    "chip" TEXT,
    "releaseDate" TIMESTAMP(3),
    "shadingUnits" INTEGER,
    "tmus" INTEGER,
    "rops" INTEGER,
    "tensorCores" INTEGER,
    "rayTracingCores" INTEGER,
    "baseClockMhz" INTEGER,
    "boostClockMhz" INTEGER,
    "gameClockMhz" INTEGER,
    "memoryClockMhz" INTEGER,
    "vramGb" INTEGER,
    "memoryType" TEXT,
    "memoryBusBits" INTEGER,
    "bandwidthGbps" DOUBLE PRECISION,
    "busInterface" TEXT,
    "pcieVersion" DOUBLE PRECISION,
    "pcieLanes" INTEGER,
    "tdpWatt" INTEGER,
    "recommendedPsuW" INTEGER,
    "formFactor" "form_factor" NOT NULL DEFAULT 'DESKTOP',
    "isWorkstation" BOOLEAN NOT NULL DEFAULT false,
    "supportsRayTracing" BOOLEAN NOT NULL DEFAULT false,
    "dlssVersion" INTEGER,
    "fsrVersion" INTEGER,
    "supportsXess" BOOLEAN NOT NULL DEFAULT false,
    "supportsFrameGen" BOOLEAN NOT NULL DEFAULT false,
    "supportsMultiFrameGen" BOOLEAN NOT NULL DEFAULT false,
    "supportsAv1Encode" BOOLEAN NOT NULL DEFAULT false,
    "supportsAv1Decode" BOOLEAN NOT NULL DEFAULT false,
    "supportsCuda" BOOLEAN NOT NULL DEFAULT false,
    "directxVersion" TEXT,
    "vulkanVersion" TEXT,
    "openglVersion" TEXT,
    "maxDisplays" INTEGER,
    "gamingIndex" DOUBLE PRECISION,
    "computeIndex" DOUBLE PRECISION,
    "indexCalculatedAt" TIMESTAMP(3),
    "msrpUsd" INTEGER,
    "quality" "data_quality" NOT NULL DEFAULT 'IMPORTED',
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gpus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hardware_aliases" (
    "id" TEXT NOT NULL,
    "kind" "hardware_kind" NOT NULL,
    "alias" TEXT NOT NULL,
    "cpuId" TEXT,
    "gpuId" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hardware_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'PENDING',
    "stats" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_records" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "import_record_status" NOT NULL DEFAULT 'PENDING',
    "targetId" TEXT,
    "matchScore" DOUBLE PRECISION,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "import_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_builds_userId_idx" ON "user_builds"("userId");

-- CreateIndex
CREATE INDEX "user_builds_anonymousId_idx" ON "user_builds"("anonymousId");

-- CreateIndex
CREATE UNIQUE INDEX "check_snapshots_publicCode_key" ON "check_snapshots"("publicCode");

-- CreateIndex
CREATE INDEX "check_snapshots_kind_createdAt_idx" ON "check_snapshots"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "check_snapshots_gameId_idx" ON "check_snapshots"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "benchmarks_slug_key" ON "benchmarks"("slug");

-- CreateIndex
CREATE INDEX "benchmarks_target_isActive_idx" ON "benchmarks"("target", "isActive");

-- CreateIndex
CREATE INDEX "cpu_benchmark_scores_benchmarkId_score_idx" ON "cpu_benchmark_scores"("benchmarkId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "cpu_benchmark_scores_cpuId_benchmarkId_source_key" ON "cpu_benchmark_scores"("cpuId", "benchmarkId", "source");

-- CreateIndex
CREATE INDEX "gpu_benchmark_scores_benchmarkId_score_idx" ON "gpu_benchmark_scores"("benchmarkId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "gpu_benchmark_scores_gpuId_benchmarkId_source_key" ON "gpu_benchmark_scores"("gpuId", "benchmarkId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "fps_samples_dedupeKey_key" ON "fps_samples"("dedupeKey");

-- CreateIndex
CREATE INDEX "fps_samples_gameId_resolution_preset_idx" ON "fps_samples"("gameId", "resolution", "preset");

-- CreateIndex
CREATE INDEX "fps_samples_gameId_gpuId_idx" ON "fps_samples"("gameId", "gpuId");

-- CreateIndex
CREATE INDEX "fps_samples_gameId_cpuId_idx" ON "fps_samples"("gameId", "cpuId");

-- CreateIndex
CREATE INDEX "fps_submissions_status_createdAt_idx" ON "fps_submissions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "fps_submissions_gameId_status_idx" ON "fps_submissions"("gameId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "game_profiles_gameId_key" ON "game_profiles"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "game_scalings_gameId_resolution_preset_upscaler_rayTracing_key" ON "game_scalings"("gameId", "resolution", "preset", "upscaler", "rayTracing");

-- CreateIndex
CREATE UNIQUE INDEX "default_scalings_resolution_preset_upscaler_rayTracing_key" ON "default_scalings"("resolution", "preset", "upscaler", "rayTracing");

-- CreateIndex
CREATE UNIQUE INDEX "games_slug_key" ON "games"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "games_steamAppId_key" ON "games"("steamAppId");

-- CreateIndex
CREATE UNIQUE INDEX "games_igdbId_key" ON "games"("igdbId");

-- CreateIndex
CREATE INDEX "games_isPopular_popularity_idx" ON "games"("isPopular", "popularity");

-- CreateIndex
CREATE INDEX "games_demandTier_idx" ON "games"("demandTier");

-- CreateIndex
CREATE UNIQUE INDEX "game_requirements_gameId_tier_key" ON "game_requirements"("gameId", "tier");

-- CreateIndex
CREATE INDEX "game_requirement_options_requirementId_kind_idx" ON "game_requirement_options"("requirementId", "kind");

-- CreateIndex
CREATE INDEX "game_requirement_options_cpuId_idx" ON "game_requirement_options"("cpuId");

-- CreateIndex
CREATE INDEX "game_requirement_options_gpuId_idx" ON "game_requirement_options"("gpuId");

-- CreateIndex
CREATE UNIQUE INDEX "game_requirement_options_requirementId_kind_matchedText_key" ON "game_requirement_options"("requirementId", "kind", "matchedText");

-- CreateIndex
CREATE UNIQUE INDEX "cpus_slug_key" ON "cpus"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "cpus_normalizedName_key" ON "cpus"("normalizedName");

-- CreateIndex
CREATE INDEX "cpus_vendor_formFactor_idx" ON "cpus"("vendor", "formFactor");

-- CreateIndex
CREATE INDEX "cpus_gamingIndex_idx" ON "cpus"("gamingIndex");

-- CreateIndex
CREATE INDEX "cpus_family_generation_idx" ON "cpus"("family", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "gpus_slug_key" ON "gpus"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "gpus_normalizedName_key" ON "gpus"("normalizedName");

-- CreateIndex
CREATE INDEX "gpus_vendor_formFactor_idx" ON "gpus"("vendor", "formFactor");

-- CreateIndex
CREATE INDEX "gpus_gamingIndex_idx" ON "gpus"("gamingIndex");

-- CreateIndex
CREATE INDEX "gpus_family_generation_idx" ON "gpus"("family", "generation");

-- CreateIndex
CREATE INDEX "hardware_aliases_cpuId_idx" ON "hardware_aliases"("cpuId");

-- CreateIndex
CREATE INDEX "hardware_aliases_gpuId_idx" ON "hardware_aliases"("gpuId");

-- CreateIndex
CREATE UNIQUE INDEX "hardware_aliases_kind_alias_key" ON "hardware_aliases"("kind", "alias");

-- CreateIndex
CREATE INDEX "import_batches_source_startedAt_idx" ON "import_batches"("source", "startedAt");

-- CreateIndex
CREATE INDEX "import_records_status_idx" ON "import_records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "import_records_batchId_externalId_key" ON "import_records"("batchId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- AddForeignKey
ALTER TABLE "user_builds" ADD CONSTRAINT "user_builds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_builds" ADD CONSTRAINT "user_builds_cpuId_fkey" FOREIGN KEY ("cpuId") REFERENCES "cpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_builds" ADD CONSTRAINT "user_builds_gpuId_fkey" FOREIGN KEY ("gpuId") REFERENCES "gpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_snapshots" ADD CONSTRAINT "check_snapshots_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_snapshots" ADD CONSTRAINT "check_snapshots_cpuId_fkey" FOREIGN KEY ("cpuId") REFERENCES "cpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_snapshots" ADD CONSTRAINT "check_snapshots_gpuId_fkey" FOREIGN KEY ("gpuId") REFERENCES "gpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_snapshots" ADD CONSTRAINT "check_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cpu_benchmark_scores" ADD CONSTRAINT "cpu_benchmark_scores_cpuId_fkey" FOREIGN KEY ("cpuId") REFERENCES "cpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cpu_benchmark_scores" ADD CONSTRAINT "cpu_benchmark_scores_benchmarkId_fkey" FOREIGN KEY ("benchmarkId") REFERENCES "benchmarks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gpu_benchmark_scores" ADD CONSTRAINT "gpu_benchmark_scores_gpuId_fkey" FOREIGN KEY ("gpuId") REFERENCES "gpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gpu_benchmark_scores" ADD CONSTRAINT "gpu_benchmark_scores_benchmarkId_fkey" FOREIGN KEY ("benchmarkId") REFERENCES "benchmarks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fps_samples" ADD CONSTRAINT "fps_samples_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fps_samples" ADD CONSTRAINT "fps_samples_gpuId_fkey" FOREIGN KEY ("gpuId") REFERENCES "gpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fps_samples" ADD CONSTRAINT "fps_samples_cpuId_fkey" FOREIGN KEY ("cpuId") REFERENCES "cpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fps_submissions" ADD CONSTRAINT "fps_submissions_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fps_submissions" ADD CONSTRAINT "fps_submissions_gpuId_fkey" FOREIGN KEY ("gpuId") REFERENCES "gpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fps_submissions" ADD CONSTRAINT "fps_submissions_cpuId_fkey" FOREIGN KEY ("cpuId") REFERENCES "cpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fps_submissions" ADD CONSTRAINT "fps_submissions_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_profiles" ADD CONSTRAINT "game_profiles_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_scalings" ADD CONSTRAINT "game_scalings_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_requirements" ADD CONSTRAINT "game_requirements_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_requirement_options" ADD CONSTRAINT "game_requirement_options_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "game_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_requirement_options" ADD CONSTRAINT "game_requirement_options_cpuId_fkey" FOREIGN KEY ("cpuId") REFERENCES "cpus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_requirement_options" ADD CONSTRAINT "game_requirement_options_gpuId_fkey" FOREIGN KEY ("gpuId") REFERENCES "gpus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cpus" ADD CONSTRAINT "cpus_integratedGpuId_fkey" FOREIGN KEY ("integratedGpuId") REFERENCES "gpus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_aliases" ADD CONSTRAINT "hardware_aliases_cpuId_fkey" FOREIGN KEY ("cpuId") REFERENCES "cpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_aliases" ADD CONSTRAINT "hardware_aliases_gpuId_fkey" FOREIGN KEY ("gpuId") REFERENCES "gpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
