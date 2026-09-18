const STATE_MAP = {
  "bundesweit": "_bundesweit",
  "baden-württemberg": "baden_wuerttemberg",
  "bayern": "bayern",
  "berlin": "berlin",
  "brandenburg": "brandenburg",
  "bremen": "bremen",
  "hamburg": "hamburg",
  "hessen": "hessen",
  "mecklenburg-vorpommern": "mecklenburg_vorpommern",
  "niedersachsen": "de_ni",
  "nordrhein-westfalen": "nordrhein_westfalen",
  "rheinland-pfalz": "rheinland_pfalz",
  "saarland": "saarland",
  "sachsen": "sachsen",
  "sachsen-anhalt": "de_st",
  "schleswig-holstein": "schleswig_holstein",
  "thüringen": "thueringen"
};

const TARGET_MAP = {
  "unternehmen": "unternehmen",
  "privatperson": "privatperson",
  "gründer": "existenzgruender_in",
  "existenzgründer/in": "existenzgruender_in",
  "kommune": "kommune",
  "verein": "verband_vereinigung",
  "verband/vereinigung": "verband_vereinigung",
  "hochschule": "hochschule",
  "forschungseinrichtung": "forschungseinrichtung",
  "öffentliche einrichtung": "oeffentliche_einrichtung"
};

function decodeHtml(s = "") {
  const map = {
    "&amp;":"&","&quot;":"\"","&#39;":"'","&apos;":"'","&lt;":"<","&gt;":">",
    "&nbsp;":" ","&auml;":"ä","&ouml;":"ö","&uuml;":"ü","&Auml;":"Ä","&Ouml;":"Ö",
    "&Uuml;":"Ü","&szlig;":"ß","&ndash;":"–","&mdash;":"—","&euro;":"€"
  };
  return s.replace(/&(?:amp|quot|#39|apos|lt|gt|nbsp|auml|ouml|uuml|Auml|Ouml|Uuml|szlig|ndash|mdash|euro);/g, m => map[m] || m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function clean(s = "") {
  return decodeHtml(
    s.replace(/<script[\s\S]*?<\/script>/gi, " ")
     .replace(/<style[\s\S]*?<\/style>/gi, " ")
     .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function absoluteUrl(href = "") {
  if (/^https?:\/\//i.test(href)) return href;
  const idx = href.indexOf("/FDB/Content/");
  if (idx >= 0) return "https://www.foerderdatenbank.de" + href.slice(idx);
  if (href.startsWith("FDB/Content/")) return "https://www.foerderdatenbank.de/" + href;
  return "https://www.foerderdatenbank.de" + (href.startsWith("/") ? href : "/" + href);
}

function tokens(q = "") {
  const stop = new Set(["und","oder","für","mit","der","die","das","ein","eine","von","im","in","zu","zur","zum","am","an"]);
  return q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9äöüß]+/i).filter(x => x.length > 2 && !stop.has(x));
}

function fitScore(q, text) {
  const ts = tokens(q);
  if (!ts.length) return 70;
  const hay = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const hits = ts.filter(t => hay.includes(t)).length;
  return Math.min(98, Math.max(45, Math.round(50 + (hits / ts.length) * 48)));
}

function parsePrograms(html, q) {
  const re = /<a\b[^>]*href=["']([^"']*Foerderprogramm[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const matches = [...html.matchAll(re)];
  const seen = new Set();
  const rows = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const title = clean(m[2]);
    if (!title || title.length < 4) continue;
    const href = absoluteUrl(m[1]);
    if (seen.has(href)) continue;

    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : Math.min(html.length, start + 5000);
    const plain = clean(html.slice(start, end));

    const whoMatch = plain.match(/Wer wird gefördert\??:\s*(.*?)(?=Was wird gefördert\??:|Förderprogramm|$)/i);
    const whatMatch = plain.match(/Was wird gefördert\??:\s*(.*?)(?=Förderprogramm|Suchergebnisse|Sortierung|$)/i);
    const status = /Antragstellung nicht mehr möglich/i.test(plain) ? "Antragstellung nicht mehr möglich" : "Programm gelistet";

    const who = (whoMatch?.[1] || "").trim().slice(0, 300);
    const what = (whatMatch?.[1] || "").trim().slice(0, 400);
    const combined = [title, who, what].join(" ");

    rows.push({
      title,
      url: href,
      who,
      what,
      status,
      fit: fitScore(q, combined)
    });
    seen.add(href);
    if (rows.length >= 12) break;
  }
  return rows.sort((a,b) => b.fit - a.fit);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const q = String(req.query.q || "").trim().slice(0, 160);
  const state = String(req.query.state || "Bayern").trim();
  const target = String(req.query.target || "Unternehmen").trim();

  const params = new URLSearchParams();
  params.set("filterCategories", "FundingProgram");
  params.set("submit", "Suchen");
  params.set("pageLocale", "de");
  params.set("pageNo", "0");
  if (q) params.set("templateQueryString", q);

  const stateKey = STATE_MAP[state.toLowerCase()];
  const targetKey = TARGET_MAP[target.toLowerCase()];
  if (stateKey) params.set("cl2Processes_Foerdergebiet", stateKey);
  if (targetKey) params.set("cl2Processes_Foerderberechtigte", targetKey);

  const sourceUrl = "https://www.foerderdatenbank.de/SiteGlobals/FDB/Forms/Suche/Foederprogrammsuche_Formular.html?" + params.toString();

  try {
    const upstream = await fetch(sourceUrl, {
      headers: {
        "user-agent": "FoerderRadar-Prototype/0.1 (+https://github.com/xturn2u/foerder_tool)",
        "accept": "text/html,application/xhtml+xml"
      },
      redirect: "follow"
    });

    if (!upstream.ok) {
      return res.status(502).json({ ok:false, error:"Förderdatenbank antwortet mit HTTP " + upstream.status, source_url:sourceUrl });
    }

    const html = await upstream.text();
    const countMatch = clean(html).match(/(\d[\d.]*)\s+Beiträge/i);
    const programs = parsePrograms(html, q);

    return res.status(200).json({
      ok: true,
      query: { q, state, target },
      total_hint: countMatch ? countMatch[1] : null,
      programs,
      source: "Förderdatenbank des Bundes",
      source_url: sourceUrl,
      attribution: "Datenquelle: Förderdatenbank des Bundes. Angaben sind unverbindlich; maßgeblich sind die offiziellen Programminformationen."
    });
  } catch (err) {
    return res.status(500).json({ ok:false, error:"Live-Suche fehlgeschlagen: " + (err?.message || "unbekannter Fehler"), source_url:sourceUrl });
  }
}
