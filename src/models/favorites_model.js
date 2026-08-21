const contentFavorites = require("../backend/content_favorites");

const safeArr = (v) => (Array.isArray(v) ? v : []);
const safeText = (v) => String(v || "").trim();

const getFn = (obj, names) => {
  for (const n of names) {
    if (obj && typeof obj[n] === "function") return obj[n].bind(obj);
  }
  return null;
};

const toTs = (d) => {
  const t = Date.parse(String(d || ""));
  return Number.isFinite(t) ? t : 0;
};

module.exports = ({ audiosModel, bookmarksModel, documentsModel, imagesModel, videosModel, mapsModel, padsModel, chatsModel, calendarsModel, torrentsModel, marketModel, shopsModel, eventsModel, tasksModel, reportsModel, votesModel, jobsModel, housingModel, projectsModel, transfersModel, forumModel, blogsModel, pollsModel, schoolModel }) => {
  const kindConfig = {
    audios: {
      base: "/audios/",
      getById: getFn(audiosModel, ["getAudioById", "getById"])
    },
    bookmarks: {
      base: "/bookmarks/",
      getById: getFn(bookmarksModel, ["getBookmarkById", "getById"])
    },
    documents: {
      base: "/documents/",
      getById: getFn(documentsModel, ["getDocumentById", "getById"])
    },
    images: {
      base: "/images/",
      getById: getFn(imagesModel, ["getImageById", "getById"])
    },
    maps: {
      base: "/maps/",
      getById: getFn(mapsModel, ["getMapById", "getById"])
    },
    videos: {
      base: "/videos/",
      getById: getFn(videosModel, ["getVideoById", "getById"])
    },
    pads: {
      base: "/pads/",
      getById: getFn(padsModel, ["getPadById", "getById"])
    },
    chats: {
      base: "/chats/",
      getById: getFn(chatsModel, ["getChatById", "getById"])
    },
    calendars: {
      base: "/calendars/",
      getById: getFn(calendarsModel, ["getCalendarById", "getById"])
    },
    torrents: {
      base: "/torrents/",
      getById: getFn(torrentsModel, ["getTorrentById", "getById"])
    },
    market: {
      base: "/market/",
      getById: getFn(marketModel, ["getItemById", "getById"])
    },
    shopProducts: {
      base: "/shops/product/",
      getById: getFn(shopsModel, ["getProductById"])
    },
    events: {
      base: "/events/",
      getById: getFn(eventsModel, ["getEventById", "getById"])
    },
    tasks: {
      base: "/tasks/",
      getById: getFn(tasksModel, ["getTaskById", "getById"])
    },
    reports: {
      base: "/reports/",
      getById: getFn(reportsModel, ["getReportById", "getById"])
    },
    school: {
      base: "/school/course/",
      getById: getFn(schoolModel, ["getCourseById", "getById"])
    },
    votes: {
      base: "/votes/",
      getById: getFn(votesModel, ["getVoteById", "getById"])
    },
    jobs: {
      base: "/jobs/",
      getById: getFn(jobsModel, ["getJobById", "getById"])
    },
    housing: {
      base: "/housing/",
      getById: getFn(housingModel, ["getHousingById", "getById"])
    },
    projects: {
      base: "/projects/",
      getById: getFn(projectsModel, ["getProjectById", "getById"])
    },
    transfers: {
      base: "/transfers/",
      getById: getFn(transfersModel, ["getTransferById", "getById"])
    },
    forum: {
      base: "/forum/",
      getById: getFn(forumModel, ["getForumById", "getById"])
    },
    blogs: {
      base: "/blogs/",
      getById: getFn(blogsModel, ["getBlogById", "getById"])
    },
    polls: {
      base: "/polls/",
      getById: getFn(pollsModel, ["getPollById", "getById"])
    },
    shops: {
      base: "/shops/",
      getById: getFn(shopsModel, ["getShopById", "getById"])
    }
  };

  const kindOrder = ["audios", "blogs", "bookmarks", "calendars", "chats", "documents", "events", "forum", "housing", "images", "jobs", "maps", "market", "pads", "polls", "projects", "reports", "school", "shopProducts", "shops", "tasks", "torrents", "transfers", "videos", "votes"];

  const hydrateKind = async (kind, ids) => {
    const cfg = kindConfig[kind];
    if (!cfg?.getById) return [];

    const out = await Promise.all(
      safeArr(ids).map(async (favId) => {
        const id = safeText(favId);
        if (!id) return null;
        try {
          const obj = await cfg.getById(id);
          if (!obj || typeof obj !== "object") return null;
          const viewId = safeText(obj?.key || obj?.id || id);

          return {
            content: obj,
            kind,
            favId: id,
            viewHref: `${cfg.base}${encodeURIComponent(viewId)}`,
            title: safeText(obj?.title) || safeText(obj?.name) || safeText(obj?.category) || safeText(obj?.url) || "",
            description: safeText(obj?.description) || "",
            tags: safeArr(obj?.tags),
            author: safeText(obj?.author || obj?.organizer || obj?.seller || obj?.from || ""),
            createdAt: obj?.createdAt || null,
            updatedAt: obj?.updatedAt || null,
            url: obj?.url || null,
            category: obj?.category || null
          };
        } catch {
          return null;
        }
      })
    );

    return out.filter(Boolean);
  };

  const loadAll = async () => {
    const sets = await Promise.all(kindOrder.map((k) => contentFavorites.getFavoriteSet(k)));
    const idsByKind = {};
    kindOrder.forEach((k, i) => {
      idsByKind[k] = Array.from(sets[i] || []);
    });

    const hydrated = await Promise.all(kindOrder.map((k) => hydrateKind(k, idsByKind[k])));
    const byKind = {};
    kindOrder.forEach((k, i) => {
      byKind[k] = hydrated[i] || [];
    });

    const flat = kindOrder.flatMap((k) => byKind[k]);

    const counts = { all: flat.length };
    for (const k of kindOrder) counts[k] = (byKind[k] || []).length;

    const recentFlat = flat
      .slice()
      .sort((a, b) => (toTs(b.updatedAt) || toTs(b.createdAt)) - (toTs(a.updatedAt) || toTs(a.createdAt)));

    return { byKind, flat, recentFlat, counts };
  };

  return {
    async listAll(opts = {}) {
      const filter = safeText(opts.filter || "all").toLowerCase();
      const { byKind, recentFlat, counts } = await loadAll();

      if (filter === "recent") {
        return { items: recentFlat, counts };
      }

      if (kindOrder.includes(filter)) {
        const items = byKind[filter] || [];
        const sorted = items
          .slice()
          .sort((a, b) => (toTs(b.updatedAt) || toTs(b.createdAt)) - (toTs(a.updatedAt) || toTs(a.createdAt)));
        return { items: sorted, counts };
      }

      const grouped = kindOrder.flatMap((k) =>
        (byKind[k] || [])
          .slice()
          .sort((a, b) => (toTs(b.updatedAt) || toTs(b.createdAt)) - (toTs(a.updatedAt) || toTs(a.createdAt)))
      );

      return { items: grouped, counts };
    },

    kinds: kindOrder.slice(),

    async removeFavorite(kind, id) {
      const k = safeText(kind);
      const favId = safeText(id);
      if (!k || !favId) return;
      await contentFavorites.removeFavorite(k, favId);
    }
  };
};

