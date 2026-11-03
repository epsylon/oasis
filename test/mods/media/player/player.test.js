const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { eq, ok, notOk } = require('../../../helpers/assert');
const player = require('../../../../src/backend/media_player');

const fakeProc = () => {
  const p = new EventEmitter();
  p.stdout = new PassThrough();
  p.killed = false;
  p.kill = () => { p.killed = true; setImmediate(() => p.emit('close', null)); };
  return p;
};

const rig = (info = { duration: 120, audio: true }) => {
  const opened = [];
  const sinks = [];
  player.stop();
  player.setProbe(async () => info);
  player.setDecoderFactory(() => ({ open: (file, offset) => { const p = fakeProc(); opened.push({ file, offset, proc: p }); return p; } }));
  player.setOutputFactory(() => ({ open: () => { const sink = new PassThrough(); sink.resume(); const s = { sink, stopped: false, stop() { s.stopped = true; } }; sinks.push(s); return s; } }));
  return { opened, sinks };
};
const START = { file: '/tmp/x.mp3', blobId: '&' + 'a'.repeat(43) + '=.sha256', title: 'Episode', href: '/podcasts/episode/abc' };
const tick = () => new Promise((r) => setImmediate(r));

describe('media player: background playback state', (t) => {
  t('start plays from zero and reports title, href and duration', async () => {
    const { opened, sinks } = rig();
    const st = await player.start(START);
    ok(st);
    eq(st.title, 'Episode');
    eq(st.href, '/podcasts/episode/abc');
    eq(st.duration, 120);
    notOk(st.paused);
    eq(opened.length, 1);
    eq(opened[0].offset, 0);
    eq(sinks.length, 1);
    player.stop();
  });

  t('pause freezes the position and resume restarts the decoder there', async () => {
    const { opened } = rig();
    await player.start(START);
    player.seek(30);
    player.pause();
    const paused = player.status();
    ok(paused.paused);
    ok(Math.abs(paused.position - 30) < 1);
    ok(opened[opened.length - 1].proc.killed);
    player.resume();
    notOk(player.status().paused);
    ok(Math.abs(opened[opened.length - 1].offset - 30) < 1);
    player.stop();
  });

  t('seek stays between zero and the last second', async () => {
    rig({ duration: 40, audio: true });
    await player.start(START);
    player.seek(-15);
    ok(player.status().position < 1);
    player.seek(15); player.seek(15); player.seek(15);
    ok(player.status().position <= 39.5);
    player.stop();
  });

  t('stop clears the banner state and stops the sound output', async () => {
    const { sinks } = rig();
    await player.start(START);
    player.stop();
    eq(player.status(), null);
    ok(sinks[0].stopped);
  });

  t('when a track ends with nothing after it, the same one plays again', async () => {
    const { opened } = rig();
    player.setNextResolver(null);
    await player.start(START);
    opened[0].proc.emit('close', 0);
    for (let i = 0; i < 5; i++) await tick();
    ok(player.status(), 'still playing');
    eq(opened.length, 2);
    eq(opened[1].offset, 0);
    eq(player.status().title, 'Episode');
    player.stop();
  });

  t('when a track ends, the next one of the list plays', async () => {
    const { opened } = rig();
    player.setNextResolver(async (st) => (st.href === START.href ? { ...START, file: '/tmp/next.mp3', blobId: '&' + 'n'.repeat(43) + '=.sha256', title: 'Next', href: '/audios/next' } : null));
    await player.start(START);
    opened[0].proc.emit('close', 0);
    for (let i = 0; i < 8; i++) await tick();
    eq(player.status().title, 'Next');
    eq(opened[opened.length - 1].file, '/tmp/next.mp3');
    player.setNextResolver(null);
    player.stop();
  });

  t('without a sound output the player is not offered', async () => {
    rig();
    player.setOutputFactory(() => null);
    notOk(player.available());
    eq(await player.start(START), null);
    player.setOutputFactory(null);
    player.setDecoderFactory(null);
    player.setProbe(null);
  });

  t('decoder arguments seek and keep only the sound at 48 kHz stereo', () => {
    const args = player.decodeArgs('/f', 12);
    ok(args.includes('-ss') && args[args.indexOf('-ss') + 1] === '12');
    ok(args.includes('0:a:0') && args.includes('pipe:1'));
    ok(args.includes(String(player.RATE)) && args.includes(String(player.CHANNELS)));
  });

  t('a file without sound is not played', async () => {
    rig({ duration: 60, audio: false });
    eq(await player.start(START), null);
    eq(player.status(), null);
  });
  t('next and previous skip along the list, and previous with nothing before starts the track again', async () => {
    const { opened } = rig();
    const song = { ...START, href: '/audios/one', title: 'One' };
    player.setNextResolver(async (st, step) => (step > 0 && st.href === '/audios/one' ? { ...song, file: '/tmp/two.mp3', href: '/audios/two', title: 'Two' } : null));
    await player.start(song);
    await player.skip(1);
    eq(player.status().title, 'Two');
    player.seek(30);
    await player.skip(-1);
    eq(player.status().title, 'Two');
    ok(player.status().position < 1, 'starts again');
    player.setNextResolver(null);
    player.stop();
  });

});
