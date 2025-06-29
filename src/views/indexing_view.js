const { html,  title, link, meta,  body, main, p, progress } = require("../server/node_modules/hyperaxe");
const { i18n } = require('./main_views');

exports.indexingView = ({ percent }) => {
  const message = `Oasis has only processed ${percent}% of the messages and needs to catch up. This page will refresh every 10 seconds. Thanks for your patience! ❤`;
  const nodes = html(
    { lang: "en" },
    head(
      title("Oasis"),
      link({ rel: "icon", type: "image/svg+xml", href: "/assets/favicon.svg" }),
      meta({ charset: "utf-8" }),
      meta({
        name: "description",
        content: i18n.oasisDescription,
      }),
      meta({
        name: "viewport",
        content: toAttributes({ width: "device-width", "initial-scale": 1 }),
      }),
      meta({ "http-equiv": "refresh", content: 10 })
    ),
    body(
      main(
        { id: "content" },
        p(message),
        progress({ value: percent, max: 100 })
      )
    )
  );
  const result = doctypeString + nodes.outerHTML;
  return result;
};
