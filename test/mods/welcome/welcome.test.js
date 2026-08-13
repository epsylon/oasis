const fs = require('fs');
const os = require('os');
const path = require('path');
const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const factory = require('../../../src/models/onboarding_model');

const freshDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-welcome-'));

const setup = () => {
  const net = makeNetwork();
  const peer = makePeer(net);
  peer.setActor();
  const dir = freshDir();
  return { net, peer, dir, onboarding: factory({ cooler: peer.cooler, ssbPath: dir }) };
};

const publish = (peer, content) => new Promise((res, rej) => peer.node.publish(content, (e, m) => e ? rej(e) : res(m)));
const flagOf = (dir) => fs.readFileSync(path.join(dir, 'oasis-first-contact'), 'utf8');

describe('welcome: it only greets a brand new node', (t) => {
  t('a node with no first-contact file yet is greeted right away', () => {
    const { onboarding } = setup();
    ok(onboarding.isVisible(), 'the guide does not wait for the welcome PM');
    notOk(onboarding.firstContactSeen(), 'and the welcome PM is still pending');
  });

  t('an identity whose id carries base64 padding is read back correctly', () => {
    const { onboarding, dir } = setup();
    const id = '@Xy9+aB/cDeF=.ed25519';
    onboarding.begin(id);
    ok(onboarding.firstContactSeen(id), 'the id survives the flag file');
    ok(flagOf(dir).startsWith(id));
  });

  t('a node that already has the first-contact file never sees it', () => {
    const dir = freshDir();
    fs.writeFileSync(path.join(dir, 'oasis-first-contact'), '@old.ed25519\n2024-01-01T00:00:00.000Z\n');
    const { peer } = setup();
    const onboarding = factory({ cooler: peer.cooler, ssbPath: dir });
    notOk(onboarding.isVisible(), 'an existing install is left alone');
    ok(onboarding.firstContactSeen(), 'but the first contact is still recorded');
  });

  t('the first launch writes the flag and opens the guide', () => {
    const { onboarding, peer, dir } = setup();
    ok(onboarding.begin(peer.keypair.id));
    ok(onboarding.isVisible(), 'the banner appears');
    const flag = flagOf(dir);
    ok(flag.startsWith(peer.keypair.id), 'the feed id stays on the first line');
    ok(flag.includes('welcome=pending'));
    ok(onboarding.firstContactSeen(peer.keypair.id), 'the welcome PM will not be sent again');
  });
});

describe('welcome: nothing is mandatory', (t) => {
  t('it can be closed straight away without doing any step', async () => {
    const { onboarding, peer, dir } = setup();
    onboarding.begin(peer.keypair.id);
    ok(onboarding.isVisible());
    onboarding.dismiss();
    notOk(onboarding.isVisible(), 'the banner is gone for good');
    ok(flagOf(dir).includes('welcome=dismissed'));
    const status = await onboarding.status();
    eq(status.done, 0, 'nothing was forced');
    ok(status.dismissed);
  });

  t('a closed guide does not come back on the next launch', () => {
    const { onboarding, peer } = setup();
    onboarding.begin(peer.keypair.id);
    onboarding.dismiss();
    notOk(onboarding.isVisible());
  });
});

