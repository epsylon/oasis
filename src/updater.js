const request = require("request");
const fs = require("fs");
const path = require("path");
const
  promisify = require('util').promisify,
  cb = promisify(request);
const localpackage = path.join("package.json");
const remoteUrl = "https://code.03c8.net/KrakensLab/oasis/src/master/package.json" // Official SNH-Oasis
const remoteUrl2 = "https://github.com/epsylon/oasis/blob/main/package.json" // Mirror SNH-Oasis

let requestInstance;

exports.getRemoteVersion = function(callback){
(async () => {
  if (fs.existsSync(".git")) {
    requestInstance = await cb(remoteUrl, function(error, response, body) {
      if (error != null){
        checkMirror(); 
      }else{
        diffVersion(body);
      };
    });
    function checkMirror(){
      requestInstance2 = request(remoteUrl2, function (error, response, body) {
        diffVersion(body);
      });
    };
    function diffVersion(body){
      remoteVersion =  body.split('<li class="L3" rel="L3">').pop().split('</li>')[0];
      remoteVersion = remoteVersion.split('&#34;version&#34;: &#34;').pop().split('&#34;,')[0];
      localVersion = fs.readFileSync(localpackage, "utf8");
      localVersion = localVersion.split('"name":').pop().split('"description":')[0];
      localVersion = localVersion.split('"version"').pop().split('"')[1];
      if (remoteVersion != localVersion){
        checkversion = "required";
      }else{
        checkversion = "";
      };
    callback(checkversion);
    };
  };
})();
};
