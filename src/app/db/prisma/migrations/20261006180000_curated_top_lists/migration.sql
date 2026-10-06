-- CreateTable
CREATE TABLE "curated_top_games" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curated_top_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curated_top_cpus" (
    "id" TEXT NOT NULL,
    "cpuId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curated_top_cpus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curated_top_gpus" (
    "id" TEXT NOT NULL,
    "gpuId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curated_top_gpus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "curated_top_games_gameId_key" ON "curated_top_games"("gameId");

-- CreateIndex
CREATE INDEX "curated_top_games_sortOrder_idx" ON "curated_top_games"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "curated_top_cpus_cpuId_key" ON "curated_top_cpus"("cpuId");

-- CreateIndex
CREATE INDEX "curated_top_cpus_sortOrder_idx" ON "curated_top_cpus"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "curated_top_gpus_gpuId_key" ON "curated_top_gpus"("gpuId");

-- CreateIndex
CREATE INDEX "curated_top_gpus_sortOrder_idx" ON "curated_top_gpus"("sortOrder");

-- AddForeignKey
ALTER TABLE "curated_top_games" ADD CONSTRAINT "curated_top_games_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curated_top_cpus" ADD CONSTRAINT "curated_top_cpus_cpuId_fkey" FOREIGN KEY ("cpuId") REFERENCES "cpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curated_top_gpus" ADD CONSTRAINT "curated_top_gpus_gpuId_fkey" FOREIGN KEY ("gpuId") REFERENCES "gpus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
