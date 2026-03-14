import corpusArtifact from "./reference-corpus/artifact.json";
import corpusManifest from "./reference-corpus/manifest.json";
import { normalizeSearchText, scoreTokenOverlap } from "./query";
import type {
  EvidenceBundle,
  ReferenceCorpusItem,
  RetrievalCandidate,
} from "./types";
import type { SearchHypothesis } from "./hypotheses";

const VECTOR_DIMENSION = corpusArtifact.dimension;

type CorpusArtifactItem = {
  id: string;
  imageEmbedding: number[];
  textEmbedding: number[];
};

type IndexedCorpusItem = ReferenceCorpusItem & CorpusArtifactItem;

const typedManifest = corpusManifest as ReferenceCorpusItem[];
const typedArtifactItems = corpusArtifact.items as CorpusArtifactItem[];

const indexedCorpus = typedManifest.map((item) => {
  const artifact = typedArtifactItems.find((candidate) => candidate.id === item.id);

  if (!artifact) {
    throw new Error(`Missing embedding artifact for reference corpus item: ${item.id}`);
  }

  return {
    ...item,
    ...artifact,
  } satisfies IndexedCorpusItem;
});

function buildPlaceholderThumbnail(item: IndexedCorpusItem) {
  const palette = item.dominantColors.length
    ? item.dominantColors.slice(0, 3)
    : ["gray"];
  const background = palette[0] === "blue"
    ? "#dcefff"
    : palette[0] === "brown"
      ? "#ead7c0"
      : palette[0] === "black"
        ? "#d7d7d7"
        : "#f6e8d8";
  const accent = palette[1] === "white" ? "#ffffff" : "#2f4858";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
      <rect width="640" height="640" rx="48" fill="${background}" />
      <circle cx="144" cy="144" r="72" fill="${accent}" opacity="0.65" />
      <text x="72" y="364" fill="#1f130d" font-family="Arial, sans-serif" font-size="42" font-weight="700">${item.title}</text>
      <text x="72" y="420" fill="#5a3d2c" font-family="Arial, sans-serif" font-size="24">${item.category}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || !right.length || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! ** 2;
    rightNorm += right[index]! ** 2;
  }

  if (!leftNorm || !rightNorm) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function createSemanticVector(tokens: string[]) {
  const vector = Array.from({ length: VECTOR_DIMENSION }, () => 0);
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

  if (/(object|device|remote|cup|사물|리모컨|컵|물체|device)/i.test(joined)) {
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

function buildQueryVectors(evidence: EvidenceBundle, hypotheses: SearchHypothesis[]) {
  const hypothesisText = hypotheses.flatMap((hypothesis) => [
    hypothesis.label,
    hypothesis.query,
    hypothesis.surface,
    ...hypothesis.tags,
  ]);

  return {
    binaryVector: createSemanticVector([
      evidence.binaryDescriptorText,
      ...evidence.shapeTokens,
      ...hypothesisText,
    ]),
    sketchVector: createSemanticVector([
      evidence.rasterDescriptorText,
      evidence.sketchDescriptorText,
      ...evidence.shapeTokens,
      ...evidence.ocrTokens,
    ]),
    textVector: createSemanticVector([
      evidence.textDescriptorText,
      ...evidence.contextTokens,
      ...evidence.colorTokens,
      ...evidence.clarificationTokens,
      ...hypothesisText,
    ]),
  };
}

function categoryBoost(item: IndexedCorpusItem, hypotheses: SearchHypothesis[]) {
  const topSurface = hypotheses[0]?.surface;

  if (!topSurface) {
    return 0;
  }

  if (
    (topSurface === "product_visual" && item.category === "product_visual") ||
    (topSurface === "generic_object" && item.category === "object_reference") ||
    ((topSurface === "logo_symbol" || topSurface === "service_icon") && item.category === "logo_icon")
  ) {
    return 0.08;
  }

  return 0;
}

export async function searchReferenceIndex(input: {
  evidence: EvidenceBundle;
  hypotheses: SearchHypothesis[];
  limit?: number;
}): Promise<RetrievalCandidate[]> {
  const limit = input.limit ?? 20;
  const { binaryVector, sketchVector, textVector } = buildQueryVectors(
    input.evidence,
    input.hypotheses,
  );

  return indexedCorpus
    .map((item) => {
      const sketchSimilarity = cosineSimilarity(sketchVector, item.imageEmbedding);
      const binarySimilarity = cosineSimilarity(binaryVector, item.imageEmbedding);
      const textSimilarity = cosineSimilarity(textVector, item.textEmbedding);
      const aliasOverlap = Math.max(
        ...item.aliases.map((alias) =>
          scoreTokenOverlap(
            `${input.evidence.textDescriptorText} ${input.evidence.sketchDescriptorText}`,
            alias,
          ),
        ),
        scoreTokenOverlap(input.evidence.textDescriptorText, item.title),
        0,
      );
      const baseScore =
        sketchSimilarity * 0.45 +
        binarySimilarity * 0.2 +
        textSimilarity * 0.35 +
        aliasOverlap * 0.15 +
        categoryBoost(item, input.hypotheses);

      return {
        baseScore,
        category: item.category,
        dominantColors: item.dominantColors,
        height: 640,
        id: item.id,
        imageSimilarity: Math.max(sketchSimilarity, binarySimilarity),
        link: item.sourceUrl,
        ocrTokens: item.ocrTokens,
        query: input.hypotheses[0]?.query ?? item.title,
        shapeTags: item.shapeTags,
        source: "local" as const,
        sourceId: item.id,
        sourceUrl: item.sourceUrl,
        tags: item.tags,
        textSimilarity: Math.max(textSimilarity, aliasOverlap),
        thumbnailUrl: buildPlaceholderThumbnail(item),
        title: item.title,
        width: 640,
      } satisfies RetrievalCandidate;
    })
    .sort((left, right) => right.baseScore - left.baseScore)
    .slice(0, limit);
}

export function inferResultCategory(input: {
  resultTitle: string;
  resultQuery: string;
}) {
  const normalized = normalizeSearchText(`${input.resultTitle} ${input.resultQuery}`);

  if (/(pattern|monogram|luxury|fashion|명품|패턴|모노그램)/i.test(normalized)) {
    return "product_visual";
  }

  if (/(object|device|컵|리모컨|사물|물체)/i.test(normalized)) {
    return "object_reference";
  }

  return "logo_icon";
}
