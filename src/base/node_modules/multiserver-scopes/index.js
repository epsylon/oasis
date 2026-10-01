var ip = require('non-private-ip')

module.exports = {
  host: function(scope) {
    var f = {
      device: function () {return 'localhost'},
      local: ip.private,
      private: ip.private,
      public: ip
    }[scope]
    if (!f) throw new Error('invalid scope: ' + scope)
    return f()
  }
}
