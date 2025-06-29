const { form, button, div, h2, p, section, table, thead, tr, th, td, a, tbody } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const moment = require("../server/node_modules/moment");

const getFilteredTags = (filter, tags) => {
  let filteredTags = tags.filter(t => !t.tombstone);

  if (filter === 'top') {
    filteredTags = [...filteredTags].sort((a, b) => b.count - a.count);
  } else {
    filteredTags = filteredTags.sort((a, b) => a.name.localeCompare(b.name));
  }

  return filteredTags;
};

const renderTagsTable = (filteredTags) => {
  return table({ class: 'tag-table' },
    thead(
      tr(
        th(i18n.tagsTableHeaderTag),
        th(i18n.tagsTableHeaderCount)
      )
    ),
    tbody(
      filteredTags.map(tag =>
        tr(
          td(a({ href: `/search?query=%23${encodeURIComponent(tag.name)}` }, tag.name)),
          td(`${tag.count}`)
        )
      )
    )
  );
};

const renderTagsCloud = (mergedTags) => {
  const maxCount = Math.max(...mergedTags.map(t => t.count), 1);
  return div({ class: 'tag-cloud-wrap' },
    mergedTags.map(tag => {
      const angle = Math.random() * 2 * Math.PI;
      const radius = 10 + Math.random() * 40;
      const x = 50 + Math.cos(angle) * radius;
      const y = 50 + Math.sin(angle) * radius;
      const weight = tag.count / maxCount;
      const fontSize = 12 + Math.round(weight * 32);
      const hue = 200 + Math.round(weight * 120);

      return a({
        href: `/search?query=%23${encodeURIComponent(tag.name)}`,
        class: 'tag-cloud-item',
        style: `
          left: ${x}%;
          top: ${y}%;
          font-size: ${fontSize}px;
          color: hsl(${hue},70%,60%);
        `
      }, tag.name);
    })
  );
};

exports.tagsView = async (tags, filter) => {
  const filteredTags = getFilteredTags(filter, tags);

  const title =
    filter === 'top'    ? i18n.tagsTopSectionTitle :
    filter === 'cloud'  ? i18n.tagsCloudSectionTitle :
                          i18n.tagsAllSectionTitle;

  return template(
    title,
    section(
      div({ class: 'tags-header' },
        h2(i18n.tagsTitle),
        p(i18n.tagsDescription)
      ),
      div({ class: 'filters' },
        form({ method: 'GET', action: '/tags' },
          button({ type: 'submit', name: 'filter', value: 'all',    class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.tagsFilterAll),
          button({ type: 'submit', name: 'filter', value: 'top',    class: filter === 'top' ? 'filter-btn active' : 'filter-btn' }, i18n.tagsFilterTop),
          button({ type: 'submit', name: 'filter', value: 'cloud',  class: 'filter-btn' }, i18n.tagsFilterCloud)
        )
      ),
      div({ class: 'tags-list' },
        filteredTags.length === 0
          ? p(i18n.tagsNoItems)
          : filter !== 'cloud'
            ? renderTagsTable(filteredTags)
            : renderTagsCloud(filteredTags)
      )
    )
  );
};

