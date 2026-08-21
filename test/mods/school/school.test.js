const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const course = (over = {}) => ({
  title: 'Course', description: 'd', tags: ['learn'], price: '0', visibility: 'PUBLIC', ...over
});

describe('school: create + update + delete', (t) => {
  t('A creates a course with defaults', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course({ title: 'Botanics' }));
    ok(r);
    const list = await A.use('school').listCourses('ALL', A.keypair.id, {});
    const c = list.find(x => x.title === 'Botanics');
    ok(c);
    eq(c.visibility, 'PUBLIC');
    eq(c.status, 'ONGOING');
    eq(c.price, '0.000000');
  });

  t('A updates own course', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course({ title: 'Old' }));
    await A.use('school').updateCourse(r.key, { title: 'New' });
    const list = await A.use('school').listCourses('ALL', A.keypair.id, {});
    ok(list.find(x => x.title === 'New'));
    ok(!list.find(x => x.title === 'Old'));
  });

  t('B cannot update A course', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    B.setActor();
    let threw = false;
    try { await B.use('school').updateCourse(r.key, { title: 'Stolen' }); } catch (_) { threw = true; }
    ok(threw);
  });

  t('A deletes own course', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course({ title: 'Gone' }));
    await A.use('school').deleteCourse(r.key);
    const list = await A.use('school').listCourses('ALL', A.keypair.id, {});
    ok(!list.find(x => x.title === 'Gone'));
  });

  t('creator can flip status ONGOING -> CLOSED and back', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course());
    await A.use('school').updateCourseStatus(r.key, 'CLOSED');
    let list = await A.use('school').listCourses('ALL', A.keypair.id, {});
    eq(list[0].status, 'CLOSED');
    await A.use('school').updateCourseStatus(list[0].id, 'ONGOING');
    list = await A.use('school').listCourses('ALL', A.keypair.id, {});
    eq(list[0].status, 'ONGOING');
  });
});

describe('school: enrollment on free courses', (t) => {
  t('B enrolls and appears as student', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    B.setActor();
    await B.use('school').enroll(r.key);
    const c = await B.use('school').getCourseById(r.key, B.keypair.id);
    ok(c.students.includes(B.keypair.id));
    eq(c.pending.length, 0);
  });

  t('B unenrolls and leaves the students list', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    B.setActor();
    await B.use('school').enroll(r.key);
    await B.use('school').unenroll(r.key);
    const c = await B.use('school').getCourseById(r.key, B.keypair.id);
    ok(!c.students.includes(B.keypair.id));
  });

  t('teacher cannot enroll in own course', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course());
    let threw = false;
    try { await A.use('school').enroll(r.key); } catch (_) { threw = true; }
    ok(threw);
  });

  t('enrolling in a CLOSED course is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    await A.use('school').updateCourseStatus(r.key, 'CLOSED');
    B.setActor();
    let threw = false;
    try { await B.use('school').enroll(r.key); } catch (_) { threw = true; }
    ok(threw);
  });
});

describe('school: filters', (t) => {
  t('MINE returns only courses the viewer teaches', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('school').createCourse(course({ title: 'ByA' }));
    B.setActor();
    await B.use('school').createCourse(course({ title: 'ByB' }));
    const mine = await B.use('school').listCourses('MINE', B.keypair.id, {});
    ok(mine.find(x => x.title === 'ByB'));
    ok(!mine.find(x => x.title === 'ByA'));
  });

  t('APPLIED returns courses the viewer enrolled in', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ title: 'Joined' }));
    await A.use('school').createCourse(course({ title: 'NotJoined' }));
    B.setActor();
    await B.use('school').enroll(r.key);
    const applied = await B.use('school').listCourses('APPLIED', B.keypair.id, {});
    ok(applied.find(x => x.title === 'Joined'));
    ok(!applied.find(x => x.title === 'NotJoined'));
  });

  t('OPEN returns only free courses', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('school').createCourse(course({ title: 'FreeOne', price: '0' }));
    await A.use('school').createCourse(course({ title: 'PaidOne', price: '3' }));
    const open = await A.use('school').listCourses('OPEN', A.keypair.id, {});
    ok(open.find(x => x.title === 'FreeOne'));
    ok(!open.find(x => x.title === 'PaidOne'));
  });

  t('text search matches title and tags', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('school').createCourse(course({ title: 'Permaculture', tags: ['soil'] }));
    await A.use('school').createCourse(course({ title: 'Electronics' }));
    const byTitle = await A.use('school').listCourses('ALL', A.keypair.id, { q: 'permacul' });
    eq(byTitle.length, 1);
    const byTag = await A.use('school').listCourses('ALL', A.keypair.id, { q: 'soil' });
    eq(byTag.length, 1);
  });
});

