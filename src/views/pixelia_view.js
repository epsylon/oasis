const { div, h2, p, section, form, input, label, select, option, button, table, tr, td, hr, ul, li, a, br } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink} = require('./main_views');

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
              title: pixel ? `${pixel.author}` : "",
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
      div({ class: "tags-header module-header-line" },
        h2(title),
        p(description)
      )
    ),
    section(
      div({ class: "pixelia-form-wrap" },
        form({ method: "POST", action: "/pixelia/paint", class: "pixelia-paint-form" },
          label({ for: "x" }, "X (1-50):"),
          input({ type: "number", id: "x", name: "x", min: 1, max: gridWidth, required: true }),
          label({ for: "y" }, "Y (1-200):"),
          input({ type: "number", id: "y", name: "y", min: 1, max: gridHeight, required: true }),
          label({ for: "color" }, i18n.colorLabel),
          select({ id: "color", name: "color", required: true },
            option({ value: "#000000", class: "pixelia-swatch pixelia-swatch-000000" }, "Black"),
            option({ value: "#ffffff", class: "pixelia-swatch pixelia-swatch-ffffff" }, "White"),
            option({ value: "#17f018", class: "pixelia-swatch pixelia-swatch-17f018" }, "Green"),
            option({ value: "#ffbb00", class: "pixelia-swatch pixelia-swatch-ffbb00" }, "Yellow"),
            option({ value: "#ff0000", class: "pixelia-swatch pixelia-swatch-ff0000" }, "Red"),
            option({ value: "#0000ff", class: "pixelia-swatch pixelia-swatch-0000ff" }, "Blue"),
            option({ value: "#ffff00", class: "pixelia-swatch pixelia-swatch-ffff00" }, "Lime"),
            option({ value: "#00ff00", class: "pixelia-swatch pixelia-swatch-00ff00" }, "Spring Green"),
            option({ value: "#00ffff", class: "pixelia-swatch pixelia-swatch-00ffff" }, "Aqua"),
            option({ value: "#ff00ff", class: "pixelia-swatch pixelia-swatch-ff00ff" }, "Fuchsia"),
            option({ value: "#a52a2a", class: "pixelia-swatch pixelia-swatch-a52a2a" }, "Brown"),
            option({ value: "#800080", class: "pixelia-swatch pixelia-swatch-800080" }, "Purple"),
            option({ value: "#808000", class: "pixelia-swatch pixelia-swatch-808000" }, "Olive"),
            option({ value: "#00bfff", class: "pixelia-swatch pixelia-swatch-00bfff" }, "Deep Sky Blue"),
            option({ value: "#d3d3d3", class: "pixelia-swatch pixelia-swatch-d3d3d3" }, "Light Grey"),
            option({ value: "#ff6347", class: "pixelia-swatch pixelia-swatch-ff6347" }, "Tomato")
          ),
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
              li(userLink(author))
            )
          )
        ) : null 
      )
    )
  );
};

