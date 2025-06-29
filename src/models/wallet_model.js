const {
  RequestManager,
  HTTPTransport,
  Client } = require("../server/node_modules/@open-rpc/client-js");

module.exports = {
    client: async (url, user, pass) => {
      const transport = new HTTPTransport(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${user}:${pass}`)
        }
      });
      return new Client(new RequestManager([transport]));
    },
    execute: async (url, user, pass, method, params = []) => {
      try {
        const clientrpc = await module.exports.client(url, user, pass);
        return await clientrpc.request({ method, params });
      } catch (error) {
        throw new Error(
          "ECOin wallet disconnected. " +
          "Check your wallet settings or connection status."
        );
      }
    },
    getBalance: async (url, user, pass) => {
      return await module.exports.execute(url, user, pass, "getbalance");
    },
    getAddress: async (url, user, pass) => {
      const addresses = await module.exports.execute(url, user, pass, "getaddressesbyaccount", ['']);
      return addresses[0]  // TODO: Handle multiple addresses
    },
    listTransactions: async (url, user, pass) => {
      return await module.exports.execute(url, user, pass, "listtransactions", ["", 1000000, 0]);
    },
    sendToAddress: async (url, user, pass, address, amount) => {
      return await module.exports.execute(url, user, pass, "sendtoaddress", [address, amount]);
    },
    validateSend: async (url, user, pass, address, amount, fee) => {
      let isValid = false
      const errors = [];
      const addressValid = await module.exports.execute(url, user, pass, "validateaddress", [address]);
      const amountValid = amount > 0;
      const feeValid = fee > 0;
      if (!addressValid.isvalid) { errors.push("invalid_dest") }
      if (!amountValid) { errors.push("invalid_amount") }
      if (!feeValid) { errors.push("invalid_fee") }
      if (errors.length == 0) { isValid = true }
      return { isValid, errors }
    }
}
