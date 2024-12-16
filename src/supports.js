#!/usr/bin/env node

const { readFileSync } = require("fs");
const { join } =require("path");

const path = require("path");
const homedir = require('os').homedir();
const supportingPath = path.join(homedir, ".ssb/flume/contacts2.json");
const {
  a,
  br,
  li,
} = require("hyperaxe");

const envPaths = require("env-paths");
const {cli} = require("./cli");
const ssb = require("./ssb");

const defaultConfig = {};
const defaultConfigFile = join(
  envPaths.default("oasis", { suffix: "" }).config,
  "/default.json"
);

const config = cli(defaultConfig, defaultConfigFile);
if (config.debug) {
  process.env.DEBUG = "oasis,oasis:*";
}
const cooler = ssb({ offline: config.offline });

const models = require("./models.js");

const { about } = models({
  cooler,
  isPublic: config.public,
});

async function getNameByIdSupported(supported){
  const name_supported = await about.name(supported);
  return name_supported
}

async function getNameByIdBlocked(blocked){
  name_blocked = await about.name(blocked);
  return name_blocked
}

async function getNameByIdRecommended(recommended){
  name_recommended = await about.name(recommended);
  return name_recommended
}

  try{
      var supporting = JSON.parse(readFileSync(supportingPath, {encoding:'utf8', flag:'r'})).value;
    }catch{
      var supporting = undefined;
    }
    if (supporting == undefined) {
        var supportingValue = "false";
    }else{
        var keys = Object.keys(supporting);
        if (keys[0] === undefined){
          var supportingValue = "false";
        }else{
          var supportingValue = "true";
        }
    }

    if (supportingValue === "true") {
      var arr = [];
      var keys = Object.keys(supporting);
        var data = Object.entries(supporting[keys[0]]);
        Object.entries(data).forEach(([key, value]) => {
         if (value[1]===1){
          var supported = (value[0])
           if (!arr.includes(supported)) {
              getNameSupported(supported);
              async function getNameSupported(supported){
                 const name_supported = await getNameByIdSupported(supported);
              arr.push(
               li(
                 name_supported,br,
                 a(
                  { href: `/author/${encodeURIComponent(supported)}` }, 
                  supported
                 )
               ), br
              );
             }
           }
         }
      });
    }else{
      var arr = [];
    }
    var supports = arr;

    if (supportingValue === "true") {
      var arr2 = [];
      var keys = Object.keys(supporting);
      var data = Object.entries(supporting[keys[0]]);
       Object.entries(data).forEach(([key, value]) => {
         if (value[1]===-1){
          var blocked = (value[0])
           if (!arr2.includes(blocked)) {
              getNameBlocked(blocked);
              async function getNameBlocked(blocked){
                 name_blocked = await getNameByIdBlocked(blocked);
              arr2.push(
               li(
                 name_blocked,br,
                 a( 
                  { href: `/author/${encodeURIComponent(blocked)}` },
                  blocked
                 )
               ), br
              );
             }
           }
         }
      });
    }else{
      var arr2 = [];
    }
    var blocks = arr2;

    if (supportingValue === "true") {
      var arr3 = [];
      var keys = Object.keys(supporting);
      var data = Object.entries(supporting[keys[0]]);
       Object.entries(data).forEach(([key, value]) => {
         if (value[1]===-2){
          var recommended = (value[0])
           if (!arr3.includes(recommended)) {
              getNameRecommended(recommended);
              async function getNameRecommended(recommended){
                 name_recommended = await getNameByIdRecommended(recommended);
              arr3.push(
               li(
                 name_recommended,br,
                 a( 
                  { href: `/author/${encodeURIComponent(recommended)}` },
                  recommended
                 )
               ), br
              );
             }
           }
         }
      });
    }else{
      var arr3 = [];
    }
    var recommends = arr3;

module.exports.supporting = supports;
module.exports.blocking = blocks;
module.exports.recommending = recommends