const mediaFavorites = require("../backend/media-favorites");

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

module.exports = ({ audiosModel, bookmarksModel, documentsModel, imagesModel, videosModel }) => {
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
    videos: {
      base: "/videos/",
      getById: getFn(videosModel, ["getVideoById", "getById"])
    }
  };

  const kindOrder = ["audios", "bookmarks", "documents", "images", "videos"];

  const hydrateKind = async (kind, ids) => {
    const cfg = kindConfig[kind];
    if (!cfg?.getById) return [];

    const out = await Promise.all(
      safeArr(ids).map(async (favId) => {
        const id = safeText(favId);
        if (!id) return null;
        try {
          const obj = await cfg.getById(id);
          const viewId = safeText(obj?.key || obj?.id || id);

          return {
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
    const sets = await Promise.all(kindOrder.map((k) => mediaFavorites.getFavoriteSet(k)));
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

    const counts = {
      audios: byKind.audios.length,
      bookmarks: byKind.bookmarks.length,
      documents: byKind.documents.length,
      images: byKind.images.length,
      videos: byKind.videos.length,
      all: flat.length
    };

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

    async removeFavorite(kind, id) {
      const k = safeText(kind);
      const favId = safeText(id);
      if (!k || !favId) return;
      await mediaFavorites.removeFavorite(k, favId);
    }
  };
};

