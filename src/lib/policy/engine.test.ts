import { describe, expect, it } from "vitest";

import { createSearchPolicyEngine } from "./engine";
import type { PolicySnapshotStore } from "./types";

const baseContext = {
  aspectBucket: "square" as const,
  colorHintCount: "2" as const,
  colorTokens: ["blue", "white"],
  evidenceStrength: "high" as const,
  hasDrawing: true,
  hasExplicitName: false,
  hasTextHint: true,
  intentSurface: "service_icon" as const,
  resultCoherence: "mixed" as const,
  resultEntityRepeatCount: 2,
  shapeFamily: "round" as const,
  visionLabelCount: 1,
};

describe("policy engine", () => {
  it("returns neutral directives when no approved snapshot exists", async () => {
    const engine = createSearchPolicyEngine();
    const result = await engine.selectPlanPolicy({
      context: baseContext,
      sessionId: "44444444-4444-4444-8444-444444444444",
    });

    expect(result.actionName).toBe("neutral");
    expect(result.policyVersion).toBe("neutral-v1");
    expect(result.directiveText).toContain("evidence-first");
  });

  it("selects the strongest Thompson action from the matching bucket", async () => {
    const snapshotStore: PolicySnapshotStore = {
      async getActiveSnapshot(policyFamily) {
        return {
          createdAt: new Date("2026-03-14T00:00:00.000Z"),
          id: `${policyFamily}-approved`,
          offlineMetrics: {},
          parameters: {
            bucketPriors: {
              "service_icon|high|round|2|unnamed": {
                broad_reference: { alpha: 1, beta: 20 },
                literal_text: { alpha: 1, beta: 20 },
                logo_symbol: { alpha: 1, beta: 20 },
                object_reference: { alpha: 1, beta: 20 },
                product_visual: { alpha: 1, beta: 20 },
                service_icon: { alpha: 20, beta: 1 },
              },
            },
            defaultPriors: {
              broad_reference: { alpha: 1, beta: 1 },
              literal_text: { alpha: 1, beta: 1 },
              logo_symbol: { alpha: 1, beta: 1 },
              object_reference: { alpha: 1, beta: 1 },
              product_visual: { alpha: 1, beta: 1 },
              service_icon: { alpha: 1, beta: 1 },
            },
          },
          policyFamily,
          status: "approved",
          trainingWindowEnd: new Date("2026-03-14T00:00:00.000Z"),
          trainingWindowStart: new Date("2026-03-13T00:00:00.000Z"),
          version: "plan-v5",
        };
      },
    };
    const engine = createSearchPolicyEngine({
      randomFactory: () => () => 0.5,
      snapshotStore,
    });
    const result = await engine.selectPlanPolicy({
      context: baseContext,
      sessionId: "55555555-5555-4555-8555-555555555555",
    });

    expect(result.actionName).toBe("service_icon");
    expect(result.policyVersion).toBe("plan-v5");
    expect(result.explorationScore).toBeGreaterThan(0.5);
  });
});

