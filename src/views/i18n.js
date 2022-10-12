const { a, em, strong } = require("hyperaxe");

const i18n = {
  en: {
    // navbar items
    extended: "Extended",
    extendedDescription: [
      "When you support someone you may download posts from the inhabitants they support, and those posts show up here, sorted by recency.",
    ],
    popular: "Highlights",
    popularDescription: [
      "Posts from inhabitants in your network, ",
      strong("sorted by spreads"),
      ". Select the period of time, to get a list.",
    ],
    day: "Day",
    week: "Week",
    month: "Month",
    year: "Year",
    latest: "Latest",
    latestDescription: [
      strong("Posts"),
      " from yourself and inhabitants you support, sorted by recency.",
    ],
    topics: "Themes",
    topicsDescription: [
      strong("Themes"),
      " from yourself and inhabitants you support, sorted by recency. Select the timestamp of any post to see the rest of the thread.",
    ],
    summaries: "Summaries",
    summariesDescription: [
      strong("Themes and some comments"),
      " from yourself and inhabitants you support, sorted by recency. Select the timestamp of any post to see the rest of the thread.",
    ],
    threads: "Threads",
    threadsDescription: [
      strong("Posts that have comments"),
      " from inhabitants you support and your extended network, sorted by recency. Select the timestamp of any post to see the rest of the thread.",
    ],
    profile: "Avatar",
    inhabitants: "Inhabitants", 
    manualMode: "Manual Mode",
    mentions: "Mentions",
    mentionsDescription: [
      strong("Posts that @mention you"),
      ", sorted by recency.",
    ],
    private: "Inbox",
    peers: "Peers",
    privateDescription: [
      "The latest comment from ",
      strong("private threads that include you"),
      ", sorted by recency. Private posts are encrypted for your public key, and have a maximum of 7 recipients. Recipients cannot be added after the thread has started. Select the timestamp to view the full thread.",
    ],
    search: "Search",
    imageSearch: "Image Search",
    settings: "Settings",
    // post actions
    comment: "Comment",
    subtopic: "Subtopic",
    json: "JSON",
    // relationships
    unfollow: "Unsupport",
    follow: "Support",
    block: "Block",
    unblock: "Unblock",
    newerPosts: "Newer posts",
    olderPosts: "Older posts",
    feedRangeEmpty: "The given range is empty for this feed. Try viewing the ",
    seeFullFeed: "full feed",
    feedEmpty: "The local client has never seen posts from this account.",
    beginningOfFeed: "This is the beginning of the feed",
    noNewerPosts: "No newer posts have been received yet.",
    relationshipNotFollowing: "",
    relationshipTheyFollow: "",
    relationshipMutuals: "",
    relationshipFollowing: "You are supporting",
    relationshipYou: "You",
    relationshipBlocking: "You are blocking",
    relationshipNone: "",
    relationshipConflict: "",
    relationshipBlockingPost: "Blocked post",
    // spreads view
    viewLikes: "View spreads",
    spreadedDescription: "List of posts spread by the inhabitant.",
    likedBy: " -> Spreads",
    // composer
    attachFiles: "Attach files",
    mentionsMatching: "Matching mentions",
    preview: "Preview",
    publish: "Publish",
    contentWarningPlaceholder: "Add a subject to the post (optional)",
    publishWarningPlaceholder: "...",
    publishCustomDescription: [
      "REMEMBER: Due to blockchain technology, once a post is published it cannot be edited or deleted.",
    ],
    commentWarning: [
      "REMEMBER: Due to blockchain technology, once a post is published it cannot be edited or deleted.",
    ],
    commentPublic: "public",
    commentPrivate: "private",
    commentLabel: ({ publicOrPrivate, markdownUrl }) => [
    ],
    publishLabel: ({ markdownUrl, linkTarget }) => [
      "REMEMBER: Due to blockchain technology, once a post is published it cannot be edited or deleted.",
    ],
    replyLabel: ({ markdownUrl }) => [
      "REMEMBER: Due to blockchain technology, once a post is published it cannot be edited or deleted.",
    ],
    publishCustomInfo: ({ href }) => [
      "If you have experience, you can also ",
      a({ href }, "publish an advanced post"),
      ".",
    ],
    publishBasicInfo: ({ href }) => [
      "If you have not experience, you should ",
      a({ href }, "publish a post"),
      ".",
    ],
    publishCustom: "Publish advanced post",
    subtopicLabel: ({ markdownUrl }) => [
      "Create a ",
      strong("public subtopic"),
      " of this post with ",
      a({ href: markdownUrl }, "Markdown"),
      ". Posts cannot be edited or deleted. To respond to an entire thread, select ",
      strong("comment"),
      " instead. Preview shows attached media.",
    ],
    // settings
    versionIntro: "Version",
    info: "Info",
    settingsIntro: ({ version }) => [
      `SNH-Oasis: ${version}...`,
    ],
    // SNH
    docsUrls: ({ snhUrl, projectUrl, roleUrl }) => [
      a({ href: snhUrl }, "Website"),
      " | ",
      a({ href: projectUrl }, "The Project Network"),
      " | ",
      a({ href: roleUrl }, "Role-playing"),
    ],
    theme: "Theme",
    themeIntro:
      "Choose a theme.",
    setTheme: "Set theme",
    language: "Language",
    languageDescription:
      "If you'd like to use another language, select it here.",
    setLanguage: "Set language",
    status: "Status",
    peerConnections: "Peers",
    online: "Online",
    supported: "Supported",
    recommended: "Recommended", 
    blocked: "Blocked",
    noConnections: "No peers connected.",
    noSupportedConnections: "No peers supported.",
    noBlockedConnections: "No peers blocked.",
    noRecommendedConnections: "No peers recommended.",
    connectionActionIntro:
      "",
    startNetworking: "Start networking",
    stopNetworking: "Stop networking",
    restartNetworking: "Restart networking",
    sync: "Sync",
    indexes: "Indexes",
    indexesDescription:
      "Rebuilding your indexes is safe, and may fix some types of bugs.",
    invites: "Invites",
    invitesDescription:
      "Use the PUB's invite codes here.",
    acceptInvite: "Accept invite",
    acceptedInvites: "Accepted",
    noInvites: "No invites accepted.",
    // search page
    searchLabel: "Seek inhabitants and keywords, among the posts you have downloaded.",
    // image search page
    imageSearchLabel: "Enter words to search for images labelled with them.",
    // posts and comments
    commentDescription: ({ parentUrl }) => [
      " commented on ",
      a({ href: parentUrl }, " thread"),
    ],
    commentTitle: ({ authorName }) => [`Comment on @${authorName}'s post`],
    subtopicDescription: ({ parentUrl }) => [
      " created a subtopic from ",
      a({ href: parentUrl }, " a post"),
    ],
    subtopicTitle: ({ authorName }) => [`Subtopic on @${authorName}'s post`],
    mysteryDescription: "posted a mysterious post",
    // misc
    oasisDescription: "SNH Project Network",
    submit: "Submit",
    editProfile: "Edit Avatar",
    editProfileDescription:
      "",
    profileName: "Avatar name (plain text)",
    profileImage: "Avatar image",
    profileDescription: "Avatar description (Markdown)",
    hashtagDescription:
      "Posts from inhabitants in your network that reference this #hashtag, sorted by recency.",
    rebuildName: "Rebuild database",
  },
  /* spell-checker: disable */
  es: {
    latest: "Novedades",
    profile: "Avatar",
    inhabitants: "Habitantes",
    search: "Buscar",
    imageSearch: "Buscar Imágenes",
    settings: "Configuración",
    // navbar items
    extended: "Extendida",
    extendedDescription: [
      "Cuando apoyes a alguien, podrás descargar publicaciones de habitantes que apoye, y esas publicaciones aparecerán aquí, ordenadas por las más recientes.",
    ],
    popular: "Destacadas",
    day: "Día",
    week: "Semana",
    month: "Mes",
    year: "Año",
    popularDescription: [
      "Posts de habitantes de tu red, ",
      strong("ordenados por difusiones"),
      ". Selecciona el periodo de tiempo, para obtener una lista.",
    ],
    latestDescription: [
      strong("Posts"), 
      " tuyos y de habitantes que apoyas, ordenados por los más recientes.",
    ],
    topics: "Temáticas",
    topicsDescription: [
      strong("Temáticas"),
      " tuyas y de habitantes que apoyas, ordenadas por las más recientes. Selecciona la hora de una publicación para leer el hilo completo.",
    ],
    summaries: "Resumen",
    summariesDescription: [
      strong("Temáticas y algunos comentarios"),
      " tuyos y de habitantes que apoyas, ordenado por lo más reciente. Selecciona la hora de una publicación para leer el hilo completo.",
    ],
    threads: "Hilos",
    threadsDescription: [
      strong("Posts que tienen comentarios"),
      " de habitantes que apoyas y de tu red extendida, ordenados por los más recientes. Selecciona la hora de una publicación para leer el hilo completo.",
    ],
    manualMode: "Modo manual",
    mentions: "Menciones",
    mentionsDescription: [
      strong("Posts que te @mencionan"),
      ", ordenados por los más recientes.",
    ],
    private: "Buzón",
    peers: "Enlaces",
    privateDescription: [
      "Los comentarios más recientes de ",
      strong("hilos privados que te incluyen"),
      ". Las publicaciones privadas están cifradas para ti, y contienen un máximo de 7 destinatarios. No se podrán añadir nuevos destinarios después de que empieze el hilo. Selecciona la hora de una publicación para leer el hilo completo.",
    ],
    // post actions
    comment: "Comentar",
    reply: "Responder",
    subtopic: "Subhilo",
    json: "JSON",
    // relationships
    relationshipNotFollowing: "",
    relationshipTheyFollow: "",
    relationshipMutuals: "",
    relationshipFollowing: "Apoyando",
    relationshipYou: "Tú",
    relationshipBlocking: "Bloqueado",
    relationshipNone: "",
    relationshipConflict: "",
    relationshipBlockingPost: "Post bloqueado",
    unfollow: "Dejar de apoyar",
    follow: "Apoyar",
    block: "Bloquear",
    unblock: "Desbloquear",
    newerPosts: "Nuevos posts",
    olderPosts: "Anteriores posts",
    feedRangeEmpty: "El rango requerido está vacío para éste hilo. Prueba a ver el ",
    seeFullFeed: "hilo completo",
    feedEmpty: "No tienes posts de ésta cuenta.",
    beginningOfFeed: "Éste es el comienzo del hilo",
    noNewerPosts: "No se han recibido nuevos posts aún.",
    // spreads view
    viewLikes: "Ver difusiones",
    spreadedDescription: "Listado de posts difundidos del habitante.",
    likedBy: " -> Difusiones",
    // composer
    attachFiles: "Agregar archivos",
    mentionsMatching: "Menciones coincidentes",
    preview: "Vista previa",
    publish: "Publicar",
    contentWarningPlaceholder: "Añade un asunto al post (opcional)",
    publishWarningPlaceholder: "...",
    publishCustomDescription: [
      "RECUERDA: Debido a la tecnología blockchain, una vez publicado un post, no podrá ser editado o borrado.",
    ],
    commentWarning: [
      " RECUERDA: Debido a la tecnología blockchain, una vez publicado un post, no podrá ser editado o borrado.",
    ],
    commentPublic: "público",
    commentPrivate: "privado",
    commentLabel: ({ publicOrPrivate, markdownUrl }) => [
    ],
    publishLabel: ({ markdownUrl, linkTarget }) => [
      "RECUERDA: Debido a la tecnología blockchain, una vez publicado un post, no podrá ser editado o borrado.",
    ],
    publishCustomInfo: ({ href }) => [
      "Si tienes experiencia, también puedes ",
      a({ href }, "publicar un post avanzado"),
      ".",
    ],
    publishBasicInfo: ({ href }) => [
      "Si no tienes experiencia, lo mejor es ",
      a({ href }, "publicar un post normal"),
      ".",
    ],
    publishCustom: "Publicar post avanzado",
    replyLabel: ({ markdownUrl }) => [
      "RECUERDA: Debido a la tecnología blockchain, una vez publicados los posts, no podrán ser editados o borrados.",
    ],
    // settings-es
    versionIntro: "Versión",
    info: "Info",
    settingsIntro: ({ version }) => [
      `SNH-Oasis: ${version}...`,
    ],
    // SNH
    docsUrls: ({ snhUrl, projectUrl, roleUrl }) => [
      a({ href: snhUrl }, "Website"),
      " | ",
      a({ href: projectUrl }, "The Project Network"),
      " | ",
      a({ href: roleUrl }, "Role-playing"),
    ],
    theme: "Tema",
    themeIntro:
      "Elige un tema.",
    setTheme: "Seleccionar tema",
    language: "Idioma",
    languageDescription:
      "Si quieres usar otro idioma, seleccionalo aquí.",
    setLanguage: "Seleccionar idioma",
    status: "Estado",
    peerConnections: "Enlaces",
    online: "Online",
    supported: "Soportados",
    recommended: "Recomendados",
    blocked: "Bloqueados",
    noConnections: "Sin enlaces conectados.",
    noSupportedConnections: "Sin enlaces soportados.",
    noBlockedConnections: "Sin enlaces bloqueados.",
    noRecommendedConnections: "Sin enlaces recomendados.",
    connectionActionIntro:
      "",
    startNetworking: "Iniciar red",
    stopNetworking: "Detener red",
    restartNetworking: "Reiniciar red",
    sync: "Sincronizar",
    indexes: "Índices",
    indexesDescription:
      "Reconstruir la caché de forma segura, puede solucionar algunos errores si se presentan.",
    invites: "Invitaciones",
    invitesDescription:
      "Utiliza los códigos de invitación de los PUBs aquí.",
    acceptInvite: "Aceptar invitación",
    acceptedInvites: "Aceptadas",
    noInvites: "Sin invitaciones aceptadas.",
    // search page
    searchLabel:
      "Busca habitantes y palabras clave, entre los posts que tienes descargados.",
    // posts and comments
    commentDescription: ({ parentUrl }) => [
      " comentó en el hilo ",
      a({ href: parentUrl }, ""),
    ],
    replyDescription: ({ parentUrl }) => [
      " respondido al ",
      a({ href: parentUrl }, "post "),
    ],
    // image search page
    imageSearchLabel:
      "Busca entre los títulos de las imágenes que tienes descargadas.",
    // posts and comments
    commentTitle: ({ authorName }) => [
      `Comentó en el post de @${authorName}`,
    ],
    subtopicDescription: ({ parentUrl }) => [
      " creó un nuevo hilo para ",
      a({ href: parentUrl }, "este post"),
    ],
    subtopicTitle: ({ authorName }) => [
      `Nuevo hilo en el post de @${authorName}`,
    ],
    mysteryDescription: "publicó un post misterioso",
    // misc
    oasisDescription:
      "Red de Proyectos de SNH",
    submit: "Aceptar",
    editProfile: "Editar avatar",
    editProfileDescription:
      "",
    profileName: "Nombre del avatar (texto)",
    profileImage: "Imagen del avatar",
    profileDescription: "Descripción del avatar (Markdown)",
    hashtagDescription:
      "Posts de habitantes en tu red que referencian a ésta #etiqueta, ordenados por los más recientes.",
    rebuildName: "Reconstruir base de datos",
  },
};

module.exports = i18n;
