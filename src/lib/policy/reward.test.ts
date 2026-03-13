import { describe, expect, it } from "vitest";

import { computePolicyReward, POLICY_REWARD_WINDOW_MINUTES } from "./reward";

describe("policy reward aggregation", () => {
  it("combines explicit match feedback with click rewards", () => {
    const reward = computePolicyReward({
      events: [
        {
          eventType: "result_click",
          targetRank: 1,
        },
        {
          eventType: "handoff_click",
        },
        {
          eventType: "feedback",
          feedback: "match",
        },
      ],
    });

    expect(reward.rewardValue).toBeCloseTo(1.2);
    expect(reward.outcomeLabel).toBe("match");
    expect(reward.rewardBreakdown).toMatchObject({
      explicitFeedback: "match",
      handoffClicks: 1,
      topRankClicks: 1,
      totalReward: 1.2,
      windowMinutes: POLICY_REWARD_WINDOW_MINUTES,
    });
  });

  it("caps click-only reward when no explicit feedback is present", () => {
    const reward = computePolicyReward({
      events: [
        { eventType: "result_click", targetRank: 1 },
        { eventType: "result_click", targetRank: 2 },
        { eventType: "result_click", targetRank: 4 },
        { eventType: "handoff_click" },
      ],
    });

    expect(reward.rewardBreakdown.uncappedClickReward).toBeCloseTo(0.45);
    expect(reward.rewardBreakdown.cappedClickReward).toBeCloseTo(0.35);
    expect(reward.rewardValue).toBeCloseTo(0.35);
    expect(reward.outcomeLabel).toBe("weak_positive");
  });

  it("forces a miss reward to -1 regardless of clicks", () => {
    const reward = computePolicyReward({
      events: [
        { eventType: "result_click", targetRank: 1 },
        { eventType: "feedback", feedback: "miss" },
      ],
    });

    expect(reward.rewardValue).toBe(-1);
    expect(reward.outcomeLabel).toBe("miss");
    expect(reward.rewardBreakdown.feedbackReward).toBe(-1);
  });
});

