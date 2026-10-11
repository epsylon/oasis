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
all.messageTypes = {
  bookmark: 'bookmarkOpinion',
  votes: 'votesOpinion',
  poll: 'pollOpinion',
  transfer: 'transferOpinion',
  feed: 'feedOpinion',
  image: 'imageOpinion',
  audio: 'audioOpinion',
  video: 'videoOpinion',
  document: 'documentOpinion',
  torrent: 'torrentOpinion',
  file: 'fileOpinion',
  industry: 'industryOpinion',
  project: 'projectOpinion',
  report: 'reportOpinion',
  task: 'taskOpinion',
  event: 'eventOpinion',
  shopProduct: 'shopOpinion',
  housing: 'housingOpinion',
  market: 'marketOpinion',
  schoolCourse: 'schoolOpinion',
  podcast: 'podcastOpinion',
  podcastEpisode: 'podcastOpinion',
  campaign: 'campaignOpinion',
  logisticsRoute: 'logisticsOpinion'
};

module.exports = all;
