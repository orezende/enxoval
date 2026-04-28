"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.newCid = newCid;
exports.nextCid = nextCid;
const node_crypto_1 = require("node:crypto");
function newCid() {
    return `${(0, node_crypto_1.randomUUID)().split('-')[0]}:0`;
}
function nextCid(cid) {
    const sep = cid.lastIndexOf(':');
    if (sep === -1)
        return `${cid}:1`;
    const base = cid.slice(0, sep);
    const counter = Number(cid.slice(sep + 1));
    return `${base}:${counter + 1}`;
}
//# sourceMappingURL=cid.js.map