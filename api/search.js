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

const FUNDING_TYPE_MAP = {
  "zuschuss":"zuschuss",
  "darlehen":"darlehen",
  "bürgschaft":"buergschaft",
  "beteiligung":"beteiligung",
  "garantie":"garantie",
  "sonstige":"sonstige"
};

const FUNDING_LEVEL_MAP = {
  "bund":"bund",
  "eu":"eu",
  "land":"land"
};

const COMPANY_SIZE_MAP = {
  "1–9 mitarbeitende":"kleinstunternehmen",
  "10–49 mitarbeitende":"kleines_unternehmen",
  "50–249 mitarbeitende":"mittleres_unternehmen",
  "250+ mitarbeitende":"grosses_unternehmen"
};

const TOPIC_AREA_MAP = {
  "digitalisierung":"digitalisierung",
  "energieeffizienz":"energieeffizienz_erneuerbare_energien",
  "erneuerbare energien":"energieeffizienz_erneuerbare_energien",
  "forschung innovation":"forschung_innovation_themenoffen",
  "weiterbildung":"aus_weiterbildung",
  "gründung":"existenzgruendung_festigung"
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


function isSpecificProgramUrl(url = "") {
  return /^https:\/\/www\.foerderdatenbank\.de\/FDB\/Content\/DE\/Foerderprogramm\/(?:Bund|Land|EU)\/.+\.html(?:[?#].*)?$/i.test(url);
}

function isGenericTitle(title = "") {
  const t = norm(title).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const blocked = new Set([
    "forderprogramm",
    "forderprogramme",
    "foerderprogramm",
    "foerderprogramme",
    "forderung",
    "foerderung",
    "forderung finden",
    "foerderung finden",
    "suchergebnisse",
    "programmsuche"
  ]);
  return !t || blocked.has(t) || t.length < 8;
}

function hasMeaningfulValue(value = "") {
  const v = clean(value);
  if (!v || v.length < 3) return false;
  return !/^(?:-|–|—|n\/?a|keine angabe|nicht angegeben|programm gelistet)$/i.test(v);
}

function isUsableProgram(program) {
  // In der Suchergebnisliste liefert die Förderdatenbank nicht zuverlässig alle
  // Metadaten. Deshalb hier nur eindeutig falsche Navigations-/Sammel-Treffer
  // verwerfen. Inhaltsdaten werden anschließend über die Detailseite verifiziert.
  return Boolean(
    program &&
    !isGenericTitle(program.title) &&
    isSpecificProgramUrl(program.url)
  );
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
    reasons.push("Themenbezug: " + matchedTopics.join(", "));
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
    const href = absoluteUrl(m[1]);
    if (isGenericTitle(title) || !isSpecificProgramUrl(href) || seen.has(href)) continue;

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

    const program = {
      title,
      url: href,
      who: (whoMatch?.[1] || "").trim().slice(0, 360),
      what: (whatMatch?.[1] || "").trim().slice(0, 440),
      giver,
      area,
      funding_level: fundingLevel,
      status,
      foundBy: searchTerm
    };

    if (!isUsableProgram(program)) continue;
    rows.push(program);
    seen.add(href);
    if (rows.length >= 16) break;
  }
  return rows;
}

function buildUrl({term, state, target, fundingType, fundingLevel, companySize, fundingArea}) {
  const params = new URLSearchParams();
  params.set("filterCategories", "FundingProgram");
  params.set("submit", "Suchen");
  params.set("pageLocale", "de");
  params.set("pageNo", "0");
  if (term) params.set("templateQueryString", term);

  const stateKey = STATE_MAP[norm(state)];
  const targetKey = TARGET_MAP[norm(target)];
  const typeKey = FUNDING_TYPE_MAP[norm(fundingType)];
  const levelKey = FUNDING_LEVEL_MAP[norm(fundingLevel)];
  const sizeKey = COMPANY_SIZE_MAP[norm(companySize)];
  if (stateKey) params.set("cl2Processes_Foerdergebiet", stateKey);
  if (targetKey) params.set("cl2Processes_Foerderberechtigte", targetKey);
  if (typeKey) params.set("cl2Processes_Foerderart", typeKey);
  if (levelKey) params.set("cl2Processes_Foerdergeber", levelKey);
  if (sizeKey) params.set("cl2Processes_Unternehmensgroesse", sizeKey);
  if (fundingArea) params.set("cl2Processes_Foerderbereich", fundingArea);

  return "https://www.foerderdatenbank.de/SiteGlobals/FDB/Forms/Suche/Foederprogrammsuche_Formular.html?" + params.toString();
}

async function fetchSearch(term, state, target, fundingType, fundingLevel, companySize, fundingArea) {
  const sourceUrl = buildUrl({term, state, target, fundingType, fundingLevel, companySize, fundingArea});
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
  const locality = String(req.query.locality || "").trim().slice(0, 80);
  const fundingType = String(req.query.fundingType || "").trim().slice(0, 40);
  const fundingLevel = String(req.query.fundingLevel || "").trim().slice(0, 30);

  const topics = String(req.query.topics || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean)
    .slice(0, 4);

  const baseTerms = [...new Set([q, ...topics].filter(Boolean))].slice(0, 5);
  const terms = [...baseTerms];
  if (locality) terms.push(locality);
  if (!terms.length) terms.push("Förderung");

  const profile = { q, state, target, size, investment, start, locality, fundingType, fundingLevel, topics };

  try {
    const officialLevel = ["Bund","Land","EU"].includes(fundingLevel) ? fundingLevel : "";
    const searches = [];
    if (q) searches.push(await fetchSearch(q, state, target, fundingType, officialLevel, size, ""));
    for (const topic of topics) {
      const area = TOPIC_AREA_MAP[norm(topic)] || "";
      searches.push(await fetchSearch(area ? "" : topic, state, target, fundingType, officialLevel, size, area));
    }
    if (locality) searches.push(await fetchSearch(locality, state, target, fundingType, officialLevel, size, ""));
    if (!searches.length) searches.push(await fetchSearch("Förderung", state, target, fundingType, officialLevel, size, ""));
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

    let programs = [...merged.values()].map(program => {
      const match = scoreProgram(program, profile);
      const reasons = [...match.reasons];
      if (fundingType) reasons.push("Förderart gefiltert: " + fundingType);
      if (fundingLevel && fundingLevel !== "Kommunal") reasons.push("Förder-Ebene gefiltert: " + fundingLevel);
      if (locality) reasons.push("Ort/Kommune im Suchprofil: " + locality);
      return { ...program, fit: match.score, reasons, matchedTopics: match.matchedTopics };
    });

    if (fundingLevel === "Kommunal") {
      const placeNeedle = norm(locality);
      programs = programs.filter(p =>
        p.funding_level?.type === "municipal" ||
        (placeNeedle && norm([p.title,p.giver,p.area,p.who,p.what].join(" ")).includes(placeNeedle))
      );
    }

    programs = programs
      .filter(isUsableProgram)
      .sort((a,b) => b.fit - a.fit)
      .slice(0, 24);

    const warnings = [];
    if (size) warnings.push("Unternehmensgröße wird jetzt als offizieller Filter der Förderdatenbank verwendet. Die endgültige Förderfähigkeit kann trotzdem zusätzliche KMU-/Beihilfekriterien enthalten.");
    if (investment) warnings.push("Die Investitionssumme wird berücksichtigt. Ein möglicher Förderbetrag wird nur angezeigt, wenn Förderquote und Höchstgrenzen eindeutig genug ermittelt werden können. Fehlen dafür Angaben, zeigt FörderRadar diese direkt beim jeweiligen Programm an.");
    if (start) warnings.push("Projektstart ist erfasst; konkrete Antragsfristen und Vorhabensbeginn-Regeln werden in der nächsten Ausbaustufe geprüft.");
    if (fundingLevel === "Kommunal") {
      warnings.push(locality
        ? "Kommunale Suche ist nur ein Zusatztest: Die Förderdatenbank des Bundes deckt primär Programme von Bund, Ländern und EU ab und besitzt keinen eigenen kommunalen Fördergeber-Filter. Kommunale Förderprogramme können deshalb fehlen."
        : "Für kommunale Förderungen bitte zusätzlich Ort/Kommune angeben. Die kommunale Suche ist derzeit Beta."
      );
    }

    return res.status(200).json({
      ok: true,
      profile,
      terms,
      programs,
      searches: searches.map(s => ({term:s.term,total_hint:s.totalHint,source_url:s.sourceUrl})),
      source: "Förderdatenbank des Bundes",
      source_home: "https://www.foerderdatenbank.de/",
      warnings,
      attribution: "Datenquelle: Förderdatenbank des Bundes. Die Relevanzbewertung ist eine technische Vorsortierung und keine Aussage über Förderfähigkeit oder Bewilligungswahrscheinlichkeit."
    });
  } catch (err) {
    return res.status(500).json({
      ok:false,
      error:"Live-Suche fehlgeschlagen: " + (err?.message || "unbekannter Fehler")
    });
  }
}