describe('school: invite-only visibility', (t) => {
  t('INVITE course is hidden from non-invited inhabitants', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ title: 'Secret', visibility: 'INVITE' }));
    const own = await A.use('school').listCourses('ALL', A.keypair.id, {});
    ok(own.find(x => x.title === 'Secret'));
    B.setActor();
    const list = await B.use('school').listCourses('ALL', B.keypair.id, {});
    ok(!list.find(x => x.title === 'Secret'));
    let threw = false;
    try { await B.use('school').getCourseById(r.key, B.keypair.id); } catch (_) { threw = true; }
    ok(threw);
  });

  t('invited student can see and enroll', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ title: 'Invited', visibility: 'INVITE' }));
    await A.use('school').inviteStudent(r.key, B.keypair.id);
    B.setActor();
    const list = await B.use('school').listCourses('ALL', B.keypair.id, {});
    const c = list.find(x => x.title === 'Invited');
    ok(c);
    await B.use('school').enroll(c.id);
    const after = await B.use('school').getCourseById(c.id, B.keypair.id);
    ok(after.students.includes(B.keypair.id));
  });

  t('non-invited cannot enroll even with the id', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ visibility: 'INVITE' }));
    B.setActor();
    let threw = false;
    try { await B.use('school').enroll(r.key); } catch (_) { threw = true; }
    ok(threw);
  });
});

describe('school: lessons', (t) => {
  t('teacher adds and lists lessons in order', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course());
    await A.use('school').addLesson(r.key, { title: 'L1', text: 'first' });
    await A.use('school').addLesson(r.key, { title: 'L2', text: 'second' });
    const lessons = await A.use('school').listLessons(r.key);
    eq(lessons.length, 2);
    eq(lessons[0].title, 'L1');
    eq(lessons[1].title, 'L2');
  });

  t('non-author cannot add lessons', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    B.setActor();
    let threw = false;
    try { await B.use('school').addLesson(r.key, { title: 'X', text: 'x' }); } catch (_) { threw = true; }
    ok(threw);
  });

  t('teacher deletes a lesson', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course());
    const l = await A.use('school').addLesson(r.key, { title: 'Tmp', text: 't' });
    await A.use('school').deleteLesson(l.key);
    const lessons = await A.use('school').listLessons(r.key);
    eq(lessons.length, 0);
  });
});

describe('school: certificates', (t) => {
  t('teacher issues a certificate to an enrolled student', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ title: 'CertCourse' }));
    B.setActor();
    await B.use('school').enroll(r.key);
    A.setActor();
    await A.use('school').issueCertificate(r.key, B.keypair.id, 'well done');
    const certs = await A.use('school').listCertificates(r.key);
    eq(certs.length, 1);
    eq(certs[0].student, B.keypair.id);
    eq(certs[0].author, A.keypair.id);
    const mine = await B.use('school').listCertificatesForStudent(B.keypair.id);
    eq(mine.length, 1);
    eq(mine[0].courseTitle, 'CertCourse');
  });

  t('certificate for a non-enrolled inhabitant is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    let threw = false;
    try { await A.use('school').issueCertificate(r.key, B.keypair.id); } catch (_) { threw = true; }
    ok(threw);
  });

  t('a certificate is only issued once per student', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    B.setActor();
    await B.use('school').enroll(r.key);
    A.setActor();
    await A.use('school').issueCertificate(r.key, B.keypair.id);
    const again = await A.use('school').issueCertificate(r.key, B.keypair.id);
    ok(again.alreadyIssued);
    const certs = await A.use('school').listCertificates(r.key);
    eq(certs.length, 1);
  });
});

