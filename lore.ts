/**
 * Ember Isle lore and progressive guidance system.
 * Guides the player through actions with narrative context.
 */

export type StoryPhase = "intro" | "first-burn" | "stage-progression" | "final-stage" | null;

export const STORY = {
  intro: {
    title: "A World Awakens",
    lines: [
      "The islands were once vibrant, alive with possibility. But something went quiet.",
      "Now, an ancient flame flickers at the heart of the Ashen Isle—waiting for a Keeper.",
      "Your Rare Friend senses it too. They've been searching for a place to call home.",
      "Here, on this dying world, you have the power to rebuild.",
      "Every ember you offer at the altar breathes life back into the land.",
      "Will you answer the call? Will you restore these islands so your Friend can thrive?",
    ],
    actionPrompt: "Begin your journey",
  },
  firstBurn: {
    title: "The First Spark",
    context:
      "Your Friend has arrived at the altar. The ancient flame awaits an offering.",
    guidance:
      "Burn RF—the essence of their world. Each ember consumed fuels the island's healing.",
    actionPrompt: "Burn RF at the altar",
  },
  stageProgression: {
    title: "The Land Remembers",
    context:
      "As you burn, the island stirs. Green specks push through the ash. Trees wake from slumber.",
    guidance:
      "Continue burning. Each stage reveals more of what this world can become. Watch for the next milestone.",
    actionPrompt: "Continue rebuilding",
  },
  finalStage: {
    title: "Isle Reborn",
    context:
      "The final veil lifts. A phoenix circles overhead, ancient and eternal. The island is whole again.",
    guidance:
      "Your Friend now has a thriving sanctuary. A place where they—and others like them—can flourish.",
    actionPrompt: "Your journey is complete",
  },
};

export const CONTEXTUAL_TIPS: Record<string, string> = {
  walkToAltar:
    "Walk to the altar in the center of the island. Your Friend senses the ancient flame waiting there.",
  openAltar:
    "The altar awaits. Press E or tap to open it and begin your offering.",
  selectBurnAmount:
    "Choose how much RF to burn. Start small, or commit fully—the choice shapes your path.",
  confirmBurn:
    "Confirm your offering. Watch as the island transforms with each ember consumed.",
  watchHealing:
    "The land awakens. New stages of growth appear as you burn more. What will the fully healed island reveal?",
  checkLog:
    "Open the Log to see the island's stages of healing. Each milestone brings your Friend closer to their home.",
  monitorProgress:
    "You're halfway there. Every ember matters. The next stage is within reach.",
};

export type ProgressionStep = {
  phase: StoryPhase;
  burnedThreshold: number; // Minimum RF burned to reach this step
  title: string;
  description: string;
  showOnce: boolean; // Only show this tip once per session
};

export const PROGRESSION_STEPS: ProgressionStep[] = [
  {
    phase: "intro",
    burnedThreshold: 0,
    title: "A World Awaits",
    description: STORY.intro.lines.join(" "),
    showOnce: true,
  },
  {
    phase: "first-burn",
    burnedThreshold: 0,
    title: STORY.firstBurn.title,
    description: STORY.firstBurn.context + "\n\n" + STORY.firstBurn.guidance,
    showOnce: true,
  },
  {
    phase: "stage-progression",
    burnedThreshold: 1,
    title: STORY.stageProgression.title,
    description:
      STORY.stageProgression.context +
      "\n\n" +
      STORY.stageProgression.guidance,
    showOnce: false,
  },
  {
    phase: "final-stage",
    burnedThreshold: 20,
    title: STORY.finalStage.title,
    description:
      STORY.finalStage.context + "\n\n" + STORY.finalStage.guidance,
    showOnce: true,
  },
];

export function getProgressionStep(
  burned: number,
  seenPhases: Set<StoryPhase>
): ProgressionStep | null {
  for (let i = PROGRESSION_STEPS.length - 1; i >= 0; i--) {
    const step = PROGRESSION_STEPS[i];
    if (burned >= step.burnedThreshold) {
      if (step.showOnce && seenPhases.has(step.phase)) {
        continue;
      }
      return step;
    }
  }
  return null;
}

export function getContextualTip(situation: keyof typeof CONTEXTUAL_TIPS): string {
  return CONTEXTUAL_TIPS[situation] || "";
}
