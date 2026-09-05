import { runCrawlCli } from '@/app/modules/benchmark/cli/crawl-cli';

runCrawlCli('GPU').catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
