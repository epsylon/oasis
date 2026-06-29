const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('shops: create + list + product + buy', (t) => {
  t('A creates a shop', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('shops').createShop('Alice Shop', 'short desc', 'long', null, 'https://shop.example', 'Madrid', ['retail'], 'OPEN', '');
    ok(r);
    const list = await A.use('shops').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(list.length >= 1);
    eq(list[0].title, 'Alice Shop');
  });

  t('A creates a product in own shop', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const shop = await A.use('shops').createShop('S', '', '', null, '', '', [], 'OPEN', '');
    const prod = await A.use('shops').createProduct(shop.key, 'Widget', 'desc', null, 10, 5, false);
    ok(prod);
    const list = await A.use('shops').listProducts(shop.key);
    ok(Array.isArray(list));
    ok(list.length >= 1);
  });

  t('A updates own shop', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const shop = await A.use('shops').createShop('Shop', '', '', null, '', '', [], 'OPEN', '');
    await A.use('shops').updateShopById(shop.key, { title: 'Shop V2' });
    const list = await A.use('shops').listAll({ filter: 'all', viewerId: A.keypair.id });
    const updated = list.find(s => s.title === 'Shop V2');
    ok(updated);
  });

  t('A deletes own shop', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const shop = await A.use('shops').createShop('Tmp', '', '', null, '', '', [], 'OPEN', '');
    await A.use('shops').deleteShopById(shop.key);
    const list = await A.use('shops').listAll({ filter: 'all', viewerId: A.keypair.id });
    const found = list.find(s => s.title === 'Tmp');
    ok(!found);
  });
});

