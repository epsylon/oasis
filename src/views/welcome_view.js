const { form, button, div, h2, p, section, a, span, select, option, label, input, textarea, img, details, summary } = require("../server/node_modules/hyperaxe")
const { template, i18n, WIZARD_THEMES, renderAiAgentField } = require("./main_views")
const { renderRestoreStatus } = require("./backup_view")
const { renderSuggestedPub } = require("./invites_view")
const { config } = require("../server/SSB_server.js")
const { WIZARD_WORKFLOWS } = require("../models/workflows_model")

const FEED_TEXT_MIN = Number(config?.feed?.minLength ?? 1)
const FEED_TEXT_MAX = Number(config?.feed?.maxLength ?? 280)

const SECTIONS = {
  profile: ["welcomeStepIdentity", "welcomeHintIdentity"],
  ux: ["welcomeStepType", "welcomeHintType"],
  workflow: ["welcomeStepUse", "welcomeHintUse"],
  theme: ["welcomeStepLook", "welcomeHintLook"],
  community: ["welcomeStepCommunity", "welcomeHintCommunity"],
  greeting: ["welcomeStepIntro", "welcomeHintIntro"]
}

const submitRow = (text) => div({ class: "welcome-action" }, button({ type: "submit" }, text))

const pickCard = (name, value, current, title, image) => label({ class: "welcome-ux-option" },
  input({ type: "radio", name, value, ...(value === current ? { checked: true } : {}) }),
  img({ src: image, class: "welcome-ux-shot", alt: title }),
  span({ class: "welcome-ux-label" }, title)
)

