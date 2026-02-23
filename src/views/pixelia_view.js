const { div, h2, p, section, form, input, label, select, option, button, table, tr, td, hr, ul, li, a, br } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');

exports.pixeliaView = (pixelArt, errorMessage) => {
  const title = i18n.pixeliaTitle;
  const description = i18n.pixeliaDescription;
  const gridWidth = 50; 
  const gridHeight = 200; 

  const grid = table(
    { class: "pixelia-grid" },
    ...Array.from({ length: gridHeight }, (_, rowIndex) =>
      tr(
        ...Array.from({ length: gridWidth }, (_, colIndex) => {
          const pixel = pixelArt.find(p => p.x === colIndex + 1 && p.y === rowIndex + 1);
          const colorClass = pixel ? `pixel-color-${pixel.color.slice(1)}` : 'pixel-empty';
          const cellId = `cell-${rowIndex + 1}-${colIndex + 1}`;
          return td(
            {
              id: cellId,
              title: pixel ? `By: ${pixel.author}` : "",
              class: `pixel-cell ${colorClass}`
            },
            ""
          );
        })
      )
    )
  );

  const contributors = pixelArt.length > 0 ? [...new Set(pixelArt.flatMap(p => p.contributors_inhabitants || []))] : [];

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(description)
      )
    ),
    section(
      div({ class: "pixelia-form-wrap" },
        form({ method: "POST", action: "/pixelia/paint"},
          label({ for: "x" }, "X (1-50):"),
          input({ type: "number", id: "x", name: "x", min: 1, max: gridWidth, required: true }),
          br(),br(),
          label({ for: "y" }, "Y (1-200):"),
          input({ type: "number", id: "y", name: "y", min: 1, max: gridHeight, required: true }),
          br(),br(),
          label({ for: "color" }, i18n.colorLabel),
          select({ id: "color", name: "color", required: true },
            option({ value: "#000000", style: "background-color:#000000;" }, "Black"),
            option({ value: "#ffffff", style: "background-color:#ffffff;" }, "White"),
            option({ value: "#17f018", style: "background-color:#17f018;" }, "Green"),
            option({ value: "#ffbb00", style: "background-color:#ffbb00;" }, "Yellow"),
            option({ value: "#ff0000", style: "background-color:#ff0000;" }, "Red"),
            option({ value: "#0000ff", style: "background-color:#0000ff;" }, "Blue"),
            option({ value: "#ffff00", style: "background-color:#ffff00;" }, "Lime"),
            option({ value: "#00ff00", style: "background-color:#00ff00;" }, "Spring Green"),
            option({ value: "#00ffff", style: "background-color:#00ffff;" }, "Aqua"),
            option({ value: "#ff00ff", style: "background-color:#ff00ff;" }, "Fuchsia"),
            option({ value: "#a52a2a", style: "background-color:#a52a2a;" }, "Brown"),
            option({ value: "#800080", style: "background-color:#800080;" }, "Purple"),
            option({ value: "#808000", style: "background-color:#808000;" }, "Olive"),
            option({ value: "#00bfff", style: "background-color:#00bfff;" }, "Deep Sky Blue"),
            option({ value: "#d3d3d3", style: "background-color:#d3d3d3;" }, "Light Grey"),
            option({ value: "#ff6347", style: "background-color:#ff6347;" }, "Tomato")
          ),
          br(),br(),
          button({ type: "submit" }, i18n.paintButton)
        )
      ),
      errorMessage ? div({ class: "error-message" }, errorMessage) : null,
      div({ class: "total-pixels" },
        h2(`${i18n.totalPixels}: ${pixelArt.length}`)
      )
    ),
    hr(),
    section(
      div({ class: "main_content" },
        div({ class: "pixelia-grid-wrap" }, grid),
        pixelArt.length > 0 ? 
        div({ class: "contributors" },
          h2(i18n.contributorsTitle),
          ul(
            ...contributors.map(author =>
              li(a({ class: 'user-link', href: `/author/${encodeURIComponent(author)}` }, author))
            )
          )
        ) : null 
      )
    )
  );
};

