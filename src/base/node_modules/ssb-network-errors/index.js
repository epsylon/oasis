// SPDX-FileCopyrightText: 2021 Andre Staltz
//
// SPDX-License-Identifier: LGPL-3.0-only

const BENIGN_STREAM_END = {
  // stream closed okay, ssb-js variant
  'unexpected end of parent stream': true,

  // stream closed okay, go-ssb variant
  'muxrpc: session terminated': true,
};

const STREAM_ERRORS = {
  ...BENIGN_STREAM_END,
  'unexpected hangup': true, // stream closed probably okay
  'read EHOSTUNREACH': true,
  'read ECONNRESET': true,
  'read ENETDOWN': true,
  'read ETIMEDOUT': true,
  'write ECONNRESET': true,
  'write EPIPE': true,
  'stream is closed': true, // rpc method called after stream ended
  'parent stream is closing': true,
};

function detectSsbNetworkErrorSeverity(err) {
  if (!err) return null;
  if (err === true) return null;
  const msg = err.message;
  if (msg in STREAM_ERRORS) {
    if (msg in BENIGN_STREAM_END) {
      if (err instanceof Error) {
        return 0;
      } else {
        return 1;
      }
    } else {
      return 2;
    }
  } else {
    return 3;
  }
}

module.exports = detectSsbNetworkErrorSeverity;