const stepAction = (key, profile, status) => {
  if (key === "profile") return form({ method: "POST", action: "/welcome/profile", enctype: "multipart/form-data", class: "welcome-profile-form" },
    label(i18n.profileName),
    input({ type: "text", name: "name", maxlength: "80", value: profile.name || "", placeholder: profile.name || String(profile.id || "").slice(1, 9) }),
    label(i18n.profileImage),
    profile.image ? img({ loading: "lazy", class: "welcome-profile-avatar", src: `/image/256/${encodeURIComponent(profile.image)}` }) : null,
    input({ type: "file", name: "image", accept: "image/*" }),
    renderAiAgentField("aiAgent"),
    submitRow(i18n.welcomeStepProfileAction)
  )
  if (key === "ux") {
    let cfg = {}
    try { cfg = require("../configs/config-manager.js").getConfig() || {} } catch (_) {}
    const cur = ["ainav", "chats", "feed", "phone", "rooms"].includes(cfg.ux?.current) ? cfg.ux.current : "blocks"
    return form({ method: "POST", action: "/welcome/ux", class: "welcome-ux-form" },
      div({ class: "welcome-ux-grid" },
        pickCard("ux", "blocks", cur, i18n.uxModeMenus, "/assets/images/ux-blocks.png"),
        cfg.modules?.aiNavMod === "on" ? pickCard("ux", "ainav", cur, i18n.uxModeAINav, "/assets/images/ux-ainav.png") : null,
        cfg.modules?.chatsMod === "on" ? pickCard("ux", "chats", cur, i18n.uxModeChats, "/assets/images/ux-chats.png") : null,
        pickCard("ux", "feed", cur, i18n.uxModeFeed, "/assets/images/ux-feed.png"),
        cfg.modules?.phoneMod !== "off" ? pickCard("ux", "phone", cur, i18n.phoneTitle, "/assets/images/ux-phone.png") : null,
        cfg.modules?.roomsMod !== "off" ? pickCard("ux", "rooms", cur, i18n.roomsTitle, "/assets/images/ux-rooms.png") : null
      ),
      submitRow(i18n.welcomeStepUxAction)
    )
  }
  if (key === "workflow") {
    const selected = WIZARD_WORKFLOWS.includes(status.workflow) ? status.workflow : "full"
    return form({ method: "POST", action: "/welcome/workflow", class: "welcome-select-form" },
      select({ name: "workflow" },
        WIZARD_WORKFLOWS.map(k => option({ value: k, ...(k === selected ? { selected: true } : {}) }, k === "full" ? i18n.welcomeWorkflow_full : (i18n[`workflow_${k}`] || k)))
      ),
      submitRow(i18n.welcomeStepWorkflowAction)
    )
  }
  if (key === "theme") return form({ method: "POST", action: "/welcome/theme", class: "welcome-ux-form" },
    div({ class: "welcome-ux-grid" },
      WIZARD_THEMES.map(([value, name]) => pickCard("theme", value, status.theme, name, `/assets/images/theme-${value.toLowerCase()}.png`))
    ),
    submitRow(i18n.welcomeStepThemeAction)
  )
  if (key === "community") {
    const pubs = Array.isArray(status.pubs) ? status.pubs : []
    const bootstrap = status.bootstrap
    const canJoin = status.canJoin !== false
    return form({ method: "POST", action: "/welcome/community", class: "welcome-community-form" },
      bootstrap && bootstrap.running ? p(i18n.welcomeBootstrapRunning) : null,
      bootstrap ? renderRestoreStatus(bootstrap) : null,
      pubs.length && !canJoin
        ? p({ class: "invites-join-note" }, status.publicMode === true ? i18n.invitesJoinPubMode : i18n.invitesJoinLocalOnly)
        : null,
      ...pubs.map(entry => label({ class: "welcome-pick" },
        canJoin && !entry.exhausted ? input({ type: "checkbox", name: "pub", value: entry.code }) : null,
        renderSuggestedPub(entry, false)
      )),
      !pubs.length ? div({ class: "welcome-action" }, a({ href: "/invites", class: "filter-btn" }, i18n.invites)) : null,
      div({ class: "welcome-action" },
        canJoin && pubs.some(e => !e.exhausted) ? button({ type: "submit", name: "action", value: "join" }, i18n.welcomeJoinPubs) : null,
        button({ type: "submit", name: "action", value: "skip" }, i18n.welcomeNoFederation)
      )
    )
  }
  return form({ method: "POST", action: "/welcome/greeting", class: "welcome-greeting-form" },
    textarea({
      name: "text",
      required: true,
      minlength: String(FEED_TEXT_MIN),
      maxlength: String(FEED_TEXT_MAX),
      rows: 4,
      cols: 50,
      placeholder: i18n.welcomePmSubject
    }),
    submitRow(i18n.welcomeStepGreetingAction)
  )
}

exports.welcomeView = async (status, profile = {}) => {
  const steps = status.steps || {}
  const usable = status.usable || []
  const opened = usable.find(key => !steps[key])
  const html = template(
    i18n.welcomeTitle,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.welcomeTitle),
        p(i18n.welcomeDescription)
      ),
      status.pending
        ? form({ method: "POST", action: "/welcome/dismiss", class: "welcome-action" },
            input({ type: "hidden", name: "returnTo", value: "/" }),
            button({ type: "submit" }, i18n.welcomeSkip)
          )
        : null
    ),
    status.complete
      ? section(
          div({ class: "welcome-complete" },
            h2(i18n.welcomeCompleteTitle),
            p(i18n.welcomeCompleteText),
            div({ class: "welcome-action" }, a({ href: "/inhabitants", class: "filter-btn" }, i18n.welcomeFindPeople))
          )
        )
      : null,
    ...usable.map(key => section(
      details({ id: `step-${key}`, class: "welcome-step", ...(key === opened ? { open: true } : {}) },
        summary(
          h2(`${steps[key] ? "✓ " : ""}${i18n[SECTIONS[key][0]]}`),
          span({ class: "welcome-step-text" }, i18n[SECTIONS[key][1]])
        ),
        stepAction(key, profile || {}, status)
      )
    ))
  )
  return status.bootstrap && status.bootstrap.running ? html.replace('</head>', '<meta http-equiv="refresh" content="5"></head>') : html
}