describe('shops: encrypted purchase orders', (t) => {
  const setupShopWithProduct = async (net, A) => {
    A.setActor();
    const shop = await A.use('shops').createShop('Alice Shop', '', '', null, '', '', [], 'OPEN', '');
    const prod = await A.use('shops').createProduct(shop.key, 'Widget', 'd', null, 10, 5, false);
    return { shop, prod };
  };

  t('B creates encrypted order; A (owner) can decrypt and read delivery details', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const { shop, prod } = await setupShopWithProduct(net, A);
    B.setActor();
    await B.use('shops').createPurchaseOrder(prod.key, {
      deliveryAddress: '123 Main St',
      contact: 'b@example.com',
      notes: 'leave at door'
    });
    A.setActor();
    const orders = await A.use('shops').listShopOrders(shop.key);
    eq(orders.length, 1);
    eq(orders[0].deliveryAddress, '123 Main St');
    eq(orders[0].contact, 'b@example.com');
    eq(orders[0].notes, 'leave at door');
    eq(orders[0].buyer, B.keypair.id);
  });

  t('B (buyer) sees own order in listMyPurchases', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const { prod } = await setupShopWithProduct(net, A);
    B.setActor();
    await B.use('shops').createPurchaseOrder(prod.key, { deliveryAddress: '999 Side Rd' });
    const mine = await B.use('shops').listMyPurchases();
    eq(mine.length, 1);
    eq(mine[0].deliveryAddress, '999 Side Rd');
  });

  t('C (third party) cannot decrypt the order', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    const { shop, prod } = await setupShopWithProduct(net, A);
    B.setActor();
    await B.use('shops').createPurchaseOrder(prod.key, { deliveryAddress: 'SECRET ADDR' });
    C.setActor();
    let threw = false;
    try { await C.use('shops').listShopOrders(shop.key); } catch (_) { threw = true; }
    ok(threw, 'non-owner is rejected by listShopOrders');
    const cMine = await C.use('shops').listMyPurchases();
    eq(cMine.length, 0, 'C sees no purchases of their own');
  });

  t('seller cannot create order on own product', async () => {
    const net = makeNetwork(); const A = makePeer(net);
    const { prod } = await setupShopWithProduct(net, A);
    let threw = false;
    try { await A.use('shops').createPurchaseOrder(prod.key, { deliveryAddress: 'X' }); } catch (_) { threw = true; }
    ok(threw);
  });

  t('listShopOrders filters by shopId (orders for other shop excluded)', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const shop1 = await A.use('shops').createShop('Shop1', '', '', null, '', '', [], 'OPEN', '');
    const shop2 = await A.use('shops').createShop('Shop2', '', '', null, '', '', [], 'OPEN', '');
    const prod1 = await A.use('shops').createProduct(shop1.key, 'P1', '', null, 10, 5, false);
    const prod2 = await A.use('shops').createProduct(shop2.key, 'P2', '', null, 10, 5, false);
    B.setActor();
    await B.use('shops').createPurchaseOrder(prod1.key, { deliveryAddress: 'addr1' });
    await B.use('shops').createPurchaseOrder(prod2.key, { deliveryAddress: 'addr2' });
    A.setActor();
    const ord1 = await A.use('shops').listShopOrders(shop1.key);
    eq(ord1.length, 1);
    eq(ord1[0].deliveryAddress, 'addr1');
    const ord2 = await A.use('shops').listShopOrders(shop2.key);
    eq(ord2.length, 1);
    eq(ord2[0].deliveryAddress, 'addr2');
  });

  t('order defaults to PENDING; owner accepts; both sides see ACCEPTED', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const { shop, prod } = await setupShopWithProduct(net, A);
    B.setActor();
    const order = await B.use('shops').createPurchaseOrder(prod.key, { deliveryAddress: '1 St' });
    A.setActor();
    let orders = await A.use('shops').listShopOrders(shop.key);
    eq(orders[0].status, 'PENDING');
    eq(await A.use('shops').countPendingOrders(shop.key), 1);
    await A.use('shops').setOrderStatus(order.key, 'ACCEPTED');
    orders = await A.use('shops').listShopOrders(shop.key);
    eq(orders[0].status, 'ACCEPTED');
    eq(await A.use('shops').countPendingOrders(shop.key), 0);
    B.setActor();
    const mine = await B.use('shops').listMyPurchases();
    eq(mine[0].status, 'ACCEPTED');
  });

  t('a non-owner cannot set an order status', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    const { prod } = await setupShopWithProduct(net, A);
    B.setActor();
    const order = await B.use('shops').createPurchaseOrder(prod.key, { deliveryAddress: '1 St' });
    C.setActor();
    let threw = false;
    try { await C.use('shops').setOrderStatus(order.key, 'ACCEPTED'); } catch (_) { threw = true; }
    ok(threw, 'only the shop owner can change an order status');
    B.setActor();
    let threwBuyer = false;
    try { await B.use('shops').setOrderStatus(order.key, 'ACCEPTED'); } catch (_) { threwBuyer = true; }
    ok(threwBuyer, 'the buyer cannot change the order status either');
  });

  t('invalid order status is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const { prod } = await setupShopWithProduct(net, A);
    B.setActor();
    const order = await B.use('shops').createPurchaseOrder(prod.key, { deliveryAddress: '1 St' });
    A.setActor();
    let threw = false;
    try { await A.use('shops').setOrderStatus(order.key, 'BOGUS'); } catch (_) { threw = true; }
    ok(threw);
  });

  t('full lifecycle: seller accept→paid→shipped, buyer confirms received; roles enforced', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const { shop, prod } = await setupShopWithProduct(net, A);
    B.setActor();
    const order = await B.use('shops').createPurchaseOrder(prod.key, { deliveryAddress: '1 St' });
    A.setActor();
    await A.use('shops').setOrderStatus(order.key, 'ACCEPTED');
    await A.use('shops').setOrderStatus(order.key, 'PAID');
    await A.use('shops').setOrderStatus(order.key, 'SHIPPED');
    let sellerCantReceive = false;
    try { await A.use('shops').setOrderStatus(order.key, 'RECEIVED'); } catch (_) { sellerCantReceive = true; }
    ok(sellerCantReceive, 'seller cannot confirm item received (buyer-only)');
    B.setActor();
    let buyerCantPay = false;
    try { await B.use('shops').setOrderStatus(order.key, 'PAID'); } catch (_) { buyerCantPay = true; }
    ok(buyerCantPay, 'buyer cannot set seller statuses');
    await B.use('shops').setOrderStatus(order.key, 'RECEIVED');
    const mine = await B.use('shops').listMyPurchases();
    eq(mine[0].status, 'RECEIVED');
    eq(mine[0].seller, A.keypair.id);
    A.setActor();
    const orders = await A.use('shops').listShopOrders(shop.key);
    eq(orders[0].status, 'RECEIVED');
  });

  t('product rating requires a RECEIVED order (rate only after confirming receipt)', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const { shop, prod } = await setupShopWithProduct(net, A);
    B.setActor();
    const order = await B.use('shops').createPurchaseOrder(prod.key, { deliveryAddress: '1 St' });
    let early = false;
    try { await B.use('shops').createOpinion(prod.key, 'interesting'); } catch (_) { early = true; }
    ok(early, 'cannot rate before receiving the item');
    A.setActor();
    await A.use('shops').setOrderStatus(order.key, 'ACCEPTED');
    await A.use('shops').setOrderStatus(order.key, 'PAID');
    await A.use('shops').setOrderStatus(order.key, 'SHIPPED');
    B.setActor();
    await B.use('shops').setOrderStatus(order.key, 'RECEIVED');
    await B.use('shops').createOpinion(prod.key, 'interesting');
    const prods = await B.use('shops').listProducts(shop.key);
    const p = prods.find(x => x.title === 'Widget') || prods[0];
    eq((p.opinions || {}).interesting, 1);
  });
});

