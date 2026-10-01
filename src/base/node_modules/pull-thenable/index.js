var quicktask = require('quicktask').default;
var schedule = quicktask();
module.exports = function thenable(readable, prev) {
  return {
    cont: {},
    then: function then(resolve, reject) {
      var cont = this.cont;
      function run() {
        readable(null, function(errOrEnd, data) {
          if (errOrEnd === true) reject(true);
          else if (errOrEnd) reject(errOrEnd);
          else {
            resolve(data);
            if (cont.run) cont.run();
          }
        });
      }
      if (prev) prev.run = run;
      else schedule(run);
      return thenable(readable, cont);
    },
  };
};
