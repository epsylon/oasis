const fs = require("fs")
const path = require("path")
const { form, button, div, h2, p, section, a, span, select, option, label, input, textarea, img } = require("../server/node_modules/hyperaxe")
const { template, i18n } = require("./main_views")
const { renderRestoreStatus } = require("./backup_view")
const { config } = require("../server/SSB_server.js")
const { WIZARD_WORKFLOWS } = require("../models/workflows_model")

const WISH_LEVELS = [
  { value: "whole", name: "settingsWishWhole", hint: "welcomeWishHint_whole" },
  { value: "mutuals", name: "settingsWishMutuals", hint: "welcomeWishHint_mutuals" },
  { value: "only-lan", name: "settingsWishOnlyLan", hint: "welcomeWishHint_lan" },
  { value: "local", name: "settingsWishLocal", hint: "welcomeWishHint_local" }
]

const FEED_TEXT_MIN = Number(config?.feed?.minLength ?? 1)
const FEED_TEXT_MAX = Number(config?.feed?.maxLength ?? 280)

const LANGUAGES = [
  ["English", "en"],
  ["Español", "es"],
  ["Français", "fr"],
  ["Euskara", "eu"],
  ["Català", "ca"],
  ["Galego", "gl"],
  ["Deutsch", "de"],
  ["Italiano", "it"],
  ["Português", "pt"],
  ["中文", "zh"],
  ["العربية", "ar"],
  ["हिन्दी", "hi"],
  ["Русский", "ru"]
]

const snhInvite = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "configs", "snh-invite-code.json"), "utf8"))
    if (!raw || !raw.code) return null
    return { name: String(raw.name || "").trim(), code: String(raw.code) }
  } catch (_) {
    return null
  }
}

const stepChip = (done) => span(
  { class: done ? "welcome-chip welcome-chip-done" : "welcome-chip" },
  done ? `✓ ${i18n.welcomeStepDone || "done"}` : (i18n.welcomeStepPending || "pending")
)

const linkAction = (href, label) => div({ class: "welcome-action" },
  a({ href, class: "filter-btn" }, label)
)

const languageAction = (lang) => form({ method: "POST", action: "/language", class: "welcome-action welcome-language-form" },
  select({ name: "language" }, LANGUAGES.map(([label, code]) => option({ value: code, ...(code === lang ? { selected: true } : {}) }, label))),
  button({ type: "submit", class: "filter-btn" }, i18n.setLanguage || "Set Language")
)

