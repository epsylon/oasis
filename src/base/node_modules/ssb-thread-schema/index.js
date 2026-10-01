module.exports = {
  isRoot: require('./post/root/validator'),
  isReply: require('./post/reply/validator')
  // isNestedReply: require('./post/nested-reply/validator'),
  // isFork: require('./post/fork/validator')
}
