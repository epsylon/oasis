"use strict";

const md = require("../server/node_modules/ssb-markdown");
const ssbMessages = require("../server/node_modules/ssb-msgs");
const ssbRef = require("../server/node_modules/ssb-ref");
const { span } = require("../server/node_modules/hyperaxe");

const toUrl = (mentions) => {
  const mentionNames = [];

  const handleLink = ({ name, link }) => {
    if (typeof name === "string") {
      const atName = name.charAt(0) === "@" ? name : `@${name}`;
      mentionNames.push({ name: atName, link });
    }
  };

  ssbMessages.links(mentions, "feed").forEach(handleLink);

  const urlHandler = (ref) => {
    const found = mentionNames.find(({ name }) => name === ref);
    if (found) return `/author/${encodeURIComponent(found.link)}`;

    if (ssbRef.isFeedId(ref)) return `/author/${encodeURIComponent(ref)}`;
    if (ssbRef.isMsgId(ref)) return `/thread/${encodeURIComponent(ref)}`;

    const splitIndex = ref.indexOf("?");
    const blobRef = splitIndex === -1 ? ref : ref.slice(0, splitIndex);

    if (ssbRef.isBlobId(blobRef)) return `/blob/${encodeURIComponent(blobRef)}`;
    if (ref && ref[0] === "#") return `/hashtag/${encodeURIComponent(ref.substr(1))}`;

    return "";
  };

  return urlHandler;
};

module.exports = (input, mentions = []) =>
  md.block(input, {
    toUrl: toUrl(mentions),
    emoji: (character) => span({ class: "emoji" }, character).outerHTML,
  });
