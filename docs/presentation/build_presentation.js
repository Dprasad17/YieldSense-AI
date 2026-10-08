// YieldSense AI final presentation (Milestones 1-4). node build.js <repo> <out.pptx>
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");
const { applyTheme } = require(process.env.PPTX_SKILL + "/scripts/apply_theme.js");

const REPO = process.argv[2];
const OUT = process.argv[3];
const shot = (n) => path.join(REPO, "docs", "screenshots", n);

const THEME = {
  name: "YieldSense Field",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "14231A", // deep field green-black (text on light)
    lt1: "FFFFFF",
    dk2: "1F4D33", // forest
    lt2: "EEF4EF", // pale leaf
    accent1: "1F7A4D", // crop green (primary)
    accent2: "E8A33A", // harvest amber
    accent3: "3B7DD8", // water blue
    accent4: "B07A4F", // soil brown
    accent5: "7FBF8F", // young leaf
    accent6: "C2410C", // risk red-orange
    hlink: "1F7A4D",
    folHlink: "1F4D33",
  },
};
const HEX = THEME.colors;

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
  pres.title = "YieldSense AI — Final presentation";
  pres.author = "Durga Prasad A";
  pres.subject = "Crop yield prediction and agricultural productivity intelligence";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  // ---------- layouts
  pres.defineSlideMaster({
    title: "Cover",
    background: { color: HEX.dk1 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 1.55, w: 8.8, h: 1.3, fontSize: 40, bold: true, color: C.background1, valign: "bottom", align: "left", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.6, y: 3.0, w: 8.8, h: 0.9, fontSize: 18, color: C.accent5, valign: "top", margin: 0 }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "Divider",
    background: { color: HEX.dk2 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 2.0, w: 8.8, h: 1.0, fontSize: 36, bold: true, color: C.background1, align: "left", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.6, y: 3.05, w: 8.8, h: 0.8, fontSize: 16, color: C.accent5, valign: "top", margin: 0 }, text: "" } },
    ],
    slideNumber: { x: 9.2, y: 5.2, w: 0.5, h: 0.3, fontSize: 10, color: C.accent5 },
  });
  pres.defineSlideMaster({
    title: "Content",
    background: { color: HEX.lt1 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.3, w: 9.0, h: 0.7, fontSize: 28, bold: true, color: C.text1, valign: "middle", align: "left", margin: 0 }, text: "" } },
      { text: { text: "YieldSense AI · Final presentation", options: { x: 0.5, y: 5.2, w: 5, h: 0.3, fontSize: 10, color: C.accent1, margin: 0 } } },
    ],
    slideNumber: { x: 9.2, y: 5.2, w: 0.5, h: 0.3, fontSize: 10, color: C.accent1, align: "right" },
  });

  const ic = {
    seed: await icon(fa.FaSeedling, HEX.lt1),
    cloud: await icon(fa.FaCloudSunRain, HEX.lt1),
    layer: await icon(fa.FaLayerGroup, HEX.lt1),
    chart: await icon(fa.FaChartLine, HEX.lt1),
    bulb: await icon(fa.FaLightbulb, HEX.lt1),
    shield: await icon(fa.FaShieldAlt, HEX.lt1),
    users: await icon(fa.FaUsers, HEX.lt1),
    db: await icon(fa.FaDatabase, HEX.lt1),
    check: await icon(fa.FaCheck, HEX.lt1),
    warn: await icon(fa.FaExclamationTriangle, HEX.lt1),
    box: await icon(fa.FaDocker, HEX.lt1),
    gh: await icon(fa.FaGithub, HEX.lt1),
    server: await icon(fa.FaServer, HEX.lt1),
    vial: await icon(fa.FaVial, HEX.lt1),
    rocket: await icon(fa.FaRocket, HEX.lt1),
    tractor: await icon(fa.FaTractor, HEX.lt1),
  };
  // icon in a coloured circle: the deck's one visual motif
  const dot = (slide, img, x, y, color, d = 0.5, name = "icon") => {
    slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color }, line: { color, width: 0 }, objectName: name + " circle" });
    const p = d * 0.22;
    slide.addImage({ data: img, x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, objectName: name });
  };
  const card = (slide, x, y, w, h, name) =>
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y, w, h, rectRadius: 0.08, fill: { color: C.background2 }, line: { color: C.background2, width: 0 }, objectName: name,
    });
  const text = (slide, t, o) => slide.addText(t, { isTextBox: true, margin: 0, fontFace: undefined, ...o });

  // ===================================================== 1. Cover
  pres.addSection({ title: "Introduction" });
  let s = pres.addSlide({ masterName: "Cover", sectionTitle: "Introduction" });
  s.addText("YieldSense AI", { placeholder: "title" });
  s.addText("Crop yield prediction and agricultural productivity intelligence", { placeholder: "body" });
  dot(s, ic.seed, 0.6, 0.6, C.accent1, 0.75, "logo");
  text(s, "Durga Prasad A  ·  Infosys Springboard  ·  Milestones 1–4", { x: 0.6, y: 4.55, w: 8.8, h: 0.35, fontSize: 14, color: C.background2 });
  s.addNotes("Introduce yourself and the project. YieldSense AI estimates crop yields and turns weather, soil and risk data into recommendations. This presentation covers all four milestones: data and setup, the yield model, the platform, and testing and deployment. Then a short live demo.");

  // ===================================================== 2. Problem
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Introduction" });
  s.addText("Farm decisions come before the harvest", { placeholder: "title" });
  const problems = [
    [ic.chart, C.accent1, "Uncertain yields", "Planting, inputs and sales are planned months before anyone knows the harvest."],
    [ic.cloud, C.accent3, "Weather and soil vary", "Rainfall, temperature and soil quality differ by place and year."],
    [ic.warn, C.accent6, "Risk is spread thin", "Drought, heat and pests hit some regions far harder than others."],
  ];
  problems.forEach(([img, col, head, body], i) => {
    const x = 0.5 + i * 3.05;
    card(s, x, 1.35, 2.85, 2.6, "problem card " + (i + 1));
    dot(s, img, x + 0.25, 1.6, col, 0.6, "problem icon " + (i + 1));
    text(s, head, { x: x + 0.25, y: 2.35, w: 2.4, h: 0.4, fontSize: 17, bold: true, color: C.text1 });
    text(s, body, { x: x + 0.25, y: 2.8, w: 2.4, h: 1.0, fontSize: 14, color: C.text1, valign: "top" });
  });
  text(s, [
    { text: "Goal: ", options: { bold: true, color: C.accent1 } },
    { text: "estimate yield from historical, weather and soil data, and turn it into clear, honest advice for farmers, agronomists and administrators." },
  ], { x: 0.5, y: 4.25, w: 9, h: 0.6, fontSize: 15, color: C.text1 });
  s.addNotes("The problem: farmers and organisations commit money long before the harvest. Yields depend on weather, soil and pests, which vary by region and year. The goal of YieldSense is to estimate yields from data and turn the estimate into practical, honest advice.");

  // ===================================================== 3. Solution at a glance
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Introduction" });
  s.addText("Every module in the specification, working", { placeholder: "title" });
  const mods = [
    [ic.users, "User management", "Sign-in, three roles, profiles, farms"],
    [ic.db, "Data collection", "CSV/Excel import, soil tests, records"],
    [ic.chart, "Yield prediction", "XGBoost with a P10–P90 range"],
    [ic.cloud, "Weather analysis", "Live forecast, ERA5 climate trend"],
    [ic.layer, "Soil analysis", "SoilGrids soil, nutrient ratings"],
    [ic.tractor, "Analytics", "Trends, farm comparison, reports"],
    [ic.bulb, "Recommendations", "Rules, model impact, AI rationale"],
    [ic.shield, "Risk assessment", "Matrix, timeline, anomalies"],
  ];
  mods.forEach(([img, head, body], i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = 0.5 + col * 2.28, y = 1.3 + row * 1.85;
    card(s, x, y, 2.1, 1.65, "module card " + (i + 1));
    dot(s, img, x + 0.2, y + 0.2, C.accent1, 0.5, "module icon " + (i + 1));
    text(s, head, { x: x + 0.2, y: y + 0.8, w: 1.75, h: 0.35, fontSize: 15, bold: true, color: C.text1 });
    text(s, body, { x: x + 0.2, y: y + 1.13, w: 1.8, h: 0.45, fontSize: 11, color: C.text1, valign: "top" });
  });
  s.addNotes("The specification asks for seven modules; risk assessment is split out as its own screen, so there are eight areas. All of them are implemented and work on real data, with the caveats I will cover later.");

  // ===================================================== 4. Architecture
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Introduction" });
  s.addText("Architecture", { placeholder: "title" });
  const box = (x, y, w, h, head, sub, fill, name) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: name });
    text(s, [{ text: head, options: { bold: true, fontSize: 14, breakLine: true } }, { text: sub, options: { fontSize: 11 } }], {
      x: x + 0.12, y: y + 0.08, w: w - 0.24, h: h - 0.16, color: C.background1, valign: "middle", align: "center",
    });
  };
  const arrow = (x1, y1, x2, y2, name) => s.addShape(pres.shapes.LINE, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color: C.text2, width: 1.5, endArrowType: "triangle" }, objectName: name });
  box(0.5, 2.0, 1.9, 1.2, "Browser", "React 19 · TypeScript", C.accent3, "browser box");
  box(2.9, 2.0, 1.7, 1.2, "Nginx", "web app + /api proxy", C.text2, "nginx box");
  box(5.1, 1.45, 2.1, 2.3, "FastAPI", "auth · prediction · farms · risk · weather · soil · reports", C.accent1, "api box");
  box(7.7, 1.25, 1.8, 0.8, "PostgreSQL", "users · farms · records", C.accent4, "postgres box");
  box(7.7, 2.2, 1.8, 0.8, "MongoDB", "uploads · caches", C.accent4, "mongo box");
  box(7.7, 3.15, 1.8, 0.8, "XGBoost v2.1", "model.pkl", C.accent2, "model box");
  arrow(2.4, 2.6, 2.9, 2.6, "arrow browser nginx");
  arrow(4.6, 2.6, 5.1, 2.6, "arrow nginx api");
  arrow(7.2, 1.65, 7.7, 1.65, "arrow api postgres");
  arrow(7.2, 2.6, 7.7, 2.6, "arrow api mongo");
  arrow(7.2, 3.55, 7.7, 3.55, "arrow api model");
  text(s, "External data: Open-Meteo (forecast, ERA5 climate) · ISRIC SoilGrids (soil) · Groq LLM (optional text)", { x: 0.5, y: 4.15, w: 9, h: 0.35, fontSize: 13, color: C.text1 });
  text(s, "Every service runs in Docker; one Compose file starts the whole stack.", { x: 0.5, y: 4.55, w: 9, h: 0.35, fontSize: 13, italic: true, color: C.accent1 });
  s.addNotes("The browser talks to Nginx, which serves the React app and forwards API calls to FastAPI. PostgreSQL holds relational data such as users, farms and predictions; MongoDB holds raw uploads and caches for the external services. The model is a serialised XGBoost pipeline. External data comes from Open-Meteo, SoilGrids and, optionally, Groq for plain-language text.");

  // ===================================================== 5. Data honesty
  pres.addSection({ title: "Data and model" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Data and model" });
  s.addText("Know which data is real", { placeholder: "title" });
  const prov = [
    [C.accent1, "Real", "Region · crop · year · yield · rainfall · temperature · pesticides", "28,242 FAOSTAT rows, 101 countries, 10 crops, 1990–2013"],
    [C.accent2, "Synthetic", "Soil pH · moisture · humidity · sunlight · irrigation · fertilizer · disease · crop duration", "Generated to fill the schema: never used by the model"],
    [C.accent6, "Derived", "NDVI", "Computed from the yield itself: removed (target leakage)"],
  ];
  prov.forEach(([col, tag, cols, note], i) => {
    const y = 1.25 + i * 1.12;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y, w: 1.5, h: 0.9, rectRadius: 0.08, fill: { color: col }, line: { color: col, width: 0 }, objectName: tag + " tag" });
    text(s, tag, { x: 0.5, y, w: 1.5, h: 0.9, fontSize: 16, bold: true, color: C.background1, align: "center", valign: "middle" });
    text(s, [{ text: cols, options: { bold: true, breakLine: true } }, { text: note }], { x: 2.2, y, w: 7.3, h: 0.9, fontSize: 14, color: C.text1, valign: "middle" });
  });
  text(s, "Every column carries an R / S / D badge in the app, and the model card lists what was excluded and why.", { x: 0.5, y: 4.6, w: 9, h: 0.4, fontSize: 13, italic: true, color: C.accent1 });
  s.addNotes("An early finding: the first model scored very well because NDVI had been generated from the yield itself. That is target leakage. I audited every column: only seven are real. The synthetic ones are kept for the reference view but never feed the model, and the app labels each column as real, synthetic or derived.");

  // ===================================================== 6. Model evaluation chart
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Data and model" });
  s.addText("Six model families, tested on unseen years", { placeholder: "title" });
  s.addChart(pres.charts.BAR, [{ name: "RMSE (kg/ha)", labels: ["Keras MLP", "XGBoost", "Random Forest", "LightGBM", "Linear", "Ridge"], values: [2042, 2065, 2079, 2198, 4959, 4960] }], {
    x: 0.5, y: 1.2, w: 5.6, h: 3.8, barDir: "bar", objectName: "temporal RMSE chart",
    chartColors: [HEX.accent1, HEX.accent2, HEX.accent1, HEX.accent1, HEX.accent5, HEX.accent5], invertedColors: [HEX.accent1],
    showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 11, dataLabelColor: HEX.dk1, dataLabelFormatCode: "#,##0", dataLabelFontFace: "+mn-lt",
    catAxisLabelColor: HEX.dk1, valAxisLabelColor: HEX.dk1, catAxisLabelFontSize: 12, valAxisLabelFontSize: 10, catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt",
    valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" }, catAxisOrientation: "maxMin",
    showLegend: false, showTitle: true, title: "Error on 2009–2013 (RMSE, kg/ha, lower is better)", titleFontSize: 13, titleColor: HEX.dk1, titleFontFace: "+mn-lt",
  });
  text(s, [
    { text: "Temporal split", options: { bold: true, breakLine: true } },
    { text: "Train on 1990–2008, test on 2009–2013: like forecasting a future season.", options: { breakLine: true } },
    { text: " ", options: { breakLine: true, fontSize: 6 } },
    { text: "Selection rule", options: { bold: true, breakLine: true } },
    { text: "Lowest error; within 1% counts as a tie and the faster model wins. XGBoost is served; the Keras MLP would add TensorFlow to the API." },
  ], { x: 6.4, y: 1.35, w: 3.1, h: 3.5, fontSize: 13, color: C.text1, valign: "top" });
  s.addNotes("Six model families were trained on raw and log-transformed yields and evaluated on three splits. The main one is temporal: train up to 2008 and test on 2009 to 2013, years the model never saw. Linear models are far behind. The top four are close; the Keras MLP is 1% better than XGBoost, but by the selection rule the faster model wins, and XGBoost keeps TensorFlow out of the API.");

  // ===================================================== 7. Model results stats
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Data and model" });
  s.addText("The served model: XGBoost v2.1", { placeholder: "title" });
  const stats = [
    ["0.953", "R² on unseen years", C.accent1],
    ["2,065", "RMSE, kg/ha", C.accent1],
    ["74.5%", "of yields inside P10–P90 (target 80%)", C.accent2],
    ["16 ms", "p95 single prediction", C.accent3],
  ];
  stats.forEach(([big, label, col], i) => {
    const x = 0.5 + i * 2.28;
    card(s, x, 1.3, 2.1, 1.75, "stat card " + (i + 1));
    text(s, big, { x: x + 0.15, y: 1.45, w: 1.8, h: 0.8, fontSize: 34, bold: true, color: col, align: "center", valign: "middle" });
    text(s, label, { x: x + 0.15, y: 2.3, w: 1.8, h: 0.65, fontSize: 12, color: C.text1, align: "center", valign: "top" });
  });
  text(s, [
    { text: "Six real inputs: ", options: { bold: true } },
    { text: "crop, region, year, rainfall, temperature, pesticides.", options: { breakLine: true } },
    { text: "v2.0 → v2.1: ", options: { bold: true } },
    { text: "dropping the synthetic crop-duration column: R² 0.9514 → 0.9528, RMSE 2,096 → 2,065.", options: { breakLine: true } },
    { text: "Validation gate: ", options: { bold: true } },
    { text: "CI refits the model on 1990–2008 and fails the build if accuracy drops below the thresholds." },
  ], { x: 0.5, y: 3.35, w: 9, h: 1.55, fontSize: 14, color: C.text1, valign: "top", paraSpaceAfter: 4 });
  s.addNotes("The served model explains about 95% of the variation in yields on years it never saw, with a typical error of about 2,000 kilograms per hectare. The likely-range band covers 74.5% of real yields against an 80% target, so it is slightly too narrow, and the app says so. Removing a synthetic column in version 2.1 slightly improved every metric. A validation gate in CI protects these numbers.");

  // ===================================================== 8. Product: predictor + risk screenshots
  pres.addSection({ title: "The platform" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "The platform" });
  s.addText("Predict, then act on the risk", { placeholder: "title" });
  s.addImage({ path: shot("predictor.png"), x: 0.5, y: 1.2, w: 4.4, h: 2.75, objectName: "predictor screenshot", altText: "Yield Predictor screen" });
  s.addImage({ path: shot("risk.png"), x: 5.1, y: 1.2, w: 4.4, h: 2.75, objectName: "risk screenshot", altText: "Risk assessment screen" });
  text(s, [{ text: "Yield Predictor", options: { bold: true, breakLine: true } }, { text: "Model inputs separate from field conditions; P10–P90 range, harvest in tonnes, what-if scenarios." }], { x: 0.5, y: 4.1, w: 4.4, h: 0.9, fontSize: 13, color: C.text1, valign: "top" });
  text(s, [{ text: "Risk assessment", options: { bold: true, breakLine: true } }, { text: "Likelihood × impact matrix, yearly timeline, yield anomalies and mitigation advice." }], { x: 5.1, y: 4.1, w: 4.4, h: 0.9, fontSize: 13, color: C.text1, valign: "top" });
  s.addNotes("Two core screens. The predictor separates the six model inputs from optional field conditions, which only drive risk flags. It shows a likely range and, for a selected farm, the expected harvest in tonnes. The risk page rates each risk by likelihood and impact, shows how it changes over the years and suggests mitigation.");

  // ===================================================== 9. Real soil
  s = pres.addSlide({ masterName: "Content", sectionTitle: "The platform" });
  s.addText("Real soil data for every farm", { placeholder: "title" });
  s.addImage({ path: shot("farm-soil.png"), x: 0.5, y: 1.2, w: 5.4, h: 3.375, objectName: "farm soil screenshot", altText: "Soil page showing SoilGrids data for a farm" });
  const soilPts = [
    [ic.layer, C.accent4, "ISRIC SoilGrids", "pH, organic carbon, nitrogen, texture, CEC at 0–30 cm"],
    [ic.vial, C.accent1, "Nutrient ratings", "Soil tests rated against Soil Health Card limits, with fertilizer advice"],
    [ic.shield, C.accent6, "No silent fallback", "If the service is down, the page says so instead of showing fake values"],
  ];
  soilPts.forEach(([img, col, head, body], i) => {
    const y = 1.25 + i * 1.12;
    dot(s, img, 6.2, y, col, 0.5, "soil icon " + (i + 1));
    text(s, [{ text: head, options: { bold: true, breakLine: true } }, { text: body }], { x: 6.85, y: y - 0.05, w: 2.65, h: 1.0, fontSize: 13, color: C.text1, valign: "top" });
  });
  s.addNotes("Because the dataset's soil columns are synthetic, farm soil comes from ISRIC SoilGrids for the farm's coordinates, combined with the farm's own lab tests. Nutrients are rated against Indian Soil Health Card limits, with fertilizer guidance. If SoilGrids is unavailable, the page shows an error; it never quietly substitutes made-up numbers.");

  // ===================================================== 10. Recommendations & analytics
  s = pres.addSlide({ masterName: "Content", sectionTitle: "The platform" });
  s.addText("From numbers to decisions", { placeholder: "title" });
  const recs = [
    [ic.bulb, C.accent2, "Recommendations", "Rules compare a context with top-yielding records; each shows evidence, model-estimated impact and a deadline. Tasks are saved per user."],
    [ic.chart, C.accent1, "Analytics & reports", "Yearly trend with next-year forecast, farms vs regional reference, CSV/Excel export and printable reports."],
    [ic.users, C.accent3, "Roles", "Farmer, Agronomist and Admin see different screens; every API route is protected and tested for all three roles."],
    [ic.check, C.text2, "Plain-language AI", "Groq writes short explanations from the evidence only; a labelled rule-based fallback is used otherwise."],
  ];
  recs.forEach(([img, col, head, body], i) => {
    const colI = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + colI * 4.6, y = 1.3 + row * 1.85;
    card(s, x, y, 4.4, 1.65, "decision card " + (i + 1));
    dot(s, img, x + 0.25, y + 0.25, col, 0.55, "decision icon " + (i + 1));
    text(s, [{ text: head, options: { bold: true, fontSize: 16, breakLine: true } }, { text: body, options: { fontSize: 13 } }], { x: x + 1.0, y: y + 0.18, w: 3.2, h: 1.35, color: C.text1, valign: "top" });
  });
  s.addNotes("Recommendations come from rules that compare the selected region and crop with the best-yielding records. Where the model uses the input, it estimates the impact in kilograms per hectare. Analytics show trends and compare a user's farms with the regional average. AI text is optional and always labelled; I tightened the prompt so it only states what the evidence shows.");

  // ===================================================== 11. Quality
  pres.addSection({ title: "Quality and deployment" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Quality and deployment" });
  s.addText("Tested at every level", { placeholder: "title" });
  const q = [
    ["130", "backend tests", "every route and role"],
    ["41", "frontend unit tests", ""],
    ["38", "browser checks", "3 roles · 0 console errors"],
    ["100", "Lighthouse", "accessibility, SEO, best practices"],
  ];
  q.forEach(([big, label, sub], i) => {
    const x = 0.5 + i * 2.28;
    card(s, x, 1.3, 2.1, 2.2, "quality card " + (i + 1));
    text(s, big, { x: x + 0.15, y: 1.5, w: 1.8, h: 0.9, fontSize: 40, bold: true, color: C.accent1, align: "center", valign: "middle" });
    text(s, [{ text: label, options: { bold: true, breakLine: !!sub } }, ...(sub ? [{ text: sub }] : [])], { x: 0.15 + x, y: 2.5, w: 1.8, h: 0.9, fontSize: 13, color: C.text1, align: "center", valign: "top" });
  });
  text(s, [
    { text: "Also checked: ", options: { bold: true } },
    { text: "type checking, linting, formatting, a model validation gate, load tests, security review (JWT, rate limits, upload content checks, no secrets in git), and a rehearsed database backup and restore." },
  ], { x: 0.5, y: 3.85, w: 9, h: 1.0, fontSize: 14, color: C.text1, valign: "top" });
  s.addNotes("Testing covers the API with 130 tests, including access for every route and role, frontend unit tests, and a browser test that signs in as all three roles and fails on any console error. Lighthouse scores are 99 to 100. I also ran load tests and rehearsed restoring a database backup.");

  // ===================================================== 12. Milestone 4 pipeline
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Quality and deployment" });
  s.addText("Milestone 4: containerised and automated", { placeholder: "title" });
  const steps = [
    [ic.gh, C.text2, "Push"],
    [ic.vial, C.accent1, "Test + model gate"],
    [ic.box, C.accent3, "Build images"],
    [ic.server, C.accent4, "Deploy to VM"],
    [ic.check, C.accent1, "Health check"],
  ];
  steps.forEach(([img, col, label], i) => {
    const x = 0.6 + i * 1.86;
    dot(s, img, x + 0.35, 1.3, col, 0.75, "pipeline icon " + (i + 1));
    text(s, label, { x, y: 2.15, w: 1.45, h: 0.5, fontSize: 13, bold: true, color: C.text1, align: "center", valign: "top" });
    if (i < steps.length - 1) s.addShape(pres.shapes.LINE, { x: x + 1.2, y: 1.675, w: 0.95, h: 0, line: { color: C.text2, width: 1.5, endArrowType: "triangle" }, objectName: "pipeline arrow " + (i + 1) });
  });
  card(s, 0.5, 2.95, 9, 1.75, "docker results card");
  text(s, [
    { text: "Docker stack measured locally", options: { bold: true, fontSize: 15, breakLine: true } },
    { text: "4 services healthy (PostgreSQL, MongoDB, API, web) · 28,242 rows seeded in 6.9 s", options: { breakLine: true } },
    { text: "20 concurrent users: 72 requests/s, p95 507 ms, 0 errors", options: { breakLine: true } },
    { text: "API image 831 MB with CPU-only XGBoost (half the size, identical predictions) · web image 77 MB", options: { breakLine: true } },
    { text: "Cloud: same Compose stack on an AWS EC2 or Azure VM, HTTPS via Caddy, daily backups" },
  ], { x: 0.75, y: 3.1, w: 8.5, h: 1.5, fontSize: 13, color: C.text1, valign: "top", paraSpaceAfter: 3 });
  s.addNotes("For Milestone 4 the whole platform runs in Docker. GitHub Actions runs the tests and the model validation gate on every push, builds the images and, on demand, deploys them to a cloud virtual machine and checks the health endpoint. Measured locally, the stack handles 72 requests per second from 20 concurrent users with no errors. Switching to the CPU-only build of XGBoost halved the image size without changing a single prediction.");

  // ===================================================== 13. Limitations
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Quality and deployment" });
  s.addText("What the model cannot do yet", { placeholder: "title" });
  const lim = [
    ["Country-level, not field-level", "Yields are national averages; a farm prediction is the national expectation for that crop and year."],
    ["New countries are hard", "On countries held out entirely, R² falls to 0.67 (RMSE 5,861 kg/ha)."],
    ["No year-to-year rainfall", "Rainfall is one long-term value per country in the data, so its effect is a country difference."],
    ["Range slightly narrow", "74.5% coverage against an 80% target; reported in the app."],
  ];
  lim.forEach(([head, body], i) => {
    const colI = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + colI * 4.6, y = 1.3 + row * 1.85;
    card(s, x, y, 4.4, 1.65, "limit card " + (i + 1));
    dot(s, ic.warn, x + 0.25, y + 0.25, C.accent2, 0.55, "limit icon " + (i + 1));
    text(s, [{ text: head, options: { bold: true, fontSize: 16, breakLine: true } }, { text: body, options: { fontSize: 13 } }], { x: x + 1.0, y: y + 0.18, w: 3.2, h: 1.35, color: C.text1, valign: "top" });
  });
  s.addNotes("Being honest about limits matters as much as the scores. The data is national, so predictions are national expectations. The model struggles with countries it has never seen. Rainfall does not vary by year in this dataset. And the likely range is a little too narrow. All of this is documented in the checklist and shown in the app.");

  // ===================================================== 14. Next steps
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Quality and deployment" });
  s.addText("Next steps", { placeholder: "title" });
  const nxt = [
    [ic.rocket, C.accent1, "Go live", "First cloud deployment on AWS or Azure with HTTPS; record production load-test results."],
    [ic.db, C.accent4, "Managed databases", "Move to managed PostgreSQL and MongoDB for automatic backups and failover."],
    [ic.seed, C.text2, "Field-level data", "Add harvested area, production and field measurements to go beyond national averages."],
  ];
  nxt.forEach(([img, col, head, body], i) => {
    const x = 0.5 + i * 3.05;
    card(s, x, 1.35, 2.85, 2.7, "next card " + (i + 1));
    dot(s, img, x + 0.25, 1.6, col, 0.6, "next icon " + (i + 1));
    text(s, head, { x: x + 0.25, y: 2.35, w: 2.4, h: 0.4, fontSize: 17, bold: true, color: C.text1 });
    text(s, body, { x: x + 0.25, y: 2.8, w: 2.4, h: 1.15, fontSize: 14, color: C.text1, valign: "top" });
  });
  s.addNotes("Next: the first public deployment, managed databases for reliability, and better data — harvested area, production and field measurements — so predictions can move from national to field level.");

  // ===================================================== 15. Demo + thanks
  pres.addSection({ title: "Close" });
  s = pres.addSlide({ masterName: "Divider", sectionTitle: "Close" });
  s.addText("Live demo, then questions", { placeholder: "title" });
  s.addText("Sign in as a farmer → predict → risk → soil → recommendations → admin metrics", { placeholder: "body" });
  dot(s, ic.tractor, 0.6, 0.8, C.accent2, 0.75, "demo icon");
  text(s, "Thank you  ·  Durga Prasad A", { x: 0.6, y: 4.5, w: 8, h: 0.4, fontSize: 16, color: C.background1 });
  s.addNotes("Demo path (about 5 minutes): sign in with the farmer demo account; run a prediction for Rice in India and show the range and harvest; open the risk page; show real soil for Green Valley Farm; create a task from a recommendation; sign in as admin to show system metrics. Then take questions.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
