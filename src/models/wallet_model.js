const {
    RequestManager,
    HTTPTransport,
    Client
} = require("../server/node_modules/@open-rpc/client-js");

async function makeClient(url, user, pass) {
    const headers = {};
    if (user !== undefined || pass !== undefined) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${user || ''}:${pass || ''}`).toString('base64');
    }
    const transport = new HTTPTransport(url, { headers });
    return new Client(new RequestManager([transport]));
}

module.exports = {
    client: async (url, user, pass) => {
        return makeClient(url, user, pass);
    },
    execute: async (url, user, pass, method, params = []) => {
        try {
            const clientrpc = await makeClient(url, user, pass);
            return await clientrpc.request({ method, params });
        } catch (error) {
            throw new Error("ECOin wallet disconnected. Check your wallet settings or connection status.");
        }
    },
    getBalance: async (url, user, pass) => {
        return Number(await module.exports.execute(url, user, pass, "getbalance")) || 0;
    },
    getAddress: async (url, user, pass) => {
        try {
            const addrs = await module.exports.execute(url, user, pass, "getaddressesbyaccount", [""]);
            if (Array.isArray(addrs) && addrs.length > 0) return addrs[0];
        } catch {}
        try {
            const addr = await module.exports.execute(url, user, pass, "getnewaddress", [""]);
            if (typeof addr === "string" && addr) return addr;
        } catch {}
        return "";
    },
    listTransactions: async (url, user, pass) => {
        return await module.exports.execute(url, user, pass, "listtransactions", ["", 1000000, 0]);
    },
    sendToAddress: async (url, user, pass, address, amount) => {
        return await module.exports.execute(url, user, pass, "sendtoaddress", [address, Number(amount)]);
    },
    validateSend: async (url, user, pass, address, amount, fee) => {
        let isValid = false;
        const errors = [];
        const addrInfo = await module.exports.execute(url, user, pass, "validateaddress", [address]);
        const addressValid = !!addrInfo?.isvalid;
        const amountValid = Number(amount) > 0;
        const feeValid = Number(fee) >= 0;
        if (!addressValid) errors.push("invalid_dest");
        if (!amountValid) errors.push("invalid_amount");
        if (!feeValid) errors.push("invalid_fee");
        if (errors.length === 0) isValid = true;
        return { isValid, errors };
    }
};
