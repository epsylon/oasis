module.exports = config =>
  config.set({
    frameworks: ["browserify", "tap", "source-map-support"],
    reporters: ["tap-pretty"],
    browsers: ["Firefox"],
    files: ["test/**/*.js"],
    preprocessors: {
      "test/**/*.js": ["browserify"]
    },
    browserify: {
      debug: true,
      transform: ["babelify"]
    },
    tapReporter: {
      // prettify: require("faucet"),
      separator:
        "\n\n\n\n\n\n\n----------------------------------------\n\n\n\n\n\n\n"
    },
    logLevel: config.LOG_ERROR,
    captureConsole: true,
    browserNoActivityTimeout: 90000,
    browserConsoleLogOptions: {
      level: "error",
      format: "%b %T: %m",
      terminal: true
    },
    notifyReporter: {
      reportEachFailure: true,
      reportSuccess: true
    }
  })