describe('shops: E2E private (CLOSED) + invite', (t) => {
  t('CLOSED shop is encrypted, visible to owner, hidden from non-members', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const shop = await A.use('shops').createShop('Secret Shop', 's', 'd', null, '', '', ['x'], 'CLOSED', '');
    const aList = await A.use('shops').listAll({ filter: 'all', viewerId: A.keypair.id });
    const aShop = aList.find(s => s.rootId === shop.key);
    ok(aShop, 'owner sees own closed shop');
    eq(aShop.title, 'Secret Shop');
    ok(aShop.encrypted, 'closed shop is E2E encrypted');
    B.setActor();
    const bList = await B.use('shops').listAll({ filter: 'all', viewerId: B.keypair.id });
    ok(!bList.find(s => s.rootId === shop.key), 'non-member cannot see the closed shop');
  });

  t('invite code unlocks the shop and its products for a member', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const shop = await A.use('shops').createShop('Priv', 's', 'd', null, '', '', [], 'CLOSED', '');
    await A.use('shops').createProduct(shop.key, 'Gizmo', 'desc', null, 7, 3, false);
    const { code } = await A.use('shops').generateInvite(shop.key);
    ok(code, 'got an invite code');
    B.setActor();
    const before = await B.use('shops').listAll({ filter: 'all', viewerId: B.keypair.id });
    ok(!before.find(s => s.rootId === shop.key), 'hidden before joining');
    const prodBefore = await B.use('shops').listProducts(shop.key);
    eq(prodBefore.length, 0, 'encrypted products not exposed before joining');
    await B.use('shops').joinByCode(code);
    const after = await B.use('shops').listAll({ filter: 'all', viewerId: B.keypair.id });
    const seen = after.find(s => s.rootId === shop.key);
    ok(seen, 'member sees the shop after joining');
    eq(seen.title, 'Priv');
    const prodAfter = await B.use('shops').listProducts(shop.key);
    ok(prodAfter.find(p => p.title === 'Gizmo'), 'member reads products after joining');
  });

  t('generateInvite rejects public shops; invalid code rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const open = await A.use('shops').createShop('Open', '', '', null, '', '', [], 'OPEN', '');
    let threw = false;
    try { await A.use('shops').generateInvite(open.key); } catch (_) { threw = true; }
    ok(threw, 'cannot generate invite for a public shop');
    B.setActor();
    let bad = false;
    try { await B.use('shops').joinByCode('deadbeefdeadbeef'); } catch (_) { bad = true; }
    ok(bad, 'invalid invite code rejected');
  });

  t('OPEN shops stay visible to everyone (back-compat)', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const shop = await A.use('shops').createShop('PublicShop', '', '', null, '', '', [], 'OPEN', '');
    ok(!(await A.use('shops').getShopById(shop.key)).encrypted, 'open shop is not encrypted');
    B.setActor();
    const bList = await B.use('shops').listAll({ filter: 'all', viewerId: B.keypair.id });
    ok(bList.find(s => s.rootId === shop.key), 'public shop visible to non-owner');
  });

  t('a member can buy from a private shop after joining', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const shop = await A.use('shops').createShop('PShop', '', '', null, '', '', [], 'CLOSED', '');
    const prod = await A.use('shops').createProduct(shop.key, 'Item', '', null, 5, 2, false);
    const { code } = await A.use('shops').generateInvite(shop.key);
    B.setActor();
    await B.use('shops').joinByCode(code);
    const order = await B.use('shops').createPurchaseOrder(prod.key, { deliveryAddress: 'addr' });
    ok(order, 'member created an order');
    A.setActor();
    const orders = await A.use('shops').listShopOrders(shop.key);
    eq(orders.length, 1);
    eq(orders[0].title, 'Item', 'seller reads decrypted product title in the order');
  });
});