describe('school: paid courses generate an ECO bill', (t) => {
  t('enrolling in a paid course leaves the student pending with a bill', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ title: 'PaidCourse', price: '5' }));
    B.setActor();
    await B.use('school').enroll(r.key);
    const c = await B.use('school').getCourseById(r.key, B.keypair.id);
    ok(!c.students.includes(B.keypair.id));
    eq(c.pending.length, 1);
    eq(c.pending[0].author, B.keypair.id);
    ok(c.pending[0].transferId);
    const bill = await B.use('transfers').getTransferById(c.pending[0].transferId);
    eq(bill.to, A.keypair.id);
    eq(bill.amount, '5.000000');
    eq(bill.status, 'UNCONFIRMED');
  });

  t('signing the bill confirms the enrollment', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ price: '2' }));
    B.setActor();
    await B.use('school').enroll(r.key);
    let c = await B.use('school').getCourseById(r.key, B.keypair.id);
    const billId = c.pending[0].transferId;
    A.setActor();
    await A.use('transfers').confirmTransferById(billId);
    c = await A.use('school').getCourseById(r.key, A.keypair.id);
    ok(c.students.includes(B.keypair.id));
    eq(c.pending.length, 0);
  });

  t('certificates require a signed bill', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ price: '2' }));
    B.setActor();
    await B.use('school').enroll(r.key);
    A.setActor();
    let threw = false;
    try { await A.use('school').issueCertificate(r.key, B.keypair.id); } catch (_) { threw = true; }
    ok(threw);
    const c = await A.use('school').getCourseById(r.key, A.keypair.id);
    await A.use('transfers').confirmTransferById(c.pending[0].transferId);
    await A.use('school').issueCertificate(r.key, B.keypair.id);
    const certs = await A.use('school').listCertificates(r.key);
    eq(certs.length, 1);
  });

  t('a pending student cannot enroll twice', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ price: '1' }));
    B.setActor();
    await B.use('school').enroll(r.key);
    const again = await B.use('school').enroll(r.key);
    ok(again.alreadyPending);
    const c = await B.use('school').getCourseById(r.key, B.keypair.id);
    eq(c.pending.length, 1);
  });
});

describe('school: encryption of non-open courses', (t) => {
  t('lessons of a paid course are locked without the course key', async () => {
    const net = makeNetwork(); const A = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ price: '4' }));
    await A.use('school').addLesson(r.key, { title: 'SecretLesson', text: 'hidden content' });
    const own = await A.use('school').listLessons(r.key);
    eq(own[0].locked, false);
    eq(own[0].title, 'SecretLesson');
    C.setActor();
    const seen = await C.use('school').listLessons(r.key);
    eq(seen.length, 1);
    eq(seen[0].locked, true);
    eq(seen[0].title, null);
    eq(seen[0].text, null);
  });

  t('granting the key lets a confirmed student decrypt the lessons', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ price: '2' }));
    await A.use('school').addLesson(r.key, { title: 'Paywalled', text: 'the goods' });
    B.setActor();
    await B.use('school').enroll(r.key);
    let seen = await B.use('school').listLessons(r.key);
    eq(seen[0].locked, true);
    A.setActor();
    let c = await A.use('school').getCourseById(r.key, A.keypair.id);
    await A.use('transfers').confirmTransferById(c.pending[0].transferId);
    await A.use('school').grantAccess(r.key, B.keypair.id);
    B.setActor();
    seen = await B.use('school').listLessons(r.key);
    eq(seen[0].locked, false);
    eq(seen[0].text, 'the goods');
  });

  t('inviting a student to an INVITE course shares the key automatically', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ visibility: 'INVITE' }));
    await A.use('school').addLesson(r.key, { title: 'ForInvited', text: 'members only' });
    await A.use('school').inviteStudent(r.key, B.keypair.id);
    B.setActor();
    const list = await B.use('school').listCourses('ALL', B.keypair.id, {});
    const lessons = await B.use('school').listLessons(list[0].id);
    eq(lessons[0].locked, false);
    eq(lessons[0].text, 'members only');
  });

  t('teacher cannot send the key to a stranger', async () => {
    const net = makeNetwork(); const A = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ price: '3' }));
    let threw = false;
    try { await A.use('school').grantAccess(r.key, C.keypair.id); } catch (_) { threw = true; }
    ok(threw);
  });
});

