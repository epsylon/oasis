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
});
