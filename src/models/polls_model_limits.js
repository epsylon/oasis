const MAX_OPTIONS = 10;
const MIN_OPTIONS = 2;
const MAX_OPTION_LENGTH = 120;
const POLL_KINDS = ['election', 'survey', 'collaboration'];

const pollKindOf = (pollType, multiple) => {
  const kind = String(pollType || '').toLowerCase();
  return POLL_KINDS.includes(kind) ? kind : (multiple === true ? 'survey' : 'election');
};

module.exports = { MAX_OPTIONS, MIN_OPTIONS, MAX_OPTION_LENGTH, POLL_KINDS, pollKindOf };