describe('school: enrollment privacy on non-open courses', (t) => {
  t('a third inhabitant cannot see who enrolled in a paid course', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ price: '5' }));
    B.setActor();
    await B.use('school').enroll(r.key);
    A.setActor();
    const teacherView = await A.use('school').getCourseById(r.key, A.keypair.id);
    eq(teacherView.pending.length, 1);
    C.setActor();
    const strangerView = await C.use('school').getCourseById(r.key, C.keypair.id);
    eq(strangerView.students.length, 0);
    eq(strangerView.pending.length, 0);
  });

  t('free open courses keep public enrollment', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    B.setActor();
    await B.use('school').enroll(r.key);
    C.setActor();
    const c = await C.use('school').getCourseById(r.key, C.keypair.id);
    ok(c.students.includes(B.keypair.id));
  });
});

describe('school: star ratings by students', (t) => {
  t('an enrolled student can rate the course', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    B.setActor();
    await B.use('school').enroll(r.key);
    await B.use('school').createOpinion(r.key, 'interesting');
    const c = await B.use('school').getCourseById(r.key, B.keypair.id);
    eq(c.opinions.interesting, 1);
    ok(c.opinions_inhabitants.includes(B.keypair.id));
  });

  t('a non-student cannot rate', async () => {
    const net = makeNetwork(); const A = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    C.setActor();
    let threw = false;
    try { await C.use('school').createOpinion(r.key, 'useful'); } catch (_) { threw = true; }
    ok(threw);
  });

  t('the teacher cannot rate their own course', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course());
    let threw = false;
    try { await A.use('school').createOpinion(r.key, 'love'); } catch (_) { threw = true; }
    ok(threw);
  });

  t('one vote per student', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    B.setActor();
    await B.use('school').enroll(r.key);
    await B.use('school').createOpinion(r.key, 'clear');
    let threw = false;
    try { await B.use('school').createOpinion(r.key, 'useful'); } catch (_) { threw = true; }
    ok(threw);
    const c = await B.use('school').getCourseById(r.key, B.keypair.id);
    eq(c.opinions_inhabitants.length, 1);
  });
});

describe('school: course chat and dates', (t) => {
  t('creating a course creates its chat with the Course: title template', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course({ title: 'Herbs' }));
    const c = await A.use('school').getCourseById(r.key, A.keypair.id);
    ok(c.chatId);
    const chat = await A.use('chats').getChatById(c.chatId);
    eq(chat.title, 'Course: Herbs');
    eq(chat.status, 'OPEN');
  });

  t('a protected course gets an invite-only chat', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course({ price: '3' }));
    const c = await A.use('school').getCourseById(r.key, A.keypair.id);
    const chat = await A.use('chats').getChatById(c.chatId);
    eq(chat.status, 'INVITE-ONLY');
  });

  t('enrolling in an open course joins its chat', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    B.setActor();
    await B.use('school').enroll(r.key);
    const c = await B.use('school').getCourseById(r.key, B.keypair.id);
    const chat = await B.use('chats').getChatById(c.chatId);
    ok(chat.members.includes(B.keypair.id));
  });

  t('startDate and lesson sessionDate are stored', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course({ startDate: '2026-09-01' }));
    await A.use('school').addLesson(r.key, { title: 'S1', text: 't', sessionDate: '2026-09-02' });
    const c = await A.use('school').getCourseById(r.key, A.keypair.id);
    ok(String(c.startDate).startsWith('2026-09-01'));
    const lessons = await A.use('school').listLessons(r.key);
    ok(String(lessons[0].sessionDate).startsWith('2026-09-02'));
  });

  t('a teaching course appears in the teacher agenda', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('school').createCourse(course({ title: 'AgendaCourse' }));
    const agenda = await A.use('agenda').listAgenda('school');
    ok(agenda.items.find(i => i.title === 'AgendaCourse'));
  });
});

