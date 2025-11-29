const positive = [
  "interesting",
  "necessary",
  "useful",
  "informative",
  "wellResearched",
  "accurate",
  "insightful",
  "actionable",
  "creative",
  "inspiring",
  "love",
  "funny",
  "clear",
  "uplifting"
];

const constructive = [
  "unnecessary",
  "rejected",
  "needsSources",
  "wrong",
  "lowQuality",
  "confusing",
  "misleading",
  "offTopic",
  "duplicate",
  "clickbait",
  "propaganda"
];

const moderation = [
  "spam",
  "troll",
  "adultOnly",
  "nsfw",
  "violent",
  "toxic",
  "harassment",
  "hate",
  "scam",
  "triggering"
];

const all = [...positive, ...constructive, ...moderation];
all.positive = positive;
all.constructive = constructive;
all.moderation = moderation;

module.exports = all;
