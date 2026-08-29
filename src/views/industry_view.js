const { form, button, div, h2, p, section, input, label, textarea, br, a, span, select, option, ul, li, img, video, audio, table, thead, tbody, tr, td, th } = require("../server/node_modules/hyperaxe")
const { template, i18n, renderOpinionsVoting, renderEngagement, userLink, renderStateChip, renderLifespanChip, renderEcoTax, renderSpreadButton, renderContentActions , renderSpreadEditWarning, renderSubscriptionBox } = require("./main_views")
const moment = require("../server/node_modules/moment")
const { config } = require("../server/SSB_server.js")
const { renderMapEmbedWithZoom } = require("./maps_view")
const { renderUrl } = require("../backend/renderUrl")

const userId = config.keys.id

const renderMediaBlob = (value, attrs = {}) => {
  if (!value) return null
  const s = String(value).trim()
  if (!s) return null
  if (s.startsWith('&')) return img({ src: `/blob/${encodeURIComponent(s)}`, ...attrs })
  const mVideo = s.match(/\[video:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mVideo) return video({ controls: true, class: attrs.class || 'post-video', src: `/blob/${encodeURIComponent(mVideo[1])}` })
  const mAudio = s.match(/\[audio:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mAudio) return audio({ controls: true, class: attrs.class || 'post-audio', src: `/blob/${encodeURIComponent(mAudio[1])}` })
  const mImg = s.match(/!\[[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mImg) return img({ src: `/blob/${encodeURIComponent(mImg[1])}`, class: attrs.class || 'post-image' })
  return null
}

const SECTORS = ["software", "hardware", "agriculture", "textile", "energy", "food", "construction", "media", "services", "other"]
const POLICIES = ["open", "vote", "invite"]

const FILTERS = [
  { key: "ALL", i18n: "industryFilterAll", title: "industryAllTitle" },
  { key: "MINE", i18n: "industryFilterMine", title: "industryMineTitle" },
  { key: "ACTIVE", i18n: "industryFilterActive", title: "industryActiveTitle" },
  { key: "PAUSED", i18n: "industryFilterPaused", title: "industryPausedTitle" },
  { key: "DISSOLVED", i18n: "industryFilterDissolved", title: "industryDissolvedTitle" },
  { key: "BLUEPRINTS", i18n: "industryFilterBlueprints", title: "industryBlueprints" },
  { key: "BUILDS", i18n: "industryFilterBuilds", title: "industryBuilds" },
  { key: "MEMBER", i18n: "industryFilterMember", title: "industryMemberTitle" },
  { key: "RULES", i18n: "industryFilterRules", title: "industryRulesTitle" }
]

const renderIndustryRules = () => {
  const points = [
    i18n.industryRulesIntro,
    i18n.industryRulesSteward,
    i18n.industryRulesMembership,
    i18n.industryRulesQuorum,
    i18n.industryRulesMajority,
    i18n.industryRulesDecisions,
    i18n.industryRulesBlueprints,
    i18n.industryRulesBuilds,
    i18n.industryRulesContributions,
    i18n.industryRulesLaborRate,
    i18n.industryRulesShares,
    i18n.industryRulesDistribution,
    i18n.industryRulesTreasury
  ]
  return div({ class: "card" },
    h2(i18n.industryRulesTitle || "Rules"),
    div({ class: "rules-points" },
      points.filter(Boolean).map((t, i) =>
        div({ class: "rules-point" },
          span({ class: "rules-point-num" }, String(i + 1)),
          span({ class: "rules-point-text" }, t)
        )
      )
    )
  )
}

const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v || "").trim()

const sectorLabel = (key) => i18n[`industrySector_${key}`] || key
const policyLabel = (key) => i18n[`industryPolicy_${key}`] || key

const renderStatusChip = (status) => {
  const s = String(status || "ACTIVE").toUpperCase()
  const map = {
    ACTIVE: ["whole", "🟢", i18n.industryStatusActive || "ACTIVE"],
    PAUSED: ["half", "⏸", i18n.industryStatusPaused || "PAUSED"],
    DISSOLVED: ["tombstoned", "⚰", i18n.industryStatusDissolved || "DISSOLVED"]
  }
  const [variant, icon, text] = map[s] || map.ACTIVE
  return renderStateChip(variant, icon, text)
}

const renderStatusBlock = (fc, returnTo) => {
  const isMember = safeArr(fc.members).includes(userId)
  const status = String(fc.status || "ACTIVE").toUpperCase()
  const myPause = safeArr(fc.pauseVoters).includes(userId)
  return div({ class: "industry-section industry-status-block" },
    div({ class: "card-chips-row" }, renderStatusChip(status)),
    (isMember && status !== "DISSOLVED")
      ? [
          p({ class: "industry-hint" }, `${i18n.industryPauseVotes || "Pause votes"}: ${fc.pauseYes || 0}`),
          form({ method: "POST", action: `/industry/govern/${encodeURIComponent(fc.id)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            input({ type: "hidden", name: "subject", value: "pause" }),
            input({ type: "hidden", name: "ref", value: "" }),
            button({ type: "submit", name: "choice", value: myPause ? "no" : "yes", class: "filter-btn" }, myPause ? (i18n.industryResumeButton || "Vote to resume") : (i18n.industryPauseButton || "Vote to pause"))
          )
        ]
      : null
  )
}

const renderFacilityList = exports.renderFacilityList = (facilities, filter, spreadMap = new Map()) => {
  const list = safeArr(facilities)
  if (!list.length) return p(i18n.industryNoFacilitiesFound || "No facilities found.")
  return div({ class: "tribe-grid" },
    list.map((fc) => {
      const isOwn = fc.steward && String(fc.steward) === String(userId)
      const isMember = safeArr(fc.members).includes(userId)
      const href = `/industry/${encodeURIComponent(fc.id)}`
      const chips = [
        renderStatusChip(fc.status),
        renderStateChip("whole", "🏭", sectorLabel(fc.sector)),
        renderStateChip("half", "⚖", policyLabel(fc.membershipPolicy)),
        isMember ? renderStateChip("whole", "★", i18n.industryMemberBadge || "MEMBER") : null,
        renderLifespanChip(fc.lifetime, i18n),
        fc.subscriptionIn === true
          ? renderStateChip("mutuals", "✉", i18n.subscriptionOn)
          : (fc.subscriptionIn === false ? renderStateChip("closed", "✉", i18n.subscriptionOff) : null)
      ].filter(Boolean)
      return div({ class: "trending-card tribes-card industry-card" + (isOwn ? " own-content" : "") },
        div({ class: "card-header activity-card-header" },
          span(),
          renderContentActions(fc.id || fc.key, href, { spread: spreadMap.get(fc.id || fc.key) || null, author: fc.steward })
        ),
        div({ class: "card-section tribes-card-body" },
          div({ class: "tribe-card-image-wrapper" },
            a({ href }, renderMediaBlob(fc.image, { class: "tribe-card-hero-image" }) || div({ class: "industry-card-noimage" }, span("🏭"))),
            isMember
              ? form({ method: "GET", action: href, class: "tribe-visit-btn-wrapper" },
                  button({ type: "submit", class: "filter-btn" }, String(i18n.industryVisitButton || "VISIT").toUpperCase())
                )
              : null
          ),
          div({ class: "tribe-card-body" },
            div({ class: "shop-title-row" },
              h2({ class: "tribe-card-title" }, a({ href }, safeText(fc.name) || (i18n.industryTitle || "Industry")))
            ),
            div({ class: "card-chips-row" }, ...chips),
            fc.description ? p({ class: "tribe-card-description" }, safeText(fc.description).slice(0, 220)) : null,
            div({ class: "tribe-card-members" },
              span({ class: "tribe-members-count" }, `${i18n.industryMembers || "Members"}: ${fc.memberCount != null ? fc.memberCount : safeArr(fc.members).length}`)
            ),
          )
        )
      )
    })
  )
}

const renderFacilityForm = (facility, mode, spreadWarning = null) => {
  const fc = facility || {}
  const isEdit = mode === "edit"
  const returnTo = "/industry?filter=MINE"
  const curPolicy = fc.membershipPolicy || "vote"
  const curSector = fc.sector || "other"
  return div({ class: "div-center industry-form" },
    isEdit ? spreadWarning : null,
    form({
      action: isEdit ? `/industry/update/${encodeURIComponent(fc.id)}` : "/industry/create",
      method: "POST",
      enctype: "multipart/form-data"
    },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      label(i18n.industryName || "Name"),
      br(),
      input({ type: "text", name: "name", required: true, maxlength: "80", placeholder: i18n.industryNamePlaceholder || "Facility name", value: fc.name || "" }),
      br(),
      label(i18n.industryDescriptionLabel || "Description"),
      br(),
      textarea({ name: "description", rows: "5", maxlength: "2000", placeholder: i18n.industryDescriptionPlaceholder || "What does this facility produce?" }, fc.description || ""),
      br(),
      label(i18n.uploadMedia || "Upload media (max-size: 50MB)"),
      br(),
      input({ type: "file", name: "image" }),
      fc.image ? div({ class: "industry-form-media" }, renderMediaBlob(fc.image, { class: "industry-hero-image" })) : null,
      br(),
      label(i18n.industrySector || "Sector"),
      br(),
      select({ name: "sector" },
        SECTORS.map((s) => option({ value: s, ...(s === curSector ? { selected: true } : {}) }, sectorLabel(s)))
      ),
      br(),
      label(i18n.mapLocationTitle || "Map Location"),
      br(),
      input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: fc.mapUrl || "" }),
      br(),
      label(i18n.shopTags || "Tags"),
      br(),
      input({ type: "text", name: "tags", placeholder: i18n.shopTagsPlaceholder || "tag1, tag2, tag3", value: safeArr(fc.tags).join(", ") }),
      br(),
      label(i18n.industryMembershipPolicy || "Membership policy"),
      br(),
      select({ name: "membershipPolicy" },
        POLICIES.map((pol) => option({ value: pol, ...(pol === curPolicy ? { selected: true } : {}) }, policyLabel(pol)))
      ),
      br(),
      label(i18n.industryQuorum || "Quorum"),
      br(),
      input({ type: "number", name: "quorum", min: "1", step: "1", value: fc.quorum != null ? fc.quorum : 1 }),
      br(),
      label(i18n.industryMajority || "Majority"),
      br(),
      input({ type: "number", name: "majority", min: "0.5", max: "1", step: "0.01", value: fc.majority != null ? fc.majority : 0.5 }),
      br(),
      label(i18n.industryLaborRate || "Labor rate"),
      br(),
      input({ type: "number", name: "laborRate", min: "0", step: "0.01", value: fc.laborRate != null ? fc.laborRate : 0 }),
      br(),
      button({ type: "submit" }, isEdit ? (i18n.industryUpdateButton || "Update facility") : (i18n.industryCreateButton || "Create facility"))
    )
  )
}

const renderGlobalBlueprints = (blueprints, spreadMap = new Map()) => {
  const list = safeArr(blueprints)
  if (!list.length) return p(i18n.industryNoBlueprints || "No blueprints yet.")
  return div({ class: "industry-blueprints" },
    list.map((bp) => div({ class: "industry-card-wrap" },
      div({ class: "card-header activity-card-header" }, span(), renderContentActions(bp.id, "/industry/blueprint/" + encodeURIComponent(bp.id))),
      div({ class: "industry-blueprint-card" + (bp.author === userId ? " own-content" : "") },
      div({ class: "card-chips-row" },
        bp.author === userId ? null : renderSpreadButton(bp.id, spreadMap.get(bp.id)),
        renderStateChip("half", bp.outKind === "digital" ? "💾" : "📦", i18n["industryKind_" + bp.outKind] || bp.outKind),
        renderStateChip("half", "⚖", String(bp.license || "copyleft").toUpperCase())
      ),
      p({ class: "industry-facility-line" }, span({ class: "industry-meta-label" }, `${i18n.industryFacility || "Facility"}: `), a({ href: `/industry/${encodeURIComponent(bp.facilityId)}` }, safeText(bp.facilityName))),
      div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, a({ href: `/industry/blueprint/${encodeURIComponent(bp.id)}` }, safeText(bp.name)))),
      bp.image ? renderMediaBlob(bp.image, { class: "post-image" }) : null,
      bp.description ? p({ class: "tribe-card-description" }, ...renderUrl(safeText(bp.description))) : null,
      renderBlueprintLaborHours(bp),
      safeArr(bp.materials).length ? div({ class: "industry-materials" }, ul({ class: "industry-materials-list" }, bp.materials.map(m => li(`${m.qty || 0} × ${safeText(m.item)}${m.price != null ? ` = ${m.price} ECO` : ""}`)))) : null,
      renderBlueprintEstimate(bp, i18n.industryBuildingPrice || "Building price"),
      safeArr(bp.skills).length ? p(span({ class: "industry-meta-label" }, `${i18n.industrySkills || "Skills"}: `), bp.skills.join(", ")) : null,
      (() => {
        const acts = renderBlueprintGovernActions(bp.facilityId, bp, safeArr(bp.members).includes(userId) || bp.author === userId, "/industry?filter=BLUEPRINTS")
        return acts.length ? div({ class: "industry-actions" }, ...acts) : null
      })()
      )
    ))
  )
}

const renderGovernVoteButton = (facilityId, subject, ref, voters, yes, need, labelKey, fallback, returnTo) => {
  const mine = safeArr(voters).includes(userId)
  return form({ method: "POST", action: `/industry/govern/${encodeURIComponent(facilityId)}` },
    input({ type: "hidden", name: "returnTo", value: returnTo }),
    input({ type: "hidden", name: "subject", value: subject }),
    input({ type: "hidden", name: "ref", value: ref }),
    button({ type: "submit", name: "choice", value: mine ? "no" : "yes", class: "filter-btn" },
      `${mine ? (i18n.industryRevokeVote || "Revoke") : (i18n[labelKey] || fallback)} (${yes || 0}/${need || 1})`)
  )
}

const renderBuildGovernActions = (b, isMember, returnTo) => {
  const isProposer = b.proposer === userId
  const multi = (b.facilityMembers || 1) > 1
  const facilityId = b.facilityId || ""
  return [
    (isMember && isProposer && b.updateApproved !== false)
      ? form({ method: "GET", action: `/industry/builds/${encodeURIComponent(b.id)}/edit` }, button({ type: "submit", class: "update-btn" }, i18n.industryUpdateButton || "Update"))
      : null,
    (isMember && isProposer && b.deleteApproved !== false)
      ? form({ method: "POST", action: `/industry/builds/${encodeURIComponent(b.id)}/delete` }, button({ type: "submit", class: "delete-btn danger-btn" }, i18n.industryDeleteButton || "Delete"))
      : null,
    (isMember && multi) ? renderGovernVoteButton(facilityId, "buildUpdate", b.id, b.updateVoters, b.updateYes, b.voteNeed, "industryVoteUpdateButton", "Vote update", returnTo) : null,
    (isMember && multi) ? renderGovernVoteButton(facilityId, "buildDelete", b.id, b.deleteVoters, b.deleteYes, b.voteNeed, "industryVoteDeleteButton", "Vote delete", returnTo) : null
  ].filter(Boolean)
}

const renderBuildCard = (b, opts = {}) => {
  const href = `/industry/build/${encodeURIComponent(b.id)}`
  const card = div({ class: "industry-blueprint-card" + (b.proposer === userId ? " own-content" : "") },
    div({ class: "card-chips-row" },
      b.proposer === userId ? null : renderSpreadButton(b.id, opts.spread),
      renderBuildStatusChip(b.status),
      ...((b.blueprintKind && opts.withBlueprintChips !== false) ? [
        renderStateChip("half", b.blueprintKind === "digital" ? "💾" : "📦", i18n["industryKind_" + b.blueprintKind] || b.blueprintKind),
        renderStateChip("half", "⚖", String(b.blueprintLicense || "copyleft").toUpperCase())
      ] : [])
    ),
    opts.withFacility ? p({ class: "industry-facility-line" }, span({ class: "industry-meta-label" }, `${i18n.industryFacility || "Facility"}: `), a({ href: `/industry/${encodeURIComponent(b.facilityId)}` }, safeText(b.facilityName))) : null,
    opts.withProposer !== false ? p(span({ class: "industry-meta-label" }, `${i18n.industryProposer || "Proposer"}: `), userLink(b.proposer)) : null,
    div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, a({ href }, safeText(b.title)))),
    b.blueprintImage ? renderMediaBlob(b.blueprintImage, { class: "post-image" }) : null,
    b.notes ? p({ class: "tribe-card-description" }, ...renderUrl(safeText(b.notes))) : null,
    div({ class: "industry-blueprint-meta industry-dates-row" },
      b.startDate ? p(span({ class: "industry-meta-label" }, `${i18n.industryBuildStart || "Start date"}: `), moment(b.startDate).format("YYYY/MM/DD")) : null,
      b.endDate ? p(span({ class: "industry-meta-label" }, `${i18n.industryBuildEnd || "End date"}: `), moment(b.endDate).format("YYYY/MM/DD")) : null,
    ),
    renderBlueprintEstimate(b, i18n.industryFinalPrice || "Final price"),
    p(span({ class: "industry-meta-label" }, `${i18n.industryContributions || "Contributions"}: `), String(safeArr(b.contributions).length)),
    (opts.actions && opts.actions.length) ? div({ class: "industry-actions" }, ...opts.actions) : null
  )
  if (!opts.withActions) return card
  return div({ class: "industry-card-wrap" },
    div({ class: "card-header activity-card-header" }, span(), renderContentActions(b.id, href)),
    card
  )
}

const renderGlobalBuilds = (builds, spreadMap = new Map()) => {
  const list = safeArr(builds)
  if (!list.length) return p(i18n.industryNoBuilds || "No builds yet.")
  return div({ class: "industry-blueprints" },
    list.map((b) => renderBuildCard(b, { withFacility: true, withActions: true, spread: spreadMap.get(b.id), actions: renderBuildGovernActions(b, safeArr(b.members).includes(userId) || b.proposer === userId, "/industry?filter=BUILDS") }))
  )
}

exports.industryView = async (facilitiesOrForm, filter, params = {}) => {
  const f = String(filter || "ALL").toUpperCase()
  const facilityEditWarning = f === "EDIT" ? await renderSpreadEditWarning((safeArr(facilitiesOrForm)[0] || {}).id) : null
  const search = safeText(params.search)
  const sectorSel = safeText(params.sector)
  const isForm = f === "CREATE" || f === "EDIT"
  const isRules = f === "RULES"
  return template(
    i18n.industryTitle || "Industry",
    section(
      div({ class: "tags-header" },
        h2(i18n.industryTitle || "Industry"),
        p(i18n.industryDescription || "Network-owned production facilities.")
      ),
      br(),
      div({ class: "filters" },
        form({ method: "GET", action: "/industry", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "search", value: search }),
          input({ type: "hidden", name: "sector", value: sectorSel }),
          FILTERS.map((x) => button({ type: "submit", name: "filter", value: x.key, class: f === x.key ? "filter-btn active" : "filter-btn" }, String(i18n[x.i18n] || x.key).toUpperCase()))
            .concat(button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.industryCreateFacility || "Create facility"))
        )
      ),
      isRules
        ? renderIndustryRules()
        : isForm
        ? renderFacilityForm(f === "EDIT" ? (safeArr(facilitiesOrForm)[0] || {}) : {}, f === "EDIT" ? "edit" : "create", facilityEditWarning)
        : f === "BLUEPRINTS"
        ? div({ class: "industry-list" }, renderGlobalBlueprints(facilitiesOrForm, params.spreadMap || new Map()))
        : f === "BUILDS"
        ? div({ class: "industry-list" }, renderGlobalBuilds(facilitiesOrForm, params.spreadMap || new Map()))
        : section(
            div({ class: "industry-search" },
              form({ method: "GET", action: "/industry", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: f || "ALL" }),
                input({ type: "text", name: "search", value: search, placeholder: i18n.industrySearchPlaceholder || "Search facilities…", class: "filter-box__input" }),
                div({ class: "filter-box__controls" },
                  select({ name: "sector", class: "filter-box__number" },
                    [option({ value: "", ...(sectorSel ? {} : { selected: true }) }, i18n.industryAllSectors || "All sectors")]
                      .concat(SECTORS.map((s) => option({ value: s, ...(s === sectorSel ? { selected: true } : {}) }, sectorLabel(s))))
                  ),
                  button({ type: "submit", class: "filter-box__button" }, i18n.searchButton)
                )
              )
            ),
            br(),
            div({ class: "industry-list" }, renderFacilityList(facilitiesOrForm, f, params.spreadMap))
          )
    )
  )
}

const membershipActions = (fc, returnTo) => {
  const isSteward = fc.steward === userId
  const isMember = safeArr(fc.members).includes(userId)
  const status = String(fc.status || "ACTIVE").toUpperCase()
  const policy = fc.membershipPolicy
  const invited = safeArr(fc.invites).includes(userId)
  const rows = []
  if (!isMember && status !== "DISSOLVED") {
    if (policy === "vote") {
      rows.push(form({ method: "POST", action: `/industry/apply/${encodeURIComponent(fc.id)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        button({ type: "submit", class: "subscribe-btn" }, i18n.industryApplyButton || "Request to join")
      ))
    } else if (policy === "invite") {
      rows.push(invited
        ? form({ method: "POST", action: `/industry/join/${encodeURIComponent(fc.id)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            button({ type: "submit", class: "subscribe-btn" }, i18n.industryJoinButton || "Join")
          )
        : p({ class: "industry-hint" }, i18n.industryInviteNeeded || "You need an invitation to join.")
      )
    } else {
      rows.push(form({ method: "POST", action: `/industry/join/${encodeURIComponent(fc.id)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        button({ type: "submit", class: "subscribe-btn" }, i18n.industryJoinButton || "Join")
      ))
    }
  }
  if (isMember && !isSteward) {
    rows.push(form({ method: "POST", action: `/industry/leave/${encodeURIComponent(fc.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ type: "submit", class: "unsubscribe-btn" }, i18n.industryLeaveButton || "Leave")
    ))
  }
  return rows
}

const renderInviteSection = (fc, returnTo) => {
  if (!safeArr(fc.members).includes(userId) || String(fc.status || "ACTIVE").toUpperCase() === "DISSOLVED") return null
  if (fc.membershipPolicy !== "invite") return null
  return div({ class: "industry-section" },
    h2(i18n.industryInviteButton || "Invite"),
    form({ method: "POST", action: `/industry/invite/${encodeURIComponent(fc.id)}`, class: "industry-invite-form" },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      input({ type: "text", name: "invitee", required: true, placeholder: i18n.industryInvitePlaceholder || "Oasis ID (@...ed25519)" }),
      button({ type: "submit", class: "create-button" }, i18n.industryCreateInvite || "Generate invite")
    )
  )
}

const renderPendingApplicants = (fc, returnTo) => {
  const isMember = safeArr(fc.members).includes(userId)
  const pending = safeArr(fc.pendingApplicants)
  if (!isMember || !pending.length) return null
  return div({ class: "industry-section" },
    h2(i18n.industryPendingApplicants || "Pending applicants"),
    ul({ class: "industry-applicants" },
      pending.map((ap) => li(
        userLink(ap.id),
        span({ class: "industry-vote-count" }, ` (${i18n.industryVotesYes || "yes"}: ${ap.yes} / ${i18n.industryVotesNo || "no"}: ${ap.no})`),
        ap.voters.includes(userId)
          ? span({ class: "industry-hint" }, ` — ${i18n.industryAlreadyVoted || "voted"}`)
          : form({ method: "POST", action: `/industry/govern/${encodeURIComponent(fc.id)}`, class: "industry-vote-form" },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              input({ type: "hidden", name: "subject", value: "admit" }),
              input({ type: "hidden", name: "ref", value: ap.id }),
              button({ type: "submit", name: "choice", value: "yes", class: "subscribe-btn" }, i18n.industryAdmit || "Admit"),
              button({ type: "submit", name: "choice", value: "no", class: "unsubscribe-btn" }, i18n.industryReject || "Reject")
            )
      ))
    )
  )
}

const renderDissolveBlock = (fc, returnTo) => {
  const isMember = safeArr(fc.members).includes(userId)
  const status = String(fc.status || "ACTIVE").toUpperCase()
  const memberCount = fc.memberCount != null ? fc.memberCount : safeArr(fc.members).length
  if (!isMember || status === "DISSOLVED" || memberCount <= 1) return null
  return div({ class: "industry-section" },
    h2(i18n.industryDissolveTitle || "Dissolve facility"),
    form({ method: "POST", action: `/industry/govern/${encodeURIComponent(fc.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      input({ type: "hidden", name: "subject", value: "dissolve" }),
      input({ type: "hidden", name: "ref", value: "" }),
      button({ type: "submit", name: "choice", value: "yes", class: "unsubscribe-btn danger-btn" }, i18n.industryDissolveVote || "Vote to dissolve")
    )
  )
}

const BUILD_STATUSES = ["PROPOSED", "APPROVED", "STOCKING", "IN_PRODUCTION", "COMPLETED", "FAILED"]
const BUILD_TRANSITIONS = { APPROVED: ["STOCKING", "FAILED"], STOCKING: ["IN_PRODUCTION", "FAILED"], IN_PRODUCTION: ["COMPLETED", "FAILED"], FAILED: ["APPROVED", "STOCKING", "IN_PRODUCTION"], COMPLETED: ["IN_PRODUCTION"] }
const CONTRIBUTABLE_VIEW = new Set(["APPROVED", "STOCKING", "IN_PRODUCTION"])
const buildStatusLabel = (s) => i18n["industryBuildStatus_" + String(s || "").toUpperCase()] || s

const renderBuildStatusChip = (status) => {
  const s = String(status || "PROPOSED").toUpperCase()
  const map = { PROPOSED: ["half", "📋"], REJECTED: ["tombstoned", "🚫"], APPROVED: ["whole", "✅"], STOCKING: ["half", "📦"], IN_PRODUCTION: ["half", "⚙"], COMPLETED: ["whole", "🏁"], FAILED: ["tombstoned", "✗"] }
  const [v, ic] = map[s] || map.PROPOSED
  return renderStateChip(v, ic, buildStatusLabel(s))
}

const fmtEco = (n) => `${Number(n || 0).toFixed(2)} ECO`

const renderBlueprintLaborHours = (bp) => {
  if (bp.laborHours == null) return null
  return p({ class: "industry-labor-hours" }, span({ class: "industry-meta-label" }, `${i18n.industryLaborHours || "Labor (hours)"}: `), `${bp.laborHours || 0}h`)
}

const renderBlueprintEstimate = (bp, totalLabel) => {
  if (bp.estTotal == null) return null
  return div({ class: "industry-estimate" },
    p(span({ class: "industry-meta-label" }, `${i18n.industryEstMaterials || "Total Materials"}: `), fmtEco(bp.estMaterialsCost)),
    p(span({ class: "industry-meta-label" }, `${i18n.industryEstLabor || "Total Labor"}: `), fmtEco(bp.estLaborCost)),
    br(),
    p({ class: "industry-estimate-total" }, span({ class: "industry-meta-label" }, `${totalLabel || i18n.industryEstTotal || "Estimated price"}: `), fmtEco(bp.estTotal))
  )
}

const renderBlueprintGovernActions = (facilityId, bp, isMember, returnTo) => {
  const isAuthor = bp.author === userId
  const multi = (bp.facilityMembers || 1) > 1
  const ref = bp.root || bp.id
  const voteBtn = (subject, voters, yes, labelKey, fallback) => {
    const mine = safeArr(voters).includes(userId)
    return form({ method: "POST", action: `/industry/govern/${encodeURIComponent(facilityId)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      input({ type: "hidden", name: "subject", value: subject }),
      input({ type: "hidden", name: "ref", value: ref }),
      button({ type: "submit", name: "choice", value: mine ? "no" : "yes", class: "filter-btn" },
        `${mine ? (i18n.industryRevokeVote || "Revoke") : (i18n[labelKey] || fallback)} (${yes || 0}/${bp.voteNeed || 1})`)
    )
  }
  return [
    (isMember && isAuthor && bp.updateApproved !== false)
      ? form({ method: "GET", action: `/industry/blueprints/${encodeURIComponent(bp.id)}/edit` }, button({ type: "submit", class: "update-btn" }, i18n.industryUpdateButton || "Update"))
      : null,
    (isMember && isAuthor && bp.deleteApproved !== false)
      ? form({ method: "POST", action: `/industry/blueprints/${encodeURIComponent(bp.id)}/delete` }, button({ type: "submit", class: "delete-btn danger-btn" }, i18n.industryDeleteButton || "Delete"))
      : null,
    (isMember && multi) ? voteBtn("bpUpdate", bp.updateVoters, bp.updateYes, "industryVoteUpdateButton", "Vote update") : null,
    (isMember && multi) ? voteBtn("bpDelete", bp.deleteVoters, bp.deleteYes, "industryVoteDeleteButton", "Vote delete") : null
  ].filter(Boolean)
}

const renderBlueprintsSection = (fc, blueprints, isMember, spreadMap = new Map()) => {
  const list = safeArr(blueprints)
  const cards = list.map((bp) => {
    const actions = renderBlueprintGovernActions(fc.id, bp, isMember, `/industry/${encodeURIComponent(fc.id)}`)
    return div({ class: "industry-card-wrap" },
      div({ class: "card-header activity-card-header" }, span(), renderContentActions(bp.id, `/industry/blueprint/${encodeURIComponent(bp.id)}`, { spread: spreadMap.get(bp.id) || null, author: bp.author })),
      div({ class: "industry-blueprint-card" },
      div({ class: "card-chips-row" },
        renderStateChip("half", bp.outKind === "digital" ? "💾" : "📦", i18n["industryKind_" + bp.outKind] || bp.outKind),
        renderStateChip("half", "⚖", String(bp.license || "copyleft").toUpperCase())
      ),
      div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, safeText(bp.name))),
      bp.image ? renderMediaBlob(bp.image, { class: "post-image" }) : null,
      bp.description ? p({ class: "tribe-card-description" }, ...renderUrl(safeText(bp.description))) : (bp.outItem ? p(span({ class: "industry-meta-label" }, `${i18n.industryOutput || "Output"}: `), `${bp.outQty || 0} × ${safeText(bp.outItem)}`) : null),
      renderBlueprintLaborHours(bp),
      safeArr(bp.materials).length ? div({ class: "industry-materials" }, ul({ class: "industry-materials-list" }, bp.materials.map(m => li(`${m.qty || 0} × ${safeText(m.item)}${m.price != null ? ` = ${m.price} ECO` : ""}`)))) : null,
      renderBlueprintEstimate(bp, i18n.industryBuildingPrice || "Building price"),
      safeArr(bp.skills).length ? p(span({ class: "industry-meta-label" }, `${i18n.industrySkills || "Skills"}: `), bp.skills.join(", ")) : null,
      actions.length ? div({ class: "industry-actions" }, ...actions) : null
      )
    )
  })
  return div({ class: "industry-section" },
    h2(i18n.industryBlueprints || "Blueprints"),
    list.length ? div({ class: "industry-blueprints" }, ...cards) : p({ class: "industry-hint" }, i18n.industryNoBlueprints || "No blueprints yet."),
    isMember ? renderBlueprintForm(fc, {}, "create") : null
  )
}

const renderBlueprintForm = (fc, bp, mode, spreadWarning = null) => {
  const isEdit = mode === "edit"
  const curKind = bp.outKind || "physical"
  const materialsText = safeArr(bp.materials).map(m => `${m.item}:${m.qty}:${m.price != null ? m.price : 0}`).join("\n")
  return div({ class: "industry-form industry-blueprint-form" },
    h2(isEdit ? (i18n.industryEditBlueprint || "Edit blueprint") : (i18n.industryNewBlueprint || "New blueprint")),
    isEdit ? spreadWarning : null,
    form({ method: "POST", action: isEdit ? `/industry/blueprints/${encodeURIComponent(bp.id)}/update` : `/industry/${encodeURIComponent(fc.id)}/blueprints`, enctype: "multipart/form-data" },
      label(i18n.industryName || "Name"),
      br(), input({ type: "text", name: "name", required: true, maxlength: "80", value: bp.name || "" }), br(),
      label(i18n.industryDescriptionLabel || "Description"),
      br(), textarea({ name: "description", rows: "4", maxlength: "2000", placeholder: i18n.industryBlueprintDescPlaceholder || "Specs, dimensions, weight, docs…" }, bp.description || ""), br(),
      label(i18n.uploadMedia || "Upload media (max-size: 50MB)"),
      br(), input({ type: "file", name: "image" }),
      bp.image ? div({ class: "industry-form-media" }, renderMediaBlob(bp.image, { class: "post-image" })) : null,
      br(),
      label(i18n.industryOutputKind || "Product type"),
      br(), select({ name: "outKind" }, ["physical", "digital"].map(k => option({ value: k, ...(k === curKind ? { selected: true } : {}) }, i18n["industryKind_" + k] || k))), br(),
      label(i18n.industryMaterials || "Materials"),
      br(), textarea({ maxlength: "5000", name: "materialsText", rows: "3", placeholder: i18n.industryMaterialsPlaceholder || "solar-panel:2:120\nbattery:1:80\nkit:1:15" }, materialsText), br(),
      label(i18n.industryLaborHours || "Labor hours"),
      br(), input({ type: "number", name: "laborHours", min: "0", step: "0.01", value: bp.laborHours != null ? bp.laborHours : "" }), br(),
      button({ type: "submit" }, isEdit ? (i18n.industryUpdateButton || "Update") : (i18n.industryCreateBlueprintButton || "Create blueprint"))
    )
  )
}

const renderBuildForm = (fc, blueprints, build, mode, spreadWarning = null) => {
  const b = build || {}
  const isEdit = mode === "edit"
  const today = new Date().toISOString().slice(0, 10)
  return div({ class: "industry-form industry-build-form" },
    h2(isEdit ? (i18n.industryEditBuild || "Edit build") : (i18n.industryNewBuild || "Propose a build")),
    isEdit ? spreadWarning : null,
    form({ method: "POST", action: isEdit ? `/industry/builds/${encodeURIComponent(b.id)}/update` : `/industry/${encodeURIComponent(fc.id)}/builds`, enctype: "multipart/form-data" },
      label(i18n.industryBuildTitle || "Title"),
      br(), input({ type: "text", name: "title", required: true, maxlength: "120", value: safeText(b.title) }), br(),
      label(i18n.industryBlueprint || "Blueprint"),
      br(), isEdit
        ? input({ type: "text", disabled: true, value: safeText(b.blueprintName) })
        : select({ name: "blueprintId", required: true }, safeArr(blueprints).map(bp => option({ value: bp.id }, safeText(bp.name)))), br(),
      label(i18n.industryBuildStart || "Start date"),
      br(), input({ type: "date", name: "startDate", required: true, value: b.startDate || "", ...(isEdit ? {} : { min: today }) }), br(),
      label(i18n.industryBuildEnd || "End date"),
      br(), input({ type: "date", name: "endDate", required: true, value: b.endDate || "", min: today }), br(),
      label(i18n.industryBuildNotes || "Notes"),
      br(), textarea({ name: "notes", rows: "3", maxlength: "1000" }, safeText(b.notes)), br(),
      button({ type: "submit" }, isEdit ? (i18n.industryUpdateButton || "Update") : (i18n.industryProposeBuildButton || "Propose build"))
    )
  )
}

const renderBuildsSection = (fc, builds, blueprints, isMember, spreadMap = new Map()) => {
  const list = safeArr(builds)
  return div({ class: "industry-section" },
    h2(i18n.industryBuilds || "Builds"),
    list.length ? div({ class: "industry-blueprints" }, ...list.map((b) => renderBuildCard(b, { withActions: true, withBlueprintChips: false, withProposer: false, spread: spreadMap.get(b.id), actions: renderBuildGovernActions(b, isMember, `/industry/${encodeURIComponent(fc.id)}`) }))) : p({ class: "industry-hint" }, i18n.industryNoBuilds || "No builds yet."),
    (isMember && fc.status === "ACTIVE" && !safeArr(blueprints).length)
      ? p({ class: "industry-hint" }, i18n.industryNeedBlueprint || "Create a blueprint first: every build produces one.")
      : null,
    (isMember && fc.status === "ACTIVE" && safeArr(blueprints).length) ? renderBuildForm(fc, blueprints, {}, "create") : null
  )
}

const renderFacilityJobsSection = (fc, jobs) => {
  const list = safeArr(jobs)
  if (!list.length) return null
  const rows = list.map((j) => li(
    a({ href: `/jobs/${encodeURIComponent(j.id || j.key)}` }, safeText(j.title) || (i18n.jobsTitle || "Job")),
    j.salary ? span({ class: "industry-hint" }, ` · ${j.salary} ECO · `) : span({ class: "industry-hint" }, " · "),
    renderStateChip(String(j.status || "OPEN").toUpperCase() === "OPEN" ? "whole" : "tombstoned", "", String(j.status || "OPEN").toUpperCase())
  ))
  return div({ class: "industry-section" },
    h2(i18n.industryJobs || "Jobs"),
    ul({ class: "industry-jobs-list" }, ...rows)
  )
}

const renderFacilitySide = (fc, returnTo, params = {}) => {
  const isSteward = fc.steward === userId
  const isMember = safeArr(fc.members).includes(userId)
  const isOwner = String(fc.steward || fc.author) === String(userId)
  const memberCount = fc.memberCount != null ? fc.memberCount : safeArr(fc.members).length

  const chips = [
    renderStateChip("whole", "🏭", sectorLabel(fc.sector)),
    renderStateChip("half", "⚖", policyLabel(fc.membershipPolicy)),
    renderLifespanChip(fc.lifetime, i18n),
    renderEcoTax(fc.msgSize, fc.id || fc.key),
    (isSteward || isMember)
      ? ((isOwner || (fc.subscription && fc.subscription.subscribed === true))
          ? renderStateChip("mutuals", "✉", i18n.subscriptionOn)
          : renderStateChip("closed", "✉", i18n.subscriptionOff))
      : null
  ].filter(Boolean)

  const sideActions = []
  for (const act of membershipActions(fc, returnTo)) sideActions.push(act)
  if (!isSteward && fc.steward) {
    sideActions.push(form({ method: "GET", action: "/pm" },
      input({ type: "hidden", name: "recipients", value: fc.steward }),
      button({ type: "submit", class: "filter-btn" }, i18n.privateMessage)
    ))
    sideActions.push(a({ href: `/reports?filter=create&category=ABUSE&title=${encodeURIComponent(`${i18n.industryTitle || "Industry"}: ${safeText(fc.name)}`)}`, class: "filter-btn" }, i18n.industryReportButton || "Report"))
  }
  if (isSteward) {
    sideActions.push(form({ method: "GET", action: `/industry/edit/${encodeURIComponent(fc.id)}` },
      button({ type: "submit", class: "tribe-action-btn" }, i18n.industryUpdateButton || "Update")
    ))
    if (memberCount <= 1) {
      sideActions.push(form({ method: "POST", action: `/industry/delete/${encodeURIComponent(fc.id)}` },
        button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.industryDeleteButton || "Delete")
      ))
    }
  }

  return div({ class: "tribe-side" },
    div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, a({ href: `/industry/${encodeURIComponent(fc.id)}` }, safeText(fc.name) || (i18n.industryTitle || "Industry")))),
    div({ class: "card-chips-row" }, ...chips),
    fc.image ? renderMediaBlob(fc.image, { class: "tribe-detail-image" }) : null,
    fc.description ? p({ class: "tribe-side-description" }, ...renderUrl(safeText(fc.description))) : null,
    table({ class: "tribe-info-table" },
      tr(td({ class: "tribe-info-label" }, i18n.industryLaborRate || "Labor rate"), td({ class: "tribe-info-value", colspan: "3" }, `${fc.laborRate || 0} ECO/h`)),
      tr(td({ class: "tribe-info-label" }, i18n.industryQuorum || "Quorum"), td({ class: "tribe-info-value", colspan: "3" }, String(fc.quorum))),
      tr(td({ class: "tribe-info-label" }, i18n.industryMajority || "Majority"), td({ class: "tribe-info-value", colspan: "3" }, `${Math.round((fc.majority || 0.5) * 100)}%`)),
      tr(td({ class: "tribe-info-value tribe-author-cell", colspan: "4" }, userLink(fc.steward)))
    ),
    fc.mapUrl ? renderMapEmbedWithZoom(params.mapData, fc.mapUrl, returnTo, params.zoom) : null,
    safeArr(fc.tags).length
      ? div({ class: "tribe-side-tags" }, safeArr(fc.tags).map(tag => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)))
      : null,
    renderStatusBlock(fc, returnTo),
    h2({ class: "tribe-members-count" }, `${i18n.industryMembers || "Members"}: ${memberCount}`),
    renderInviteSection(fc, returnTo),
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null,
    (fc.subscription && (isSteward || isMember))
      ? renderSubscriptionBox({
          target: fc.rootId || fc.id,
          scope: "industry",
          subscribed: fc.subscription.subscribed === true,
          count: fc.subscription.count,
          isOwner: isOwner,
          returnTo: returnTo
        })
      : null,
    renderDissolveBlock(fc, returnTo)
  )
}

exports.singleFacilityView = async (facility, filter, params = {}) => {
  const fc = facility || {}
  const f = String(filter || "ALL").toUpperCase()
  const returnTo = `/industry/${encodeURIComponent(fc.id)}?filter=${encodeURIComponent(f)}`
  const isMember = safeArr(fc.members).includes(userId)
  const facilitySide = renderFacilitySide(fc, returnTo, params)

  const facilityMain = div({ class: "tribe-main" },
    renderBlueprintsSection(fc, params.blueprints, isMember, params.childSpreadMap || new Map()),
    renderBuildsSection(fc, params.builds, params.blueprints, isMember, params.childSpreadMap || new Map()),
    renderFacilityJobsSection(fc, params.facilityJobs),
    renderOpinionsVoting('/industry/opinions', fc.id || fc.key, fc.opinions, null, fc.opinions_inhabitants),
    div({ class: "industry-section" },
      h2(i18n.industryMembers || "Members"),
      ul({ class: "industry-members-list" }, safeArr(fc.members).map((mid) => li(
        userLink(mid),
        span({ class: "industry-role" }, ` · ${mid === fc.steward ? (i18n.industrySteward || "Steward") : (i18n.industryMember || "Member")}`)
      )))
    ),
    renderPendingApplicants(fc, returnTo)
  )

  return template(
    i18n.industryTitle || "Industry",
    section(
      div({ class: "card-header activity-card-header" },
        renderContentActions(fc.id || fc.key, null, { spread: params.spreads || null, author: fc.steward })
      ),
      div({ class: "tags-header" }, h2(i18n.industryTitle || "Industry"), p(i18n.industryDescription || "Network-owned production facilities.")),
      div({ class: "filters" },
        form({ method: "GET", action: "/industry", class: "ui-toolbar ui-toolbar--filters" },
          FILTERS.map((x) => button({ type: "submit", name: "filter", value: x.key, class: f === x.key ? "filter-btn active" : "filter-btn" }, String(i18n[x.i18n] || x.key).toUpperCase()))
            .concat(button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.industryCreateFacility || "Create facility"))
        )
      ),
      div({ class: "tribe-details" }, facilitySide, facilityMain)
    )
  )
}

exports.blueprintEditView = async (bp, fc) => template(
  i18n.industryTitle || "Industry",
  section(
    div({ class: "card-header activity-card-header" },
      renderContentActions(fc.id || fc.key, `/industry/${encodeURIComponent(fc.id)}`)
    ),
    div({ class: "tags-header" }, h2(i18n.industryTitle || "Industry"), p(i18n.industryDescription || "Network-owned production facilities.")),
    div({ class: "filters" },
      form({ method: "GET", action: "/industry", class: "ui-toolbar ui-toolbar--filters" },
        FILTERS.map((x) => button({ type: "submit", name: "filter", value: x.key, class: "filter-btn" }, String(i18n[x.i18n] || x.key).toUpperCase()))
          .concat(button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.industryCreateFacility || "Create facility"))
      )
    ),
    renderBlueprintForm(fc, bp, "edit", await renderSpreadEditWarning(bp && bp.id))
  )
)

exports.buildEditView = async (b, fc) => template(
  i18n.industryTitle || "Industry",
  section(
    div({ class: "card-header activity-card-header" },
      renderContentActions(b.id, `/industry/build/${encodeURIComponent(b.id)}`)
    ),
    div({ class: "tags-header" }, h2(i18n.industryTitle || "Industry"), p(i18n.industryDescription || "Network-owned production facilities.")),
    div({ class: "filters" },
      form({ method: "GET", action: "/industry", class: "ui-toolbar ui-toolbar--filters" },
        FILTERS.map((x) => button({ type: "submit", name: "filter", value: x.key, class: "filter-btn" }, String(i18n[x.i18n] || x.key).toUpperCase()))
          .concat(button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.industryCreateFacility || "Create facility"))
      )
    ),
    renderBuildForm(fc, [], b, "edit", await renderSpreadEditWarning(b && b.id))
  )
)

exports.singleBlueprintView = async (blueprint, params = {}) => {
  const bp = blueprint || {}
  const isMember = safeArr(bp.members).includes(userId)
  const facilityHref = `/industry/${encodeURIComponent(bp.facilityId || "")}`
  const returnTo = `/industry/blueprint/${encodeURIComponent(bp.id)}`
  const actions = renderBlueprintGovernActions(bp.facilityId, bp, isMember, returnTo)

  return template(
    i18n.industryTitle || "Industry",
    section(div({ class: "tags-header" }, h2(i18n.industryTitle), p(i18n.industryDescription))),
    section(
      div({ class: "filters" },
        form({ method: "GET", action: "/industry", class: "ui-toolbar ui-toolbar--filters" },
          FILTERS.map((x) => button({ type: "submit", name: "filter", value: x.key, class: "filter-btn" }, String(i18n[x.i18n] || x.key).toUpperCase()))
            .concat(button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.industryCreateFacility || "Create facility"))
        )
      )
    ),
    section(
      div({ class: "shop-detail" },
        div({ class: "card-header activity-card-header" },
          span(),
          renderContentActions(bp.id, null, { spread: params.spreads || null, author: bp.author, reportTitle: bp.name || bp.title })
        ),
                div({ class: "card-chips-row" },
          renderStateChip("half", bp.outKind === "digital" ? "💾" : "📦", i18n["industryKind_" + bp.outKind] || bp.outKind),
          renderStateChip("half", "⚖", String(bp.license || "copyleft").toUpperCase())
        ),
        p({ class: "industry-facility-line" }, span({ class: "industry-meta-label" }, `${i18n.industryFacility || "Facility"}: `), a({ href: facilityHref }, safeText(bp.facilityName))),
        h2(safeText(bp.name)),
        bp.image ? div({ class: "shop-detail-media" }, renderMediaBlob(bp.image, { class: "post-image" })) : null,
        bp.description ? p({ class: "tribe-card-description" }, ...renderUrl(safeText(bp.description))) : null,
        div({ class: "industry-meta" },
          p(span({ class: "industry-meta-label" }, `${i18n.industryAuthor || "Author"}: `), userLink(bp.author))
        ),
        renderBlueprintLaborHours(bp),
        safeArr(bp.materials).length ? div({ class: "industry-materials" }, ul({ class: "industry-materials-list" }, bp.materials.map(m => li(`${m.qty || 0} × ${safeText(m.item)}${m.price != null ? ` = ${m.price} ECO` : ""}`)))) : null,
        renderBlueprintEstimate(bp, i18n.industryBuildingPrice || "Building price"),
        safeArr(bp.skills).length ? p(span({ class: "industry-meta-label" }, `${i18n.industrySkills || "Skills"}: `), bp.skills.join(", ")) : null,
        actions.length ? div({ class: "industry-actions" }, ...actions) : null,
        safeArr(bp.builds).length
          ? div({ class: "industry-section" },
              h2(i18n.industryBuilds || "Builds"),
              ul({ class: "industry-builds-list" }, bp.builds.map(b => li(
                a({ href: `/industry/build/${encodeURIComponent(b.id)}` }, safeText(b.title)),
                " ", renderBuildStatusChip(b.status)
              )))
            )
          : null
      )
    )
  )
}

exports.singleBuildView = async (build, params = {}) => {
  const b = build || {}
  const isMember = safeArr(b.members).includes(userId)
  const isSteward = b.steward === userId
  const isProposer = b.proposer === userId
  const status = String(b.status || "PROPOSED").toUpperCase()
  const returnTo = `/industry/build/${encodeURIComponent(b.id)}`
  const facilityHref = `/industry/${encodeURIComponent(b.facilityId)}`

  const contribRows = safeArr(b.contributions).map(c => tr(
    td(userLink(c.author)),
    td(i18n["industryKind_" + c.kind] || c.kind),
    td(c.kind === "labor" ? `${c.hours} h` : c.kind === "material" ? `${c.value} ECO · ${safeText(c.item)}` : `${c.eco} ECO`),
    td(safeText(c.note))
  ))

  const canUpdateBuild = isMember && (isProposer || isSteward) && !b.distributed && b.updateApproved !== false
  const govRows = []
  if ((status === "PROPOSED" || status === "REJECTED") && isMember) {
    govRows.push(form({ method: "POST", action: `/industry/builds/${encodeURIComponent(b.id)}/vote`, class: "industry-build-vote" },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ type: "submit", name: "choice", value: "yes", class: "subscribe-btn" }, i18n.industryApproveBuild || "Approve"),
      button({ type: "submit", name: "choice", value: "no", class: "unsubscribe-btn" }, i18n.industryReject || "Reject")
    ))
  }
  const isReopen = status === "COMPLETED" || status === "FAILED"
  const lockedByDistribution = status === "COMPLETED" && b.distributed
  const transitions = ((!isMember || lockedByDistribution) ? [] : (BUILD_TRANSITIONS[status] || [])).filter(nextS => {
    const stewardOnly = nextS === "COMPLETED" || nextS === "FAILED" || isReopen
    return isSteward || (isProposer && !stewardOnly)
  })
  if (transitions.length) {
    govRows.push(form({ method: "POST", action: `/industry/builds/${encodeURIComponent(b.id)}/status`, class: "project-control-form project-control-form--status" },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      select({ name: "status", class: "project-control-select" },
        transitions.map(nextS => option({ value: nextS }, buildStatusLabel(nextS)))
      ),
      button({ type: "submit", class: "status-btn project-control-btn" }, i18n.industryAdvanceTo || "Set to")
    ))
  }
  if (canUpdateBuild) {
    govRows.push(form({ method: "GET", action: `/industry/builds/${encodeURIComponent(b.id)}/edit` },
      button({ type: "submit", class: "update-btn" }, i18n.industryUpdateButton || "Update")
    ))
  }
  if (isMember && isProposer && b.deleteApproved !== false) {
    govRows.push(form({ method: "POST", action: `/industry/builds/${encodeURIComponent(b.id)}/delete` },
      button({ type: "submit", class: "delete-btn danger-btn" }, i18n.industryDeleteButton || "Delete")
    ))
  }
  if (isMember && (b.facilityMembers || 1) > 1) {
    govRows.push(renderGovernVoteButton(b.facilityId, "buildUpdate", b.id, b.updateVoters, b.updateYes, b.voteNeed, "industryVoteUpdateButton", "Vote update", returnTo))
    govRows.push(renderGovernVoteButton(b.facilityId, "buildDelete", b.id, b.deleteVoters, b.deleteYes, b.voteNeed, "industryVoteDeleteButton", "Vote delete", returnTo))
  }

  const kind = ["labor", "material", "eco"].includes(String(params.kind)) ? String(params.kind) : "labor"

  const contributeAction = `/industry/builds/${encodeURIComponent(b.id)}/contribute`
  const contributeBlock = (CONTRIBUTABLE_VIEW.has(status) && isMember)
    ? div({ class: "industry-section", id: "contribute" },
        h2(i18n.industryContribute || "Contribute"),
        form({ method: "GET", action: `/industry/build/${encodeURIComponent(b.id)}#contribute`, class: "industry-form industry-contrib-kind" },
          label(i18n.industryKindLabel || "Kind"),
          select({ name: "kind", class: "project-control-select" },
            option({ value: "labor", ...(kind === "labor" ? { selected: true } : {}) }, i18n.industryKind_labor || "Labor"),
            option({ value: "material", ...(kind === "material" ? { selected: true } : {}) }, i18n.industryKind_material || "Material"),
            option({ value: "eco", ...(kind === "eco" ? { selected: true } : {}) }, i18n.industryKind_eco || "Funds")
          ),
          button({ type: "submit", class: "create-button" }, i18n.apply || "Apply")
        ),
        form({ method: "POST", action: contributeAction, class: "industry-form industry-contrib-form-single" },
          input({ type: "hidden", name: "kind", value: kind }),
          kind === "labor" ? [
            label(i18n.industryHours || "Hours"),
            input({ type: "number", name: "hours", min: "0.01", step: "0.01", required: true, class: "industry-input-num" })
          ] : null,
          kind === "material" ? [
            label(i18n.industryMaterialItem || "Material"),
            textarea({ name: "item", rows: "2", maxlength: "80", required: true }),
            label(i18n.industryMaterialValue || "Value (ECO)"),
            input({ type: "number", name: "value", min: "0.01", step: "0.01", required: true, class: "industry-input-num" })
          ] : null,
          kind === "eco" ? [
            label(i18n.industryEcoAmount || "Amount (ECO)"),
            input({ type: "number", name: "eco", min: "0.000001", step: "0.000001", required: true, class: "industry-input-num" })
          ] : null,
          label(i18n.industryNote || "Note"),
          textarea({ name: "note", rows: "2", maxlength: "140" }),
          button({ type: "submit", class: "filter-btn" }, i18n.industryContributeButton || "Contribute")
        )
      )
    : null

  const distributeBlock = (status === "COMPLETED" && isSteward && !b.distributed)
    ? div({ class: "industry-section" },
        h2(i18n.industryDistribute || "Distribute"),
        form({ method: "POST", action: `/industry/builds/${encodeURIComponent(b.id)}/distribute` },
          input({ type: "hidden", name: "returnTo", value: returnTo }),
          label(i18n.industryOutputValue || "Output value (ECO, e.g. from sale)"),
          br(), input({ type: "number", name: "outputValue", min: "0", step: "0.000001", value: "0" }), br(),
          button({ type: "submit", class: "subscribe-btn" }, i18n.industryDistributeButton || "Distribute by shares")
        ),
        p({ class: "industry-hint" }, `${i18n.industryTreasury || "Treasury"}: ${b.treasury || 0} ECO`)
      )
    : null

  const allocationBlock = b.distributed && b.allocation
    ? div({ class: "industry-section" },
        h2(i18n.industryDistribution || "Distribution"),
        p(`${i18n.industryPot || "Pot"}: ${(b.allocation.pot || 0).toFixed(2)} ECO`)
      )
    : null

  const buildLabel = `${i18n.industryBuild || "Build"}: ${safeText(b.title)}`
  const facilityName = safeText(b.facilityName)
  const productName = safeText(b.blueprintName) || safeText(b.title)
  const crossTags = [facilityName, productName].filter(Boolean).map(x => x.toLowerCase().replace(/\s+/g, "-")).join(", ")
  const crossDates = [
    b.startDate ? `${i18n.industryBuildStart || "Start date"}: ${moment(b.startDate).format("YYYY/MM/DD")}` : null,
    b.endDate ? `${i18n.industryBuildEnd || "End date"}: ${moment(b.endDate).format("YYYY/MM/DD")}` : null
  ].filter(Boolean).join(" · ")
  const crossContext = [
    `${i18n.industryFacility || "Facility"}: ${facilityName}`,
    b.blueprintName ? `${i18n.industryBlueprint || "Blueprint"}: ${safeText(b.blueprintName)}` : null,
    crossDates || null,
    b.estTotal != null ? `${i18n.industryFinalPrice || "Final price"}: ${fmtEco(b.estTotal)}` : null
  ].filter(Boolean).join("\n")
  const crossDescription = [safeText(b.notes), crossContext].filter(Boolean).join("\n\n")
  const crossLinks = isMember
    ? div({ class: "industry-actions" },
        a({ href: `/tasks?filter=create&returnTo=${encodeURIComponent(returnTo)}&title=${encodeURIComponent(buildLabel)}&description=${encodeURIComponent(crossDescription)}`, class: "filter-btn" }, i18n.industryCreateTask || "Create Task"),
        a({ href: `/jobs?filter=CREATE&industry=${encodeURIComponent(b.facilityId || "")}&title=${encodeURIComponent(buildLabel)}&description=${encodeURIComponent(crossDescription)}&tasks=${encodeURIComponent(safeText(b.notes))}&salary=${encodeURIComponent(b.estLaborCost != null ? b.estLaborCost : "")}`, class: "filter-btn" }, i18n.industryPostJob || "Create Job"),
        a({ href: `/projects?filter=CREATE&title=${encodeURIComponent(buildLabel)}&description=${encodeURIComponent(crossDescription)}&goal=${encodeURIComponent(b.estTotal != null ? b.estTotal : "")}`, class: "filter-btn" }, i18n.industrySendToProjects || "Create Project"),
        a({ href: `/market?filter=create&industry=${encodeURIComponent(b.facilityId || "")}&title=${encodeURIComponent(productName)}&description=${encodeURIComponent(crossDescription)}&price=${encodeURIComponent(b.estTotal != null ? b.estTotal : "")}&tags=${encodeURIComponent(crossTags)}`, class: "filter-btn" }, i18n.industrySellOnMarket || "Send to Market"),
        (!isSteward && b.steward) ? a({ href: `/courts?filter=open&method=MEDIATION&respondentId=${encodeURIComponent(b.steward)}&titleSuffix=${encodeURIComponent(buildLabel)}`, class: "filter-btn" }, i18n.industryOpenDispute || "Open dispute") : null
      )
    : null

  return template(
    i18n.industryTitle || "Industry",
    section(div({ class: "tags-header" }, h2(i18n.industryTitle), p(i18n.industryDescription))),
    section(
      div({ class: "filters" },
        form({ method: "GET", action: "/industry", class: "ui-toolbar ui-toolbar--filters" },
          FILTERS.map((x) => button({ type: "submit", name: "filter", value: x.key, class: "filter-btn" }, String(i18n[x.i18n] || x.key).toUpperCase()))
            .concat(button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.industryCreateFacility || "Create facility"))
        )
      )
    ),
    section(
      div({ class: "shop-detail" },
        div({ class: "card-header activity-card-header" },
          span(),
          renderContentActions(b.id, null, { spread: params.spreads || null, author: b.proposer, reportTitle: b.title })
        ),
                b.image ? div({ class: "shop-detail-media" }, renderMediaBlob(b.image, { class: "post-image" })) : null,
        h2(safeText(b.title) || (i18n.industryBuild || "Build")),
        div({ class: "card-chips-row" }, renderBuildStatusChip(status)),
      div({ class: "industry-meta" },
        b.blueprintName ? p(span({ class: "industry-meta-label" }, `${i18n.industryBlueprint || "Blueprint"}: `), safeText(b.blueprintName)) : null,
        b.blueprintImage ? renderMediaBlob(b.blueprintImage, { class: "post-image" }) : null,
        p(span({ class: "industry-meta-label" }, `${i18n.industryProposer || "Proposer"}: `), userLink(b.proposer)),
        b.notes ? p({ class: "industry-build-notes" }, span({ class: "industry-meta-label" }, `${i18n.industryBuildNotes || "Notes"}: `), safeText(b.notes)) : null,
        div({ class: "industry-dates-row" },
          b.startDate ? p(span({ class: "industry-meta-label" }, `${i18n.industryBuildStart || "Start date"}: `), moment(b.startDate).format("YYYY/MM/DD")) : null,
          b.endDate ? p(span({ class: "industry-meta-label" }, `${i18n.industryBuildEnd || "End date"}: `), moment(b.endDate).format("YYYY/MM/DD")) : null,
          (b.endDate && status !== "COMPLETED" && status !== "FAILED")
            ? p(span({ class: "industry-meta-label" }, `${i18n.industryTimeLeft || "Time left"}: `), `${Math.max(0, Math.ceil((new Date(b.endDate) - Date.now()) / 86400000))}d`)
            : null
        )
      ),
      renderBlueprintEstimate(b, i18n.industryFinalPrice || "Final price"),
      govRows.length ? div({ class: "industry-actions" }, ...govRows) : null,
      crossLinks,
      safeArr(b.contributions).length
        ? div({ class: "industry-section" },
            h2(i18n.industryContributions || "Contributions"),
            table({ class: "industry-table" },
              thead(tr(th(i18n.industryMember || "Member"), th(i18n.industryKindLabel || "Kind"), th(i18n.industryAmount || "Amount"), th(i18n.industryNote || "Note"))),
              tbody(...contribRows)
            )
          )
        : null,
      contributeBlock,
      distributeBlock,
      allocationBlock
      )
    )
  )
}