describe('school: lesson units and ordering', (t) => {
  t('lessons sort by explicit order before creation date', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course());
    await A.use('school').addLesson(r.key, { title: 'Second', text: 't', order: 2, unit: 'Phase 1' });
    await A.use('school').addLesson(r.key, { title: 'First', text: 't', order: 1, unit: 'Phase 1' });
    await A.use('school').addLesson(r.key, { title: 'Unordered', text: 't' });
    const lessons = await A.use('school').listLessons(r.key);
    eq(lessons[0].title, 'First');
    eq(lessons[1].title, 'Second');
    eq(lessons[2].title, 'Unordered');
    eq(lessons[0].unit, 'Phase 1');
  });
});

describe('school: self-tracked progress', (t) => {
  t('a student marks lessons and the teacher sees the count without acting', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    const l1 = await A.use('school').addLesson(r.key, { title: 'L1', text: 't' });
    await A.use('school').addLesson(r.key, { title: 'L2', text: 't' });
    B.setActor();
    await B.use('school').enroll(r.key);
    await B.use('school').markLesson(r.key, l1.key);
    const lessons = await B.use('school').listLessons(r.key);
    eq(lessons.find(l => l.title === 'L1').completed, true);
    eq(lessons.find(l => l.title === 'L2').completed, false);
    A.setActor();
    const progress = await A.use('school').progressForCourse(r.key);
    eq(progress[B.keypair.id], 1);
  });

  t('a non-student cannot track progress', async () => {
    const net = makeNetwork(); const A = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    const l = await A.use('school').addLesson(r.key, { title: 'L', text: 't' });
    C.setActor();
    let threw = false;
    try { await C.use('school').markLesson(r.key, l.key); } catch (_) { threw = true; }
    ok(threw);
  });
});

describe('school: exams on protected courses', (t) => {
  const setupPaid = async (A, B) => {
    A.setActor();
    const r = await A.use('school').createCourse(course({ price: '2' }));
    B.setActor();
    await B.use('school').enroll(r.key);
    A.setActor();
    const c = await A.use('school').getCourseById(r.key, A.keypair.id);
    await A.use('transfers').confirmTransferById(c.pending[0].transferId);
    await A.use('school').grantAccess(r.key, B.keypair.id);
    return r;
  };

  t('exams are rejected on open courses', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course());
    let threw = false;
    try { await A.use('school').createExam(r.key, 'Test'); } catch (_) { threw = true; }
    ok(threw);
  });

  t('teacher creates an exam, student takes it and gets graded', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const r = await setupPaid(A, B);
    const exam = await A.use('school').createExam(r.key, 'Final');
    await A.use('school').addExamQuestion(r.key, exam.key, { q: 'What is 2+2?', o1: '3', o2: '4', o3: '5', o4: '6', correct: '1', points: '2' });
    await A.use('school').addExamQuestion(r.key, exam.key, { q: 'Color of the sky?', o1: 'blue', o2: 'green', o3: 'red', o4: 'black', correct: '0', points: '1' });
    B.setActor();
    const exams = await B.use('school').listExams(r.key);
    eq(exams.length, 1);
    eq(exams[0].locked, false);
    eq(exams[0].questions.length, 2);
    await B.use('school').takeExam(r.key, exams[0].id, { q0: '1', q1: '0' });
    const after = await B.use('school').listExams(r.key);
    eq(after[0].myResult.score, 10);
    eq(after[0].myResult.total, 10);
    let threw = false;
    try { await B.use('school').takeExam(r.key, exams[0].id, { q0: '1', q1: '0' }); } catch (_) { threw = true; }
    ok(threw);
    A.setActor();
    const teacherView = await A.use('school').listExams(r.key);
    eq(teacherView[0].results.length, 1);
    eq(teacherView[0].results[0].score, 10);
    eq(teacherView[0].results[0].passed, true);
  });

  t('a failed exam cannot be retried within 24 hours', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const r = await setupPaid(A, B);
    const exam1 = await A.use('school').createExam(r.key, 'Once');
    await A.use('school').addExamQuestion(r.key, exam1.key, { q: 'Q?', o1: 'wrong', o2: 'right', o3: 'no', o4: 'nope', correct: '1', points: '1' });
    B.setActor();
    const exams = await B.use('school').listExams(r.key);
    await B.use('school').takeExam(r.key, exams[0].id, { q0: '0' });
    let threw = false;
    try { await B.use('school').takeExam(r.key, exams[0].id, { q0: '1' }); } catch (_) { threw = true; }
    ok(threw);
    const after = await B.use('school').listExams(r.key);
    eq(after[0].myResult.score, 0);
  });

  t('an outsider cannot read the exam', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    const r = await setupPaid(A, B);
    const exam2 = await A.use('school').createExam(r.key, 'Hidden');
    await A.use('school').addExamQuestion(r.key, exam2.key, { q: 'Q?', o1: 'a', o2: 'b', o3: 'c', o4: 'd', correct: '0', points: '1' });
    C.setActor();
    const exams = await C.use('school').listExams(r.key);
    eq(exams[0].locked, true);
    eq(exams[0].questions.length, 0);
  });
});

