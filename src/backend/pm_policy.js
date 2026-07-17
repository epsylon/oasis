const isMutual = (relationship) => !!(relationship && relationship.following && relationship.followsMe);

const isRecipientAllowed = ({ pmVisibility, viewerId, recipientId, relationship } = {}) => {
  if (recipientId && viewerId && recipientId === viewerId) return true;
  if (pmVisibility !== 'mutuals') return true;
  return isMutual(relationship);
};

module.exports = { isRecipientAllowed, isMutual };
