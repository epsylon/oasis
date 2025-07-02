const { html, head, title, link, meta, body, main, p, progress } = require("../server/node_modules/hyperaxe");
const { i18n } = require('./main_views');

const doctypeString = '<!DOCTYPE html>';

function toAttributes(attrs) {
  return Object.entries(attrs).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(', ');
}

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
        content: "width=device-width, initial-scale=1",
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
  return doctypeString + nodes.outerHTML;
};

