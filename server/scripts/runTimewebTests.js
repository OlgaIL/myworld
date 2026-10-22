import { spawnSync } from "node:child_process";
const files = ["tests/timewebAi.test.js", "tests/timewebPipeline.test.js", "tests/timewebDatabase.test.js",
  "tests/yandexAiRetry.test.js", "tests/yandexPrompt.test.js", "tests/aiFormattedContent.test.js", "tests/listStructure.test.js", "tests/mixedListEvidence.test.js",
  "tests/googleOcrLayout.test.js", "tests/partialProcessingService.test.js", "tests/llmAttemptMetrics.test.js", "tests/textCorrections.test.js"];
const result = spawnSync(process.execPath, ["--import", "./tests/timewebSyntheticEnv.js", "--test", ...files], {
  cwd: new URL("..", import.meta.url), env: process.env, stdio: "inherit", windowsHide: true
});
process.exitCode = result.status ?? 1;
