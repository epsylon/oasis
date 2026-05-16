const { a, br, button, div, form, h1, h2, h3, img, input, p, section, span, strong } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require("./main_views");

const STEPS = [
  {
    id: 'welcome',
    title: () => i18n.welcomeStep1Title || 'Hi, I am Oasis-42',
    body: () => [
      i18n.welcomeStep1L1 || "Welcome to Oasis: a libre, peer-to-peer, federated social network built on Secure Scuttlebutt.",
      i18n.welcomeStep1L2 || "There is no central server. Your messages are stored as an append-only feed on your machine and shared directly with peers you trust.",
      i18n.welcomeStep1L3 || "Let me walk you through the basics in a few quick steps."
    ],
    actions: () => ([{ href: '/welcome?step=2', label: i18n.welcomeNext || 'Continue', primary: true }])
  },
  {
    id: 'profile',
    title: () => i18n.welcomeStep2Title || 'Your identity',
    body: () => [
      i18n.welcomeStep2L1 || "You are identified by your OasisID (an @-prefixed public key). Anyone with your OasisID can find your profile.",
      i18n.welcomeStep2L2 || "Open /profile/edit to set your name, description, and avatar. Without it, others see only your raw ID."
    ],
    actions: () => ([
      { href: '/profile/edit', label: i18n.welcomeStep2Action || 'Edit my profile', primary: true },
      { href: '/welcome?step=3', label: i18n.welcomeNext || 'Continue' }
    ])
  },
  {
    id: 'visibility',
    title: () => i18n.welcomeStep3Title || 'Visibility controls',
    body: () => [
      i18n.welcomeStep3L1 || "By default only your Karma score is shown on your profile. Activity Level, Device, UBI and ECOIN Wallet stay hidden until you opt in.",
      i18n.welcomeStep3L2 || "Toggle each in /profile/edit — under 'Public profile visibility'."
    ],
    actions: () => ([
      { href: '/profile/edit', label: i18n.welcomeStep3Action || 'Adjust visibility', primary: true },
      { href: '/welcome?step=4', label: i18n.welcomeNext || 'Continue' }
    ])
  },
  {
    id: 'find',
    title: () => i18n.welcomeStep4Title || 'Find people',
    body: () => [
      i18n.welcomeStep4L1 || "Browse /inhabitants to discover users your peers know about.",
      i18n.welcomeStep4L2 || "Already have someone's OasisID? Go to /invites > Inhabitants and paste it to follow them directly.",
      i18n.welcomeStep4L3 || "Want to connect to a specific peer by IP? Use /peers > Direct Connect."
    ],
    actions: () => ([
      { href: '/inhabitants', label: i18n.welcomeStep4Action1 || 'Browse inhabitants', primary: true },
      { href: '/invites', label: i18n.welcomeStep4Action2 || 'Follow by OasisID' },
      { href: '/welcome?step=5', label: i18n.welcomeNext || 'Continue' }
    ])
  },
  {
    id: 'tribes',
    title: () => i18n.welcomeStep5Title || 'Tribes',
    body: () => [
      i18n.welcomeStep5L1 || "Tribes are private groups with their own symmetric encryption layered over SSB. Outsiders cannot see members or content.",
      i18n.welcomeStep5L2 || "Each tribe has its own feed for posts, events, votations, tasks, etc. Join with an invite code (32 hex) or create your own from /tribes."
    ],
    actions: () => ([
      { href: '/tribes', label: i18n.welcomeStep5Action || 'Explore tribes', primary: true },
      { href: '/welcome?step=6', label: i18n.welcomeNext || 'Continue' }
    ])
  },
  {
    id: 'modules',
    title: () => i18n.welcomeStep6Title || 'Modules: ~40 ways to share',
    body: () => [
      i18n.welcomeStep6L1 || "Oasis includes audio, video, image, document, bookmark, torrent, forum, market, jobs, projects, events, tasks, calendars, maps, banking (UBI), parliament, courts, pixelia, AI navigation, and many more.",
      i18n.welcomeStep6L2 || "Enable / disable each in /modules. The sidebar reflects what is on."
    ],
    actions: () => ([
      { href: '/modules', label: i18n.welcomeStep6Action || 'Manage modules', primary: true },
      { href: '/welcome?step=7', label: i18n.welcomeNext || 'Continue' }
    ])
  },
  {
    id: 'done',
    title: () => i18n.welcomeStep7Title || 'You are set',
    body: () => [
      i18n.welcomeStep7L1 || "That's all for the tour. Everything you publish lives on your own feed — you keep the keys, you keep control.",
      i18n.welcomeStep7L2 || "Remember: there is no client-side JavaScript, so everything is a plain form POST + page reload. It is slow on purpose: privacy and reproducibility over speed."
    ],
    actions: () => ([
      { href: '/', label: i18n.welcomeStep7Action || 'Enter Oasis', primary: true }
    ])
  }
];

const renderBubble = (kind, content) => div(
  { class: `welcome-bubble welcome-bubble-${kind}` },
  ...content
);

exports.welcomeView = (stepIndex = 0) => {
  const total = STEPS.length;
  const idx = Math.max(0, Math.min(total - 1, parseInt(stepIndex, 10) || 0));
  const step = STEPS[idx];
  const title = i18n.welcomeTitle || 'Welcome to Oasis';

  const aiHeader = div({ class: 'welcome-ai-header' },
    span({ class: 'welcome-ai-avatar' }, '🌀'),
    span({ class: 'welcome-ai-name' }, 'Oasis-42'),
    span({ class: 'welcome-ai-step' }, `${idx + 1} / ${total}`)
  );

  const bodyLines = (typeof step.body === 'function' ? step.body() : []).filter(Boolean);

  const aiBubble = renderBubble('ai',
    [ h3({ class: 'welcome-bubble-title' }, step.title()) ]
      .concat(bodyLines.map(line => p(line)))
  );

  const actions = (typeof step.actions === 'function' ? step.actions() : []);
  const actionsBlock = actions.length
    ? div({ class: 'welcome-actions' },
        actions.map(act =>
          a({ href: act.href, class: act.primary ? 'filter-btn welcome-action-primary' : 'filter-btn' }, act.label)
        )
      )
    : null;

  const progressDots = div({ class: 'welcome-progress' },
    STEPS.map((s, i) =>
      a({
        href: `/welcome?step=${i + 1}`,
        class: i === idx ? 'welcome-dot welcome-dot-active' : 'welcome-dot',
        title: s.id
      }, '●')
    )
  );

  return template(
    title,
    section(
      div({ class: 'tags-header welcome-header' },
        h1(title),
        p(i18n.welcomeIntro || 'A short, friendly tour of what Oasis is and how to make it yours.')
      ),
      div({ class: 'welcome-chat' },
        aiHeader,
        aiBubble,
        actionsBlock
      ),
      progressDots,
      div({ class: 'welcome-skip' },
        a({ href: '/', class: 'welcome-skip-link' }, i18n.welcomeSkip || 'Skip the tour')
      )
    )
  );
};