describe('school: lesson materials', (t) => {
  t('teacher attaches materials and lists them back', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course());
    const l = await A.use('school').addLesson(r.key, { title: 'L', text: 't' });
    await A.use('school').addLessonMaterial(r.key, l.key, '![image:diagram.png](&abc.sha256)');
    await A.use('school').addLessonMaterial(r.key, l.key, 'Extra reading notes');
    const mats = await A.use('school').listLessonMaterials(r.key, l.key);
    eq(mats.length, 2);
    ok(mats[0].media.includes('diagram.png'));
  });

  t('non-teacher cannot attach materials', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    const l = await A.use('school').addLesson(r.key, { title: 'L', text: 't' });
    B.setActor();
    let threw = false;
    try { await B.use('school').addLessonMaterial(r.key, l.key, 'x'); } catch (_) { threw = true; }
    ok(threw);
  });

  t('materials of a paid course are locked without the key', async () => {
    const net = makeNetwork(); const A = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ price: '2' }));
    const l = await A.use('school').addLesson(r.key, { title: 'L', text: 't' });
    await A.use('school').addLessonMaterial(r.key, l.key, '[pdf:secret.pdf](&xyz.sha256)');
    C.setActor();
    const mats = await C.use('school').listLessonMaterials(r.key, l.key);
    eq(mats.length, 1);
    eq(mats[0].locked, true);
    eq(mats[0].media, null);
  });

  t('teacher deletes a material', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course());
    const l = await A.use('school').addLesson(r.key, { title: 'L', text: 't' });
    const mat = await A.use('school').addLessonMaterial(r.key, l.key, 'to remove');
    await A.use('school').deleteLessonMaterial(mat.key);
    const mats = await A.use('school').listLessonMaterials(r.key, l.key);
    eq(mats.length, 0);
  });
});

describe('school: materials never leak into exams', (t) => {
  t('lesson materials do not appear as exams', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course());
    const l = await A.use('school').addLesson(r.key, { title: 'L', text: 't' });
    await A.use('school').addLessonMaterial(r.key, l.key, 'note one');
    await A.use('school').addLessonMaterial(r.key, l.key, 'note two');
    const exams = await A.use('school').listExams(r.key);
    eq(exams.length, 0);
  });
});