describe('welcome: the steps', (t) => {
  t('language and backup are recorded in the same flag file', async () => {
    const { onboarding, peer, dir } = setup();
    onboarding.begin(peer.keypair.id);
    eq((await onboarding.status()).steps.language, false);
    onboarding.markStep('language');
    onboarding.markStep('backup');
    onboarding.markStep('ux');
    const status = await onboarding.status();
    ok(status.steps.language);
    ok(status.steps.backup);
    ok(status.steps.ux, 'the chosen UX is recorded there too');
    eq(status.done, 3);
    eq(status.total, 7);
    notOk(onboarding.markStep('whatever'), 'an unknown step is refused');
    ok(flagOf(dir).includes('step=language'));
  });

  t('the profile step reads the real profile of the inhabitant', async () => {
    const { onboarding, peer } = setup();
    onboarding.begin(peer.keypair.id);
    eq((await onboarding.status()).steps.profile, false);
    await publish(peer, { type: 'about', about: peer.keypair.id, name: 'Alice' });
    ok((await onboarding.status()).steps.profile, 'a published name completes it');
  });

  t('an about with neither name nor picture does not count', async () => {
    const { onboarding, peer } = setup();
    onboarding.begin(peer.keypair.id);
    await publish(peer, { type: 'about', about: peer.keypair.id, description: 'only a description' });
    eq((await onboarding.status()).steps.profile, false);
  });

  t('the federation step reads that the inhabitant reached somebody', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const onboarding = factory({ cooler: A.cooler, ssbPath: freshDir() });
    onboarding.begin(A.keypair.id);
    eq((await onboarding.status()).steps.federation, false, 'alone at first');
    await publish(A, { type: 'contact', contact: B.keypair.id, following: true });
    ok((await onboarding.status()).steps.federation);
  });

  t('steps of disabled modules are left out of the count', async () => {
    const { onboarding, peer } = setup();
    onboarding.begin(peer.keypair.id);
    onboarding.markStep('language');
    await publish(peer, { type: 'about', about: peer.keypair.id, name: 'Alice' });
    const status = await onboarding.status({ federation: false, larp: false, backup: false, greeting: false, ux: false });
    eq(status.total, 2, 'only the steps that this node can do');
    eq(status.done, 2);
    ok(status.complete, 'the guide can be completed without them');
  });

  t('the guide closes itself once every step is done', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const dir = freshDir();
    const onboarding = factory({ cooler: A.cooler, ssbPath: dir });
    onboarding.begin(A.keypair.id);
    onboarding.markStep('language');
    onboarding.markStep('backup');
    onboarding.markStep('ux');
    await publish(A, { type: 'about', about: A.keypair.id, name: 'Alice' });
    await publish(A, { type: 'contact', contact: B.keypair.id, following: true });
    await publish(A, { type: 'feed', text: 'Hello, I have just arrived.' });
    await publish(A, { type: 'larpJoinHouse', house: 'academia' });
    const status = await onboarding.status();
    eq(status.done, 7);
    ok(status.complete);
    notOk(onboarding.isVisible(), 'the banner disappears on its own');
    ok(flagOf(dir).includes('welcome=done'));
  });
});

describe('welcome: the greeting', (t) => {
  t('the step is done once the inhabitant publishes a first message', async () => {
    const { onboarding, peer } = setup();
    onboarding.begin(peer.keypair.id);
    eq((await onboarding.status()).steps.greeting, false, 'nothing published yet');
    await publish(peer, { type: 'feed', text: 'Hello, I have just arrived.' });
    ok((await onboarding.status()).steps.greeting, 'the first message completes it');
  });

  t('an empty message does not count as a greeting', async () => {
    const { onboarding, peer } = setup();
    onboarding.begin(peer.keypair.id);
    await publish(peer, { type: 'feed', text: '   ' });
    eq((await onboarding.status()).steps.greeting, false);
  });
});

describe('welcome: the L.A.R.P. step', (t) => {
  t('joining the Academy completes it', async () => {
    const { onboarding, peer } = setup();
    onboarding.begin(peer.keypair.id);
    eq((await onboarding.status()).steps.larp, false, 'not playing yet');
    await publish(peer, { type: 'larpJoinHouse', house: 'academia' });
    ok((await onboarding.status()).steps.larp, 'the Academy counts');
  });

  t('leaving the game undoes it', async () => {
    const { onboarding, peer } = setup();
    onboarding.begin(peer.keypair.id);
    await publish(peer, { type: 'larpJoinHouse', house: 'academia' });
    await publish(peer, { type: 'larpLeaveLarp' });
    eq((await onboarding.status()).steps.larp, false, 'whoever leaves is not in a house');
  });
});

describe('welcome: the guide reads the profile without extra queries', (t) => {
  t('status returns the current name, description and picture', async () => {
    const { onboarding, peer } = setup();
    onboarding.begin(peer.keypair.id);
    const empty = await onboarding.status();
    eq(empty.profile.name, '', 'nothing to prefill on a new node');
    eq(empty.profile.description, '');
    eq(empty.profile.image, '');
    await publish(peer, { type: 'about', about: peer.keypair.id, name: 'Alice', description: 'gardener', image: '&abc.sha256' });
    const filled = await onboarding.status();
    eq(filled.profile.name, 'Alice');
    eq(filled.profile.description, 'gardener');
    eq(filled.profile.image, '&abc.sha256');
  });

  t('the latest values win over the older ones', async () => {
    const { onboarding, peer } = setup();
    onboarding.begin(peer.keypair.id);
    await publish(peer, { type: 'about', about: peer.keypair.id, name: 'Old name' });
    await publish(peer, { type: 'about', about: peer.keypair.id, name: 'New name' });
    eq((await onboarding.status()).profile.name, 'New name');
  });
});

describe('welcome: the identity shown with the backup step', (t) => {
  t('status carries the feed id of the inhabitant', async () => {
    const { onboarding, peer } = setup();
    onboarding.begin(peer.keypair.id);
    eq((await onboarding.status()).profile.id, peer.keypair.id);
  });
});
