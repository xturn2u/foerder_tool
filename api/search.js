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

function norm(s = "") {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}


const LAND_NAMES = [
  "Baden-Württemberg","Bayern","Berlin","Brandenburg","Bremen","Hamburg","Hessen",
  "Mecklenburg-Vorpommern","Niedersachsen","Nordrhein-Westfalen","Rheinland-Pfalz",
  "Saarland","Sachsen","Sachsen-Anhalt","Schleswig-Holstein","Thüringen"
];

function classifyQuickLevel({title="", giver="", area="", plain=""}) {
  const ng = norm(giver);
  const na = norm(area);
  const all = norm([title,giver,area,plain.slice(0,1800)].join(" "));
  const findLand = source => LAND_NAMES.find(land => source.includes(norm(land))) || "";

  const municipalSource = [giver,title].join(" ");
  if (/(stadt|gemeinde|landkreis|landeshauptstadt|bezirksamt)/.test(ng)) {
    const m = municipalSource.match(/(?:landeshauptstadt|stadt|gemeinde|landkreis|bezirksamt)\s+([a-zäöüß\- ]{2,40})/i);
    const place = (m?.[1] || "").replace(/\s+(fördert|förderung|programm|referat).*$/i,"").trim();
    return {type:"municipal",label:"Kommunale Förderung" + (place ? " · " + place : ""),confidence:"hoch"};
  }

  if (/bundesministerium|bundesamt|bundesanstalt|bundesrepublik deutschland|\bbafa\b|\bkfw\b/.test(ng)) {
    return {type:"federal",label:"Bundesförderung",confidence:"hoch"};
  }

  const giverLand = findLand(ng);
  const eu = /europaische union|europaische kommission|eu-kommission|\befre\b|\besf\+?\b|\binterreg\b|horizont europa|\beafrd\b/.test(all);
  if (giverLand) return {type:eu?"eu_state":"state",label:(eu?"EU / Landesförderung · ":"Landesförderung · ")+giverLand,confidence:"hoch"};

  if (/europaische union|europaische kommission|eu-kommission/.test(ng)) {
    return {type:"eu",label:"EU-Förderung",confidence:"hoch"};
  }

  const titleLand = findLand(norm(title));
  if (titleLand) return {type:eu?"eu_state":"state",label:(eu?"EU / Landesförderung · ":"Landesförderung · ")+titleLand,confidence:"mittel"};

  if (/bundesweit|deutschlandweit/.test(na) || /bundesprogramm|bundesforderung|bundesförderung/.test(norm(title))) {
    return {type:"federal",label:"Bundesförderung",confidence:"mittel"};
  }

  const areaLand = findLand(na);
  if (areaLand) return {type:eu?"eu_state":"state",label:(eu?"EU / Landesförderung · ":"Landesförderung · ")+areaLand,confidence:"mittel"};

  if (eu) return {type:"eu",label:"EU-Förderung",confidence:"mittel"};
  return {type:"unknown",label:"Förder-Ebene prüfen",confidence:"niedrig"};
}

function tokens(q = "") {
  const stop = new Set(["und","oder","für","mit","der","die","das","ein","eine","von","im","in","zu","zur","zum","am","an"]);
  return norm(q).split(/[^a-z0-9äöüß]+/i).filter(x => x.length > 2 && !stop.has(x));
}

function scoreProgram(program, profile) {
  let score = 48;
  const reasons = [];
  const hay = norm([program.title, program.who, program.what].join(" "));
  const matchedTopics = [];

  for (const topic of profile.topics) {
    const ts = tokens(topic);
    if (ts.some(t => hay.includes(t))) matchedTopics.push(topic);
  }

  if (matchedTopics.length) {
    score += Math.min(32, matchedTopics.length * 12);
    reasons.push("Themenmatch: " + matchedTopics.join(", "));
  }

  if (profile.target) {
    const targetNeedle = norm(profile.target === "Gründer" ? "Existenzgründer" : profile.target);
    if (norm(program.who).includes(targetNeedle) || profile.target === "Unternehmen" && norm(program.who).includes("unternehmen")) {
      score += 8;
      reasons.push("Zielgruppe passt: " + profile.target);
    }
  }

  if (profile.state) {
    score += 4;
    reasons.push("Fördergebiet gefiltert: " + profile.state);
  }

  if (/nicht mehr möglich/i.test(program.status)) {
    score -= 35;
    reasons.push("Achtung: Antragstellung derzeit nicht möglich");
  }

  score = Math.max(20, Math.min(97, score));
  return { score, reasons, matchedTopics };
}