describe('school: certificate requires passing every lesson', (t) => {
  t('progress on all lessons unlocks the certificate', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    const l1 = await A.use('school').addLesson(r.key, { title: 'L1', text: 't' });
    const l2 = await A.use('school').addLesson(r.key, { title: 'L2', text: 't' });
    B.setActor();
    await B.use('school').enroll(r.key);
    await B.use('school').markLesson(r.key, l1.key);
    A.setActor();
    let threw = false;
    try { await A.use('school').issueCertificate(r.key, B.keypair.id); } catch (_) { threw = true; }
    ok(threw);
    B.setActor();
    await B.use('school').markLesson(r.key, l2.key);
    A.setActor();
    await A.use('school').issueCertificate(r.key, B.keypair.id);
    const certs = await A.use('school').listCertificates(r.key);
    eq(certs.length, 1);
  });

  t('a lesson exam must be passed with a perfect score', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ price: '2' }));
    const l1 = await A.use('school').addLesson(r.key, { title: 'L1', text: 't' });
    B.setActor();
    await B.use('school').enroll(r.key);
    A.setActor();
    let c = await A.use('school').getCourseById(r.key, A.keypair.id);
    await A.use('transfers').confirmTransferById(c.pending[0].transferId);
    await A.use('school').grantAccess(r.key, B.keypair.id);
    const exam = await A.use('school').createExam(r.key, 'L1 exam', { lessonId: l1.key });
    await A.use('school').addExamQuestion(r.key, exam.key, { q: 'Q1', o1: 'a', o2: 'b', o3: 'c', o4: 'd', correct: '0' });
    await A.use('school').addExamQuestion(r.key, exam.key, { q: 'Q2', o1: 'a', o2: 'b', o3: 'c', o4: 'd', correct: '1' });
    B.setActor();
    await B.use('school').takeExam(r.key, exam.key, { q0: '0', q1: '3' });
    const exams = await B.use('school').listExams(r.key);
    eq(exams[0].myResult.score, 5);
    eq(exams[0].myResult.passed, false);
    eq(await B.use('school').hasPassedCourse(r.key, B.keypair.id), false);
    A.setActor();
    let threw = false;
    try { await A.use('school').issueCertificate(r.key, B.keypair.id); } catch (_) { threw = true; }
    ok(threw);
  });

  t('hasPassedCourse turns true when the exam is aced', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ price: '2' }));
    const l1 = await A.use('school').addLesson(r.key, { title: 'L1', text: 't' });
    B.setActor();
    await B.use('school').enroll(r.key);
    A.setActor();
    const c = await A.use('school').getCourseById(r.key, A.keypair.id);
    await A.use('transfers').confirmTransferById(c.pending[0].transferId);
    await A.use('school').grantAccess(r.key, B.keypair.id);
    const exam = await A.use('school').createExam(r.key, 'Final', { lessonId: l1.key });
    await A.use('school').addExamQuestion(r.key, exam.key, { q: 'Q1', o1: 'a', o2: 'b', o3: 'c', o4: 'd', correct: '2' });
    B.setActor();
    await B.use('school').takeExam(r.key, exam.key, { q0: '2' });
    eq(await B.use('school').hasPassedCourse(r.key, B.keypair.id), true);
    A.setActor();
    await A.use('school').issueCertificate(r.key, B.keypair.id);
    const certs = await A.use('school').listCertificates(r.key);
    eq(certs[0].student, B.keypair.id);
  });

  t('a failed exam can be retried once the cooldown expires', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ price: '2' }));
    B.setActor();
    await B.use('school').enroll(r.key);
    A.setActor();
    const c = await A.use('school').getCourseById(r.key, A.keypair.id);
    await A.use('transfers').confirmTransferById(c.pending[0].transferId);
    await A.use('school').grantAccess(r.key, B.keypair.id);
    const exam = await A.use('school').createExam(r.key, 'Retry', {});
    await A.use('school').addExamQuestion(r.key, exam.key, { q: 'Q1', o1: 'a', o2: 'b', o3: 'c', o4: 'd', correct: '0' });
    B.setActor();
    await B.use('school').takeExam(r.key, exam.key, { q0: '1' });
    const realNow = Date.now;
    Date.now = () => realNow() + 25 * 60 * 60 * 1000;
    try {
      await B.use('school').takeExam(r.key, exam.key, { q0: '0' });
    } finally {
      Date.now = realNow;
    }
    const exams = await B.use('school').listExams(r.key);
    eq(exams[0].myResult.score, 10);
    eq(exams[0].myResult.passed, true);
  });
});

