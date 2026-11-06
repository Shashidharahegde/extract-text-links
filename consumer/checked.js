import extractContent from "extract-text-links";

const { links } = extractContent("Go to www.example.com", { detailed: true });

/** @type {string[]} */
export const hrefs = links.map((link) => link.href);

/** @type {import("extract-text-links").ExtractOptions} */
export const options = { bareDomains: true, filter: (link) => link.host !== "example.com" };

// @ts-expect-error checkJs sees the declarations too
extractContent(42);
