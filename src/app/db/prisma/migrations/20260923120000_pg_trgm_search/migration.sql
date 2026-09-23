-- Extensions + fuzzy-search indexes + CHECK constraints from document/data-model.md

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX IF NOT EXISTS cpus_normalized_name_trgm
  ON cpus USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS gpus_normalized_name_trgm
  ON gpus USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS games_name_trgm
  ON games USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS hardware_aliases_alias_trgm
  ON hardware_aliases USING gin ("alias" gin_trgm_ops);

ALTER TABLE hardware_aliases
  DROP CONSTRAINT IF EXISTS hardware_aliases_one_target;
ALTER TABLE hardware_aliases
  ADD CONSTRAINT hardware_aliases_one_target
  CHECK (num_nonnulls("cpuId", "gpuId") = 1);

ALTER TABLE game_requirement_options
  DROP CONSTRAINT IF EXISTS game_requirement_options_one_target;
ALTER TABLE game_requirement_options
  ADD CONSTRAINT game_requirement_options_one_target
  CHECK (num_nonnulls("cpuId", "gpuId") <= 1);

ALTER TABLE cpus DROP CONSTRAINT IF EXISTS cpus_gaming_index_range;
ALTER TABLE cpus ADD CONSTRAINT cpus_gaming_index_range
  CHECK ("gamingIndex" IS NULL OR "gamingIndex" BETWEEN 0 AND 100);

ALTER TABLE gpus DROP CONSTRAINT IF EXISTS gpus_gaming_index_range;
ALTER TABLE gpus ADD CONSTRAINT gpus_gaming_index_range
  CHECK ("gamingIndex" IS NULL OR "gamingIndex" BETWEEN 0 AND 100);

ALTER TABLE fps_samples DROP CONSTRAINT IF EXISTS fps_samples_avg_fps_positive;
ALTER TABLE fps_samples ADD CONSTRAINT fps_samples_avg_fps_positive
  CHECK ("avgFps" > 0);

CREATE INDEX IF NOT EXISTS game_requirement_options_review
  ON game_requirement_options ("requirementId")
  WHERE "needsReview" = true;
