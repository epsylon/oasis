'use strict';

module.exports = getUsage;

function getUsage(oldUsage) {
  var usage;
  if (oldUsage && oldUsage._start) {
    usage = Object.assign({}, process.cpuUsage(oldUsage._start.cpuUsage));
    usage.time = Date.now() - oldUsage._start.time;
  } else {
    usage = Object.assign({}, process.cpuUsage());
    usage.time = process.uptime() * 1000; // s to ms
  }
  usage.percent = (usage.system + usage.user) / (usage.time * 10);
  Object.defineProperty(usage, '_start', {
    value: {
      cpuUsage: process.cpuUsage(),
      time: Date.now()
    }
  });
  return usage;
}
