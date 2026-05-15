const fs = require("fs");
const path = require("path");

const htmlPath = path.join(__dirname, "dist", "index.html");
let html = fs.readFileSync(htmlPath, "utf8");

const seoTags = `
  <meta name="description" content="Compare dish prices across 760+ restaurants in Beirut. Find the cheapest shawarma, burger, pizza and more." />
  <meta name="keywords" content="restaurant prices Beirut, cheap food Lebanon, shawarma price, burger price, menuze" />
  <meta property="og:title" content="Menuze — Compare Dish Prices in Beirut" />
  <meta property="og:description" content="Find the cheapest dishes across 760+ Beirut restaurants. Compare prices instantly." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://elienasr123.github.io/menuze/" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Menuze — Compare Dish Prices in Beirut" />
  <meta name="twitter:description" content="Find the cheapest dishes across 760+ Beirut restaurants." />
  <link rel="manifest" href="/menuze/manifest.json" />
  <meta name="theme-color" content="#FF4D00" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Menuze" />
`;

html = html.replace("<title>Menuze</title>", "<title>Menuze — Compare Dish Prices in Beirut</title>" + seoTags);
fs.writeFileSync(htmlPath, html);
console.log("SEO tags injected.");

// Create PWA manifest
const manifest = {
  name: "Menuze",
  short_name: "Menuze",
  description: "Compare dish prices across Beirut restaurants",
  start_url: "/menuze/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#FF4D00",
  icons: [
    { src: "/menuze/assets/icon.png", sizes: "192x192", type: "image/png" },
    { src: "/menuze/assets/icon.png", sizes: "512x512", type: "image/png" }
  ]
};
fs.writeFileSync(path.join(__dirname, "dist", "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("PWA manifest created.");