const stepContent = (key, lang, profile, status) => {
  if (key === "language") return {
    title: i18n.welcomeStepLanguageTitle || "Choose your language",
    text: i18n.welcomeStepLanguageText || "Oasis speaks different languages. You can change it whenever you want.",
    action: languageAction(lang)
  }
  if (key === "profile") return {
    title: i18n.welcomeStepProfileTitle || "Edit your profile",
    text: i18n.welcomeStepProfileText || "Pick a name, add a description and set a picture so other inhabitants can recognise you.",
    action: form({ method: "POST", action: "/welcome/profile", enctype: "multipart/form-data", class: "welcome-profile-form" },
      label(i18n.profileName || "Name"),
      input({ type: "text", name: "name", maxlength: "80", value: profile.name || "", required: true }),
      label(i18n.profileDescription || "Description"),
      textarea({ name: "description", rows: "3", maxlength: "600" }, profile.description || ""),
      label(i18n.profileImage || "Image"),
      img({ loading: 'lazy', class: "welcome-profile-avatar", src: profile.image ? `/image/256/${encodeURIComponent(profile.image)}` : "/assets/images/default-avatar.png" }),
      input({ type: "file", name: "image", accept: "image/*" }),
      div({ class: "welcome-action" },
        button({ type: "submit", class: "filter-btn" }, i18n.welcomeStepProfileAction || "Save Profile")
      )
    )
  }
  if (key === "federation") {
    const invite = snhInvite()
    const bootstrap = status && status.bootstrap
    if (bootstrap && bootstrap.running) {
      return {
        title: invite && invite.name ? `${i18n.welcomeJoinPub || "Join"} ${invite.name}` : (i18n.welcomeStepFederationTitle || "Join Main Network"),
        text: i18n.welcomeBootstrapRunning || "Loading the pub's snapshot. The pub is joined as soon as it finishes.",
        extra: renderRestoreStatus(bootstrap),
        action: null
      }
    }
    return {
      title: invite && invite.name ? `${i18n.welcomeJoinPub || "Join"} ${invite.name}` : (i18n.welcomeStepFederationTitle || "Join Main Network"),
      text: i18n.welcomeStepFederationText || "Connect to our pub to meet other inhabitants and start replicating.",
      extra: bootstrap && !bootstrap.running ? renderRestoreStatus(bootstrap) : null,
      action: div({ class: "welcome-action" },
        invite
          ? form({ method: "POST", action: "/settings/invite/accept" },
              input({ type: "hidden", name: "invite", value: invite.code }),
              button({ type: "submit", class: "filter-btn" }, i18n.welcomeJoinPubButton || "Join Pub")
            )
          : a({ href: "/invites", class: "filter-btn" }, i18n.welcomeStepFederationAction || "Go to invites")
      )
    }
  }
  if (key === "larp") return {
    title: i18n.welcomeStepLarpTitle || "Join \"The Academy\"",
    text: i18n.welcomeStepLarpText || "Join our live action role playing game.",
    action: div({ class: "welcome-action" },
      form({ method: "POST", action: "/larp/join" },
        input({ type: "hidden", name: "house", value: "academia" }),
        input({ type: "hidden", name: "returnTo", value: "/welcome" }),
        button({ type: "submit", class: "filter-btn" }, i18n.welcomeStepLarpAction || "Join L.A.R.P.")
      )
    )
  }
  if (key === "ux") {
    let cfg = {}
    try { cfg = require("../configs/config-manager.js").getConfig() || {} } catch (_) {}
    const cur = ["ainav", "chats", "feed", "phone"].includes(cfg.ux?.current) ? cfg.ux.current : "blocks"
    const chatsOn = cfg.modules?.chatsMod === "on"
    const aiOn = cfg.modules?.aiNavMod === "on"
    const phoneOn = cfg.modules?.phoneMod !== "off"
    const uxCard = (value, title, image) => label({ class: "welcome-ux-option" },
      input({ type: "radio", name: "ux", value, ...(value === cur ? { checked: true } : {}) }),
      img({ src: image, class: "welcome-ux-shot", alt: title }),
      span({ class: "welcome-ux-label" }, title)
    )
    return {
      title: i18n.welcomeStepUxTitle || "Choose your interface",
      text: i18n.welcomeStepUxText || "Pick how Oasis should look. You can change it later in Settings.",
      action: form({ method: "POST", action: "/welcome/ux", class: "welcome-ux-form" },
        div({ class: "welcome-ux-grid" },
          uxCard("blocks", i18n.uxModeMenus || "Blocks", "/assets/images/ux-blocks.png"),
          aiOn ? uxCard("ainav", i18n.uxModeAINav || "AI", "/assets/images/ux-ainav.png") : null,
          chatsOn ? uxCard("chats", i18n.uxModeChats || "Conversations", "/assets/images/ux-chats.png") : null,
          uxCard("feed", i18n.uxModeFeed || "Microblogging", "/assets/images/ux-feed.png"),
          phoneOn ? uxCard("phone", i18n.phoneTitle || "Phone", "/assets/images/ux-phone.png") : null
        ),
        div({ class: "welcome-action" },
          button({ type: "submit", class: "filter-btn" }, i18n.welcomeStepUxAction || "Save View")
        )
      )
    }
  }
  if (key === "wish") {
    const current = WISH_LEVELS.some(w => w.value === (status && status.wish)) ? status.wish : "whole"
    return {
      title: i18n.welcomeStepWishTitle || "What level of exposure do you want in your experience?",
      text: i18n.welcomeStepWishText || "This is your WISH: it decides whose content reaches you.",
      action: form({ method: "POST", action: "/welcome/wish", class: "welcome-choices-form" },
        div({ class: "welcome-choices" },
          WISH_LEVELS.map(w => label({ class: "welcome-choice" },
            input({ type: "radio", name: "wish", value: w.value, ...(w.value === current ? { checked: true } : {}) }),
            span({ class: "welcome-choice-name" }, i18n[w.name] || w.value),
            span({ class: "welcome-choice-hint" }, i18n[w.hint] || "")
          ))
        ),
        div({ class: "welcome-action" },
          button({ type: "submit", class: "filter-btn" }, i18n.welcomeStepWishAction || "Save my wish")
        )
      )
    }
  }
  if (key === "workflow") {
    const selected = status && WIZARD_WORKFLOWS.includes(status.workflow) ? status.workflow : "full"
    return {
      title: i18n.welcomeStepWorkflowTitle || "What's the use for OASIS you have in mind?",
      text: i18n.welcomeStepWorkflowText || "Pick the configuration that fits you and only the useful modules stay on.",
      action: form({ method: "POST", action: "/welcome/workflow", class: "welcome-choices-form" },
        div({ class: "welcome-choices" },
          WIZARD_WORKFLOWS.map(k => label({ class: "welcome-choice" },
            input({ type: "radio", name: "workflow", value: k, ...(k === selected ? { checked: true } : {}) }),
            span({ class: "welcome-choice-name" }, k === "full" ? (i18n.welcomeWorkflow_full || "Default") : (i18n[`workflow_${k}`] || k)),
            span({ class: "welcome-choice-hint" }, i18n[`welcomeWorkflowHint_${k}`] || "")
          ))
        ),
        div({ class: "welcome-action" },
          button({ type: "submit", class: "filter-btn" }, i18n.welcomeStepWorkflowAction || "Use this configuration")
        )
      )
    }
  }
  return {
    title: i18n.welcomeStepGreetingTitle || "Send a \"Hello world!\"",
    text: i18n.welcomeStepGreetingText || "Send a message so other inhabitants can discover you.",
    action: form({ method: "POST", action: "/welcome/greeting", class: "welcome-greeting-form" },
      textarea({
        name: "text",
        required: true,
        minlength: String(FEED_TEXT_MIN),
        maxlength: String(FEED_TEXT_MAX),
        rows: 4,
        cols: 50,
        placeholder: i18n.feedPlaceholder
      }),
      div({ class: "welcome-action" },
        button({ type: "submit", class: "filter-btn" }, i18n.welcomeStepGreetingAction || "Send Feed")
      )
    )
  }
}