describe('shops: reversible open/close (E2E migration)', (t) => {
  t('open a public shop -> close: shop + products get encrypted; reopen -> cleartext again', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const shop = await A.use('shops').createShop('Flip', '', '', null, '', '', [], 'OPEN', '');
    await A.use('shops').createProduct(shop.key, 'Widget', 'd', null, 9, 4, false);
    ok(!(await A.use('shops').getShopById(shop.key)).encrypted, 'starts public/cleartext');
    // non-member sees it while public
    B.setActor();
    ok((await B.use('shops').listAll({ filter: 'all', viewerId: B.keypair.id })).find(s => s.rootId === shop.key), 'visible while public');
    // close -> encrypts
    A.setActor();
    await A.use('shops').setShopVisibility(shop.key, 'CLOSED');
    const closed = await A.use('shops').getShopById(shop.key);
    ok(closed.encrypted, 'now E2E encrypted');
    eq(closed.title, 'Flip', 'owner still reads it');
    const prodClosed = await A.use('shops').listProducts(shop.key);
    ok(prodClosed.find(p => p.title === 'Widget'), 'owner reads products after close');
    // non-member no longer sees it
    B.setActor();
    ok(!(await B.use('shops').listAll({ filter: 'all', viewerId: B.keypair.id })).find(s => s.rootId === shop.key), 'hidden after close');
    eq((await B.use('shops').listProducts(shop.key)).length, 0, 'products hidden after close');
    // reopen -> cleartext, visible again
    A.setActor();
    await A.use('shops').setShopVisibility(shop.key, 'OPEN');
    ok(!(await A.use('shops').getShopById(shop.key)).encrypted, 'cleartext again after reopen');
    B.setActor();
    const seen = (await B.use('shops').listAll({ filter: 'all', viewerId: B.keypair.id })).find(s => s.rootId === shop.key);
    ok(seen, 'visible again after reopen');
    eq(seen.title, 'Flip');
    ok((await B.use('shops').listProducts(shop.key)).find(p => p.title === 'Widget'), 'products readable again after reopen');
  });

  t('closing rotates the key: an old invite code no longer works after reopen+reclose', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const shop = await A.use('shops').createShop('Rot', '', '', null, '', '', [], 'CLOSED', '');
    const first = await A.use('shops').generateInvite(shop.key);
    // open then close again -> new key minted
    await A.use('shops').setShopVisibility(shop.key, 'OPEN');
    await A.use('shops').setShopVisibility(shop.key, 'CLOSED');
    // B redeems the OLD code: it resolves a key, but it's the stale one -> cannot read current content
    B.setActor();
    await B.use('shops').joinByCode(first.code).catch(() => {});
    const seen = (await B.use('shops').listAll({ filter: 'all', viewerId: B.keypair.id })).find(s => s.rootId === shop.key);
    ok(!seen, 'old code does not grant access to re-keyed shop');
    // a fresh code works
    A.setActor();
    const fresh = await A.use('shops').generateInvite(shop.key);
    B.setActor();
    await B.use('shops').joinByCode(fresh.code);
    ok((await B.use('shops').listAll({ filter: 'all', viewerId: B.keypair.id })).find(s => s.rootId === shop.key), 'fresh code grants access');
  });

  t('repeated open/close/open/close keeps a single consistent shop', async () => {
    const net = makeNetwork(); const A = makePeer(net);
    A.setActor();
    const shop = await A.use('shops').createShop('Cyc', '', '', null, '', '', [], 'OPEN', '');
    await A.use('shops').createProduct(shop.key, 'P', '', null, 3, 1, false);
    for (const v of ['CLOSED', 'OPEN', 'CLOSED', 'OPEN']) {
      await A.use('shops').setShopVisibility(shop.key, v);
    }
    const list = await A.use('shops').listAll({ filter: 'all', viewerId: A.keypair.id });
    const found = list.filter(s => s.rootId === shop.key);
    eq(found.length, 1, 'exactly one live shop after cycling');
    eq(found[0].title, 'Cyc');
    ok(!found[0].encrypted, 'ends public after final OPEN');
    const prods = await A.use('shops').listProducts(shop.key);
    eq(prods.length, 1, 'single live product after cycling');
    eq(prods[0].title, 'P');
  });
});

