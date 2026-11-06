import api = require("extract-text-links");

export const links: string[] = api.extractContent("a https://b.com").links;
export const viaDefault: string[] = api.default("a https://b.com").links;
