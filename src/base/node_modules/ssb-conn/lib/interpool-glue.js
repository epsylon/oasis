"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.interpoolGlue = void 0;
const pull = require('pull-stream');
const stats = require('statistics');
const ping = require('pull-ping');
function interpoolGlue(db, hub, staging) {
    function setupPing(address, rpc) {
        const PING_TIMEOUT = 5 * 6e4;
        const pp = ping({ serve: true, timeout: PING_TIMEOUT }, () => { });
        db.update(address, { ping: { rtt: pp.rtt, skew: pp.skew } });
        pull(pp, rpc.gossip.ping({ timeout: PING_TIMEOUT }, (err) => {
            if ((err === null || err === void 0 ? void 0 : err.name) === 'TypeError') {
                db.update(address, (prev) => {
                    var _a;
                    return ({
                        ping: { ...((_a = prev.ping) !== null && _a !== void 0 ? _a : {}), fail: true },
                    });
                });
            }
        }), pp);
    }
    function onConnecting(ev) {
        const address = ev.address;
        const stagedData = staging.get(address);
        staging.unstage(address);
        for (const [addr, data] of staging.entries()) {
            if (data.key && data.key === ev.key)
                staging.unstage(addr);
        }
        db.update(address, { stateChange: Date.now() });
        const dbData = db.get(address);
        hub.update(address, { ...dbData, ...stagedData });
    }
    function onConnectingFailed(ev) {
        db.update(ev.address, (prev) => {
            var _a;
            return ({
                failure: ((_a = prev.failure) !== null && _a !== void 0 ? _a : 0) + 1,
                stateChange: Date.now(),
                duration: stats(prev.duration, 0),
            });
        });
    }
    function onConnected(ev) {
        const address = ev.address;
        const stagedData = staging.get(address);
        staging.unstage(address);
        for (const [addr, data] of staging.entries()) {
            if (data.key && data.key === ev.key)
                staging.unstage(addr);
        }
        db.update(address, { stateChange: Date.now(), failure: 0 });
        const dbData = db.get(address);
        hub.update(address, { ...dbData, ...stagedData });
        if (ev.details.isClient)
            setupPing(address, ev.details.rpc);
    }
    function onDisconnecting(ev) {
        db.update(ev.address, { stateChange: Date.now() });
    }
    function onDisconnectingFailed(ev) {
        db.update(ev.address, { stateChange: Date.now() });
    }
    function onDisconnected(ev) {
        db.update(ev.address, (prev) => ({
            stateChange: Date.now(),
            duration: stats(prev.duration, Date.now() - prev.stateChange),
        }));
    }
    pull(hub.listen(), pull.drain((ev) => {
        if (ev.type === 'connecting')
            onConnecting(ev);
        if (ev.type === 'connecting-failed')
            onConnectingFailed(ev);
        if (ev.type === 'connected')
            onConnected(ev);
        if (ev.type === 'disconnecting')
            onDisconnecting(ev);
        if (ev.type === 'disconnecting-failed')
            onDisconnectingFailed(ev);
        if (ev.type === 'disconnected')
            onDisconnected(ev);
    }));
}
exports.interpoolGlue = interpoolGlue;