function parsePrograms(html, searchTerm) {
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
    const whatMatch = plain.match(/Was wird gefördert\??:\s*(.*?)(?=Fördergebiet:|Fördergeber:|Förderprogramm|Suchergebnisse|Sortierung|$)/i);
    const areaMatch = plain.match(/Fördergebiet:\s*(.*?)(?=Förderberechtigte:|Fördergeber:|Förderprogramm|$)/i);
    const giverMatch = plain.match(/Fördergeber:\s*(.*?)(?=Ansprechpunkt:|Förderprogramm|$)/i);
    const status = /Antragstellung nicht mehr möglich/i.test(plain) ? "Antragstellung derzeit nicht mehr möglich" : "Programm gelistet";
    const giver = (giverMatch?.[1] || "").trim().slice(0, 260);
    const area = (areaMatch?.[1] || "").trim().slice(0, 220);
    const fundingLevel = classifyQuickLevel({title,giver,area,plain});

    rows.push({
      title,
      url: href,
      who: (whoMatch?.[1] || "").trim().slice(0, 360),
      what: (whatMatch?.[1] || "").trim().slice(0, 440),
      giver,
      area,
      funding_level: fundingLevel,
      status,
      foundBy: searchTerm
    });

    seen.add(href);
    if (rows.length >= 16) break;
  }
  return rows;
}

function buildUrl({term, state, target}) {
  const params = new URLSearchParams();
  params.set("filterCategories", "FundingProgram");
  params.set("submit", "Suchen");
  params.set("pageLocale", "de");
  params.set("pageNo", "0");
  if (term) params.set("templateQueryString", term);

  const stateKey = STATE_MAP[norm(state)];
  const targetKey = TARGET_MAP[norm(target)];
  if (stateKey) params.set("cl2Processes_Foerdergebiet", stateKey);
  if (targetKey) params.set("cl2Processes_Foerderberechtigte", targetKey);

  return "https://www.foerderdatenbank.de/SiteGlobals/FDB/Forms/Suche/Foederprogrammsuche_Formular.html?" + params.toString();
}

async function fetchSearch(term, state, target) {
  const sourceUrl = buildUrl({term, state, target});
  const upstream = await fetch(sourceUrl, {
    headers: {
      "user-agent": "FoerderRadar-Prototype/0.2 (+https://github.com/xturn2u/foerder_tool)",
      "accept": "text/html,application/xhtml+xml"
    },
    redirect: "follow"
  });

  if (!upstream.ok) throw new Error("Förderdatenbank antwortet mit HTTP " + upstream.status);
  const html = await upstream.text();
  const countMatch = clean(html).match(/(\d[\d.]*)\s+Beiträge/i);

  return {
    term,
    sourceUrl,
    totalHint: countMatch ? countMatch[1] : null,
    programs: parsePrograms(html, term)
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const q = String(req.query.q || "").trim().slice(0, 180);
  const state = String(req.query.state || "Bayern").trim();
  const target = String(req.query.target || "Unternehmen").trim();
  const size = String(req.query.size || "").trim().slice(0, 80);
  const investment = Number(req.query.investment || 0) || 0;
  const start = String(req.query.start || "").trim().slice(0, 30);

  const topics = String(req.query.topics || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean)
    .slice(0, 4);

  const terms = [...new Set([q, ...topics].filter(Boolean))].slice(0, 5);
  if (!terms.length) terms.push("Förderung");

  const profile = { q, state, target, size, investment, start, topics };

  try {
    const searches = await Promise.all(terms.map(term => fetchSearch(term, state, target)));
    const merged = new Map();

    for (const search of searches) {
      for (const program of search.programs) {
        const existing = merged.get(program.url);
        if (existing) {
          existing.foundBy = [...new Set([...(Array.isArray(existing.foundBy) ? existing.foundBy : [existing.foundBy]), search.term])];
        } else {
          merged.set(program.url, { ...program, foundBy: [search.term] });
        }
      }
    }

    const programs = [...merged.values()].map(program => {
      const match = scoreProgram(program, profile);
      return { ...program, fit: match.score, reasons: match.reasons, matchedTopics: match.matchedTopics };
    }).sort((a,b) => b.fit - a.fit).slice(0, 24);

    const warnings = [];
    if (size) warnings.push("Unternehmensgröße wird im MVP bereits gespeichert, aber noch nicht als harter Eligibility-Filter ausgewertet.");
    if (investment) warnings.push("Investitionssumme wird im Profil berücksichtigt, aber Förderhöhen werden erst mit dem XML-/Detaildaten-Import belastbar berechnet.");
    if (start) warnings.push("Projektstart ist erfasst; konkrete Antragsfristen und Vorhabensbeginn-Regeln werden in der nächsten Ausbaustufe geprüft.");

    return res.status(200).json({
      ok: true,
      profile,
      terms,
      programs,
      searches: searches.map(s => ({term:s.term,total_hint:s.totalHint,source_url:s.sourceUrl})),
      source: "Förderdatenbank des Bundes",
      source_home: "https://www.foerderdatenbank.de/",
      warnings,
      attribution: "Datenquelle: Förderdatenbank des Bundes. Match-Werte sind eine technische Vorsortierung und keine Förderzusage."
    });
  } catch (err) {
    return res.status(500).json({
      ok:false,
      error:"Live-Suche fehlgeschlagen: " + (err?.message || "unbekannter Fehler")
    });
  }
}