describe('school: student lifecycle details', (t) => {
  t('editing a lesson preserves student progress', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course());
    const l = await A.use('school').addLesson(r.key, { title: 'Old title', text: 't' });
    B.setActor();
    await B.use('school').enroll(r.key);
    await B.use('school').markLesson(r.key, l.key);
    A.setActor();
    await A.use('school').updateLesson(r.key, l.key, { title: 'New title' });
    B.setActor();
    const lessons = await B.use('school').listLessons(r.key);
    eq(lessons.length, 1);
    eq(lessons[0].title, 'New title');
    eq(lessons[0].completed, true);
  });

  t('a pending student who unenrolls disappears from pending', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ price: '1' }));
    B.setActor();
    await B.use('school').enroll(r.key);
    await B.use('school').unenroll(r.key);
    A.setActor();
    const c = await A.use('school').getCourseById(r.key, A.keypair.id);
    eq(c.pending.length, 0);
    eq(c.students.length, 0);
  });

  t('APPLIED includes courses with a pending bill', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ title: 'PendingCourse', price: '1' }));
    B.setActor();
    await B.use('school').enroll(r.key);
    const applied = await B.use('school').listCourses('APPLIED', B.keypair.id, {});
    ok(applied.find(x => x.title === 'PendingCourse'));
  });

  t('material captions are stored and listed', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course());
    const l = await A.use('school').addLesson(r.key, { title: 'L', text: 't' });
    await A.use('school').addLessonMaterial(r.key, l.key, '![image:x.png](&a.sha256)', 'Bed layout diagram');
    const mats = await A.use('school').listLessonMaterials(r.key, l.key);
    eq(mats[0].caption, 'Bed layout diagram');
  });

  t('granting course access adds the student to the course chat', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ price: '2' }));
    B.setActor();
    await B.use('school').enroll(r.key);
    A.setActor();
    const c = await A.use('school').getCourseById(r.key, A.keypair.id);
    await A.use('transfers').confirmTransferById(c.pending[0].transferId);
    await A.use('school').grantAccess(r.key, B.keypair.id);
    const chat = await A.use('chats').getChatById(c.chatId);
    ok(chat.members.includes(B.keypair.id));
  });
});

describe('school: invitation codes', (t) => {
  t('teacher generates a code and a stranger joins with it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ title: 'CodeCourse', visibility: 'INVITE' }));
    await A.use('school').addLesson(r.key, { title: 'Secret L', text: 'hidden' });
    const { code } = await A.use('school').generateInvite(r.key);
    ok(code);
    B.setActor();
    const { courseId } = await B.use('school').joinByInvite(code);
    const c = await B.use('school').getCourseById(courseId, B.keypair.id);
    ok(c.students.includes(B.keypair.id));
    const lessons = await B.use('school').listLessons(courseId);
    eq(lessons[0].locked, false);
    eq(lessons[0].text, 'hidden');
  });

  t('a wrong code is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ visibility: 'INVITE' }));
    await A.use('school').generateInvite(r.key);
    B.setActor();
    let threw = false;
    try { await B.use('school').joinByInvite('deadbeef'); } catch (_) { threw = true; }
    ok(threw);
  });

  t('codes are only for invite courses', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course());
    let threw = false;
    try { await A.use('school').generateInvite(r.key); } catch (_) { threw = true; }
    ok(threw);
  });
});

describe('school: invite courses travel encrypted', (t) => {
  t('the teacher can still edit an encrypted course', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('school').createCourse(course({ title: 'SecretV1', visibility: 'INVITE' }));
    await A.use('school').updateCourse(r.key, { title: 'SecretV2' });
    const list = await A.use('school').listCourses('MINE', A.keypair.id, {});
    eq(list.length, 1);
    eq(list[0].title, 'SecretV2');
    eq(list[0].visibility, 'INVITE');
  });

  t('an invited student decrypts the course after the key grant', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ title: 'CipherCourse', visibility: 'INVITE' }));
    await A.use('school').inviteStudent(r.key, B.keypair.id);
    B.setActor();
    const list = await B.use('school').listCourses('ALL', B.keypair.id, {});
    const c = list.find(x => x.title === 'CipherCourse');
    ok(c);
    await B.use('school').enroll(c.id);
    const after = await B.use('school').getCourseById(c.id, B.keypair.id);
    ok(after.students.includes(B.keypair.id));
  });

  t('a stranger cannot decrypt an invite course at all', async () => {
    const net = makeNetwork(); const A = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('school').createCourse(course({ title: 'NoLeak', visibility: 'INVITE' }));
    C.setActor();
    const list = await C.use('school').listCourses('ALL', C.keypair.id, {});
    eq(list.length, 0);
    let threw = false;
    try { await C.use('school').getCourseById(r.key, C.keypair.id); } catch (_) { threw = true; }
    ok(threw);
  });
});
