const { html, head, title, link, meta, style, body, main, p, progress, svg, rect, circle, path, g } = require("../server/node_modules/hyperaxe");
const { i18n } = require('./main_views');

const mysticalMessages = [
  "Water flows for those who wait.",
  "Where silence burns, the voice of the Oasis grows.",
  "Each grain of sand holds the eternal.",
  "There is no map to the true refuge—only the path.",
  "Under the still sun, patience blooms."
];

const indexingView = ({ percent }) => {
  const message = `Oasis has only processed ${percent}% of the messages and needs to catch up. This page will refresh every 10 seconds.`;

  const currentMessage = percent >= 100 ? "The oasis welcomes you with light." : mysticalMessages[Math.floor(percent / 20) % mysticalMessages.length];

  const nodes = html(
    { lang: "en" },
    head(
      title("Oasis"),
      link({ rel: "icon", type: "image/svg+xml", href: "/assets/favicon.svg" }),
      meta({ charset: "utf-8" }),
      meta({ name: "description", content: i18n.oasisDescription }),
      meta({ name: "viewport", content: toAttributes({ width: "device-width", "initial-scale": 1 }) }),
      meta({ "http-equiv": "refresh", content: 10 }),
      style(`
        body { background: #f4e9dc; color: #3b2f2f; font-family: serif; text-align: center; padding: 2em; }
        .mystical { font-style: italic; margin-top: 1em; font-size: 1.2em; transition: opacity 1s ease-in-out; }
        .desert-svg { display: block; margin: 2em auto; max-width: 100%; height: auto; }
        .star {
          animation: blink 2s infinite ease-in-out;
        }
        .star:nth-child(odd) {
          animation-delay: 1s;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `)
    ),
    body(
      main(
        { id: "content" },
        p(message),
        progress({ value: percent, max: 100 }),
        p({ class: "mystical" }, currentMessage),
        svg(
          {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 400 100",
            class: "desert-svg"
          },
          rect({ x: 0, y: 0, width: 400, height: 100, fill: percent >= 100 ? "#fceabb" : "#0b1a2a" }),
          percent < 100 ?
            Array.from({ length: 20 }, (_, i) => {
              const cx = Math.random() * 400;
              const cy = Math.random() * 40;
              const r = Math.random() * 1.5 + 0.5;
              return circle({ cx, cy, r, fill: "white", class: "star" });
            }) :
            circle({ cx: 350, cy: 30, r: 20, fill: "#fff6b0" }),
          path({
            d: "M0,80 Q100,70 200,80 T400,80 L400,100 L0,100 Z",
            fill: "#d2b48c"
          }),
          g(
            { transform: `translate(${(400 - 32) * (percent / 100)}, 60)` },
            rect({ x: 0, y: 0, width: 8, height: 8, fill: "#e0cfa9" }),
            rect({ x: 10, y: 0, width: 6, height: 6, fill: "#e0cfa9" }),
            rect({ x: 20, y: 0, width: 8, height: 8, fill: "#e0cfa9" })
          )
        )
      )
    )
  );

  const result = doctypeString + nodes.outerHTML;
  return result;
};

exports.indexingView = indexingView;
