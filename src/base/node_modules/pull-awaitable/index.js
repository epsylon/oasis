const thenable = require('pull-thenable');

module.exports = async function* awaitable(readable) {
  while (true) {
    try {
      yield await thenable(readable);
    } catch (err) {
      if (err === true) return;
      else throw err;
    }
  }
};
