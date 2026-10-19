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
  "outdated",
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
const karmaNeutral = ["adultOnly", "nsfw", "triggering", "duplicate", "offTopic", "needsSources", "outdated"];
const karmaModeration = [...moderation.filter(c => !karmaNeutral.includes(c)), "propaganda"];
all.karma = {
  positive,
  neutral: karmaNeutral,
  constructive: constructive.filter(c => !karmaNeutral.includes(c) && !karmaModeration.includes(c)),
  moderation: karmaModeration
};
all.messageTypes = {
  bookmark: 'bookmarkOpinion',
  votes: 'votesOpinion',
  poll: 'pollOpinion',
  transfer: 'transferOpinion',
  feed: 'feedOpinion',
  post: 'blogOpinion',
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
  logisticsRoute: 'logisticsOpinion',
  wikiPage: 'wikiOpinion',
  map: 'mapOpinion',
  industryBlueprint: 'blueprintOpinion',
  job: 'jobOpinion'
};
all.opinable = (c) => !!c && typeof c === 'object' && !!all.messageTypes[c.type] && !c.tribeId && !c.encrypted && !c.encryptedPayload && !c.contentEncrypted
  && (c.type !== 'map' || String(c.mapType || '').toUpperCase() === 'OPEN')
  && (c.type !== 'job' || String(c.visibility || 'PUBLIC').toUpperCase() !== 'HIDDEN')
  && (c.type !== 'schoolCourse' || String(c.visibility || 'PUBLIC').toUpperCase() !== 'INVITE');

all.hasOpinions = (x) => Object.values((x && x.opinions) || {}).some(n => (Number(n) || 0) > 0);
all.MEDIA_LOCKED = 'Cannot replace the file after it has received opinions.';
all.assertMediaKept = (item, replacing) => { if (replacing && all.hasOpinions(item)) throw new Error(all.MEDIA_LOCKED); };

module.exports = all;