exports.welcomeView = async (status, currentLanguage, profile = {}) => {
  const steps = (status && status.steps) || {}
  const usable = (status && status.usable) || []
  const lang = String(currentLanguage || "en")
  const bootstrapping = !!(status && status.bootstrap && status.bootstrap.running)

  const html = template(
    i18n.welcomeTitle || "Welcome",
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.welcomeTitle || "Welcome"),
        p(i18n.welcomeDescription || "A few things worth doing before you start.")
      ),
      div({ class: "welcome-progress" },
        p(span({ class: "welcome-progress-label" }, `${i18n.welcomeProgress || "Completed"}: `), `${status.done}/${status.total}`),
        status.pending
          ? form({ method: "POST", action: "/welcome/dismiss" },
              button({ type: "submit", class: "filter-btn" }, i18n.welcomeSkip || "Skip for now")
            )
          : null
      ),
      status.complete
        ? div({ class: "welcome-complete" },
            h2(i18n.welcomeCompleteTitle || "All set."),
            p(i18n.welcomeCompleteText || "Your node is ready. The network grows with the people you follow."),
            div({ class: "welcome-action" }, a({ href: "/inhabitants", class: "filter-btn" }, i18n.welcomeFindPeople || "Find inhabitants"))
          )
        : null,
      div({ class: "welcome-steps" },
        usable.map((key, idx) => {
          const done = steps[key] === true
          const content = stepContent(key, lang, profile || {}, status)
          return div({ id: `step-${key}`, class: done ? "welcome-step welcome-step-done" : "welcome-step" },
            div({ class: "welcome-step-head" },
              span({ class: "welcome-step-number" }, String(idx + 1)),
              h2({ class: "welcome-step-title" }, content.title),
              stepChip(done)
            ),
            content.text ? p({ class: "welcome-step-text" }, content.text) : null,
            content.extra || null,
            content.action,
            content.note ? p({ class: "welcome-step-note" }, content.note) : null
          )
        })
      )
    )
  )
  return bootstrapping ? html.replace('</head>', '<meta http-equiv="refresh" content="5"></head>') : html
}