describe('shops: My Orders end-to-end (seller creates shop+item, buyer buys)', (t) => {
  t('buyer sees the purchase in My Orders with full details and live status', async () => {
    const net = makeNetwork(); const seller = makePeer(net); const buyer = makePeer(net);

    // 1) Seller creates a shop and uploads an item
    seller.setActor();
    const shop = await seller.use('shops').createShop('Seller Shop', 'we sell stuff', 'long desc', null, 'https://shop', 'Madrid', ['retail'], 'OPEN', '');
    const product = await seller.use('shops').createProduct(shop.key, 'Cool Widget', 'a cool widget', null, 12.5, 3, false);

    // 2) Buyer places an order (this is what feeds "My Orders")
    buyer.setActor();
    const order = await buyer.use('shops').createPurchaseOrder(product.key, {
      deliveryAddress: '42 Buyer St', contact: 'buyer@mail', notes: 'ring twice'
    });
    ok(order, 'order created');

    // 3) My Orders (buyer) shows it with all details; starts PENDING
    const myOrders = await buyer.use('shops').listMyPurchases();
    eq(myOrders.length, 1, 'buyer has exactly one order in My Orders');
    const mine = myOrders[0];
    eq(mine.title, 'Cool Widget');
    eq(String(mine.price), '12.500000');
    eq(mine.seller, seller.keypair.id, 'seller resolved in My Orders');
    eq(mine.deliveryAddress, '42 Buyer St');
    eq(mine.contact, 'buyer@mail');
    eq(mine.notes, 'ring twice');
    eq(mine.status, 'PENDING', 'starts PENDING');

    // 4) Seller's Orders view shows the incoming order + pending badge
    seller.setActor();
    const received = await seller.use('shops').listShopOrders(shop.key);
    eq(received.length, 1);
    eq(received[0].buyer, buyer.keypair.id);
    eq(received[0].deliveryAddress, '42 Buyer St');
    eq(await seller.use('shops').countPendingOrders(shop.key), 1, 'one pending order');

    // 5) Seller accepts -> buyer's My Orders reflects ACCEPTED
    await seller.use('shops').setOrderStatus(order.key, 'ACCEPTED');
    buyer.setActor();
    eq((await buyer.use('shops').listMyPurchases())[0].status, 'ACCEPTED');

    // 6) Seller: payment received -> shipped
    seller.setActor();
    await seller.use('shops').setOrderStatus(order.key, 'PAID');
    await seller.use('shops').setOrderStatus(order.key, 'SHIPPED');
    buyer.setActor();
    eq((await buyer.use('shops').listMyPurchases())[0].status, 'SHIPPED');

    // 7) Buyer confirms received (the button shown on My Orders) -> RECEIVED
    await buyer.use('shops').setOrderStatus(order.key, 'RECEIVED');
    eq((await buyer.use('shops').listMyPurchases())[0].status, 'RECEIVED');
    seller.setActor();
    eq((await seller.use('shops').listShopOrders(shop.key))[0].status, 'RECEIVED');
    eq(await seller.use('shops').countPendingOrders(shop.key), 0, 'no longer pending');
  });

  t('an unrelated inhabitant sees nothing in their own My Orders', async () => {
    const net = makeNetwork(); const seller = makePeer(net); const buyer = makePeer(net); const other = makePeer(net);
    seller.setActor();
    const shop = await seller.use('shops').createShop('S', '', '', null, '', '', [], 'OPEN', '');
    const product = await seller.use('shops').createProduct(shop.key, 'Item', '', null, 5, 1, false);
    buyer.setActor();
    await buyer.use('shops').createPurchaseOrder(product.key, { deliveryAddress: 'secret addr' });
    other.setActor();
    eq((await other.use('shops').listMyPurchases()).length, 0, 'unrelated user has no orders in My Orders');
  });
});
