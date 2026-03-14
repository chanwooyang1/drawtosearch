import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const corpusDir = path.join(repoRoot, "src", "lib", "search", "reference-corpus");
const manifestPath = path.join(corpusDir, "manifest.json");
const artifactPath = path.join(corpusDir, "artifact.json");

const HEURISTIC_DIMENSION = 16;

const forceHeuristicMode =
  process.argv.includes("--heuristic") ||
  process.env.REFERENCE_CORPUS_MODE === "heuristic";

function createSemanticVector(tokens) {
  const vector = Array.from({ length: HEURISTIC_DIMENSION }, () => 0);
  const joined = tokens.join(" ");

  if (/(logo|symbol|mark|badge|로고|심볼|마크)/i.test(joined)) {
    vector[0] += 1;
  }

  if (/(service|app|software|browser|icon|서비스|앱|브라우저|아이콘)/i.test(joined)) {
    vector[1] += 1;
  }

  if (/(product|fashion|luxury|monogram|pattern|명품|모노그램|패턴|제품)/i.test(joined)) {
    vector[2] += 1;
    vector[9] += /(luxury|fashion|명품|모노그램)/i.test(joined) ? 1 : 0;
  }

  if (/(object|device|remote|cup|사물|리모컨|컵|물체)/i.test(joined)) {
    vector[3] += 1;
    vector[15] += 1;
  }

  if (/(round|원형|oval|circle|폐곡선)/i.test(joined)) {
    vector[4] += 1;
  }

  if (/(angular|기하학|rectangle|diamond|line|세로형|가로형|arrow)/i.test(joined)) {
    vector[5] += 1;
  }

  if (/(pattern|repeated|반복)/i.test(joined)) {
    vector[6] += 1;
  }

  if (/(blue|white|파란색|흰색|하얀색)/i.test(joined)) {
    vector[7] += 1;
  }

  if (/(red|yellow|green|multicolor|파랑|노랑|빨강|초록)/i.test(joined)) {
    vector[8] += 1;
  }

  if (/(arrows|remote support|양쪽 화살표|원격 지원)/i.test(joined)) {
    vector[10] += 1;
    vector[14] += 1;
  }

  if (/(text mark|wordmark|text-like|텍스트|문자|word)/i.test(joined)) {
    vector[11] += 1;
  }

  if (/(simple|icon|단순)/i.test(joined)) {
    vector[12] += 1;
  }

  if (/(browser|web|브라우저|인터넷|웹)/i.test(joined)) {
    vector[13] += 1;
  }

  return vector;
}

function buildCorpusText(item) {
  return [
    item.title,
    ...(item.aliases ?? []),
    ...(item.tags ?? []),
    ...(item.shapeTags ?? []),
    ...(item.dominantColors ?? []),
    ...(item.ocrTokens ?? []),
    item.category,
  ]
    .filter(Boolean)
    .join(" ");
}

async function readManifest() {
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw);
}

function normalizeEmbedding(output) {
  if (Array.isArray(output)) {
    if (Array.isArray(output[0])) {
      return normalizeEmbedding(output[0]);
    }

    return output.map((value) => Number(value));
  }

  if (output?.data) {
    return Array.from(output.data, (value) => Number(value));
  }

  if (typeof output?.tolist === "function") {
    return normalizeEmbedding(output.tolist());
  }

  throw new Error("Unsupported embedding output format.");
}

async function buildWithTransformers(manifest) {
  const model = process.env.REFERENCE_EMBEDDING_MODEL ?? "Xenova/clip-vit-base-patch32";
  const { env, pipeline } = await import("@huggingface/transformers");

  env.allowLocalModels = true;
  env.cacheDir = path.join(repoRoot, ".cache", "transformers");

  const extractor = await pipeline("feature-extraction", model);
  const items = [];
  let dimension = 0;

  for (const item of manifest) {
    const text = buildCorpusText(item);
    const textEmbedding = normalizeEmbedding(
      await extractor(text, {
        normalize: true,
        pooling: "mean",
      }),
    );

    dimension = textEmbedding.length;
    items.push({
      id: item.id,
      imageEmbedding: textEmbedding,
      textEmbedding,
    });
  }

  return {
    dimension,
    items,
    mode: "transformers-text",
  };
}

function buildHeuristicArtifact(manifest) {
  return {
    dimension: HEURISTIC_DIMENSION,
    items: manifest.map((item) => {
      const embedding = createSemanticVector([buildCorpusText(item)]);

      return {
        id: item.id,
        imageEmbedding: embedding,
        textEmbedding: embedding,
      };
    }),
    mode: "heuristic",
  };
}

async function main() {
  const manifest = await readManifest();
  let artifact;

  if (forceHeuristicMode) {
    artifact = buildHeuristicArtifact(manifest);
  } else {
    try {
      artifact = await buildWithTransformers(manifest);
    } catch (error) {
      console.warn(
        "[drawtosearch] Transformers.js corpus build failed; falling back to heuristic vectors.",
        error instanceof Error ? error.message : error,
      );
      artifact = buildHeuristicArtifact(manifest);
    }
  }

  await mkdir(corpusDir, { recursive: true });
  await writeFile(
    artifactPath,
    `${JSON.stringify(
      {
        dimension: artifact.dimension,
        items: artifact.items,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.info(
    `[drawtosearch] Wrote ${artifact.items.length} corpus embeddings to ${path.relative(repoRoot, artifactPath)} using ${artifact.mode}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
