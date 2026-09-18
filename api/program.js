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

function regexEscape(value = "") {
  return value.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
}

function extract(text, startLabel, endLabels) {
  const ends = endLabels.map(regexEscape).join("|");
  const re = new RegExp(regexEscape(startLabel) + "\\s*(.*?)(?=" + ends + "|$)", "i");
  return (text.match(re)?.[1] || "").trim();
}

function norm(s = "") {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}


const LAND_NAMES = [
  "Baden-Württemberg","Bayern","Berlin","Brandenburg","Bremen","Hamburg","Hessen",
  "Mecklenburg-Vorpommern","Niedersachsen","Nordrhein-Westfalen","Rheinland-Pfalz",
  "Saarland","Sachsen","Sachsen-Anhalt","Schleswig-Holstein","Thüringen"
];

function classifyFundingLevel({title="", foerdergeber="", foerdergebiet="", text=""}) {
  const giver = norm(foerdergeber);
  const area = norm(foerdergebiet);
  const all = norm([title, foerdergeber, foerdergebiet, text.slice(0, 2500)].join(" "));

  const findLand = source => LAND_NAMES.find(land => source.includes(norm(land))) || "";

  const municipalSource = [foerdergeber, title].join(" ");
  const municipalPatterns = [
    /landeshauptstadt\s+([a-zäöüß\- ]{2,40})/i,
    /stadt\s+([a-zäöüß\- ]{2,40})/i,
    /gemeinde\s+([a-zäöüß\- ]{2,40})/i,
    /landkreis\s+([a-zäöüß\- ]{2,40})/i,
    /bezirksamt\s+([a-zäöüß\- ]{2,40})/i
  ];
  if (/(stadt|gemeinde|landkreis|landeshauptstadt|bezirksamt)/.test(giver)) {
    for (const re of municipalPatterns) {
      const m = municipalSource.match(re);
      if (m) {
        const place = m[1].replace(/\s+(fördert|förderung|programm|ministerium|referat).*$/i,"").trim();
        return {type:"municipal", label:"Kommunale Förderung" + (place ? " · " + place : ""), region:place || "", confidence:"hoch", evidence:foerdergeber || title};
      }
    }
    return {type:"municipal", label:"Kommunale Förderung", region:"", confidence:"hoch", evidence:foerdergeber || title};
  }

  const giverIsFederal = /bundesministerium|bundesamt|bundesanstalt|bundesrepublik deutschland|\bbafa\b|\bkfw\b/.test(giver);
  if (giverIsFederal) {
    return {type:"federal", label:"Bundesförderung", region:"Deutschland", confidence:"hoch", evidence:foerdergeber};
  }

  const giverLand = findLand(giver);
  const euMentioned = /europaische union|europaische kommission|eu-kommission|eu-fonds|\befre\b|\besf\+?\b|\binterreg\b|horizont europa|\beafrd\b/.test(all);
  if (giverLand) {
    return {
      type:euMentioned ? "eu_state" : "state",
      label:(euMentioned ? "EU / Landesförderung · " : "Landesförderung · ") + giverLand,
      region:giverLand,
      confidence:"hoch",
      evidence:foerdergeber
    };
  }

  const giverIsEU = /europaische union|europaische kommission|eu-kommission/.test(giver);
  if (giverIsEU) {
    return {type:"eu", label:"EU-Förderung", region:"Europäische Union", confidence:"hoch", evidence:foerdergeber};
  }

  const titleLand = findLand(norm(title));
  if (titleLand) {
    return {type:euMentioned ? "eu_state" : "state", label:(euMentioned ? "EU / Landesförderung · " : "Landesförderung · ") + titleLand, region:titleLand, confidence:"mittel", evidence:title};
  }

  if (/bundesweit|deutschlandweit/.test(area) || /bundesprogramm|bundesforderung|bundesförderung/.test(norm(title))) {
    return {type:"federal", label:"Bundesförderung", region:"Deutschland", confidence:"mittel", evidence:foerdergebiet || title};
  }

  const areaLand = findLand(area);
  if (areaLand) {
    return {type:euMentioned ? "eu_state" : "state", label:(euMentioned ? "EU / Landesförderung · " : "Landesförderung · ") + areaLand, region:areaLand, confidence:"mittel", evidence:foerdergebiet};
  }

  if (euMentioned) {
    return {type:"eu", label:"EU-Förderung", region:"Europäische Union", confidence:"mittel", evidence:foerdergeber || foerdergebiet || title};
  }

  return {type:"unknown", label:"Förder-Ebene prüfen", region:"", confidence:"niedrig", evidence:foerdergeber || foerdergebiet || title};
}
function moneyToNumber(raw = "") {
  const v = raw.replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "");
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function contextAround(text, index, length, radius = 220) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  return text.slice(start, end).trim();
}

function sizeClass(size = "") {
  if (/1.?9/.test(size)) return "micro";
  if (/10.?49/.test(size)) return "small";
  if (/50.?249/.test(size)) return "medium";
  if (/250/.test(size)) return "large";
  return "";
}

function audienceMatchScore(context, size, target) {
  const c = norm(context);
  const cls = sizeClass(size);
  let score = 0;
  let explicit = false;

  const hasMicro = /kleinstunternehmen|kleinstbetriebe/.test(c);
  const hasSmall = /kleine unternehmen|kleinunternehmen/.test(c);
  const hasMedium = /mittlere unternehmen/.test(c);
  const hasSME = /kleine und mittlere unternehmen|\bkm[uü]\b/.test(c);
  const hasLarge = /grossunternehmen|große unternehmen|grossen unternehmen/.test(c);

  const hasAnySize = hasMicro || hasSmall || hasMedium || hasSME || hasLarge;

  if (cls) {
    const applicable =
      (cls === "micro" && (hasMicro || hasSmall || hasSME)) ||
      (cls === "small" && (hasSmall || hasSME)) ||
      (cls === "medium" && (hasMedium || hasSME)) ||
      (cls === "large" && hasLarge);

    if (applicable) { score += 35; explicit = true; }
    else if (hasAnySize) score -= 60;
  }

  const t = norm(target);
  const groups = {
    privatperson: /privatperson|private eigent|nat[uü]rliche person|privathaushalt|wohneigent[uü]mer/,
    kommune: /kommune|kommunal|gemeinde|stadt|landkreis/,
    verein: /verein|verband|vereinigung|gemeinn[uü]tzig/,
    hochschule: /hochschule|universit[aä]t/,
    forschungseinrichtung: /forschungseinrichtung/,
    gruender: /existenzgr[uü]nd|gr[uü]ndung|startup|start-up/
  };
  const key = t === "grunder" || t === "gründer" ? "gruender" : t;
  if (groups[key]) {
    if (groups[key].test(c)) { score += 30; explicit = true; }
  }

  return {score, explicit};
}

function extractRates(text, size, target) {
  const matches = [...text.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)];
  const candidates = [];

  for (const m of matches) {
    const rate = Number(m[1].replace(",", "."));
    if (!(rate > 0 && rate <= 100)) continue;
    const context = contextAround(text, m.index, m[0].length, 240);
    const c = norm(context);

    if (!/(zuschuss|forderung|foerderung|forderquote|foerderquote|fordersatz|foerdersatz|zuwendung|beihilfe|ausgaben|kosten)/.test(c)) continue;
    if (/projektpauschale/.test(c) && !/(zuschuss|forderquote|foerderquote)/.test(c)) continue;
    if (/darlehen|kredit/.test(c) && !/zuschuss/.test(c)) continue;

    const audience = audienceMatchScore(context, size, target);
    let score = 15 + audience.score;
    if (/bis zu|maximal|hochstens|höchstens/.test(c)) score += 8;
    if (/forderquote|foerderquote|fordersatz|foerdersatz|höhe des zuschusses|hoehe des zuschusses/.test(c)) score += 8;
    if (/zuschuss/.test(c)) score += 5;

    candidates.push({rate, context, score, explicit:audience.explicit});
  }

  candidates.sort((a,b) => b.score - a.score || b.rate - a.rate);
  return candidates;
}

function extractMoneyRules(text, size, target) {
  const matches = [...text.matchAll(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*(?:EUR|Euro)/gi)];
  const rules = [];

  for (const m of matches) {
    const amount = moneyToNumber(m[1]);
    if (!amount) continue;
    const context = contextAround(text, m.index, m[0].length, 220);
    const c = norm(context);
    const audience = audienceMatchScore(context, size, target);

    let type = "other";
    if (/(mindestforder|mindestfoerder|zuschuss muss mindestens|forderung.*mindestens|foerderung.*mindestens)/.test(c)) {
      type = "min_grant";
    } else if (/(maximal|hochstens|höchstens|bis zu)/.test(c) &&
               /(zuschuss|forderung|foerderung|zuwendung|beihilfe)/.test(c) &&
               !/(forderfahige kosten|förderfähige kosten|forderfahige ausgaben|förderfähige ausgaben|zuwendungsfahige kosten|zuwendungsfähige kosten|gesamtkosten|projektvolumen)/.test(c)) {
      type = "max_grant";
    } else if (/(forderfahige kosten|förderfähige kosten|forderfahige ausgaben|förderfähige ausgaben|zuwendungsfahige kosten|zuwendungsfähige kosten)/.test(c) &&
               /(maximal|hochstens|höchstens|bis zu)/.test(c)) {
      type = "max_eligible_cost";
    } else if (/(mindestens|bagatellgrenze)/.test(c) &&
               /(ausgaben|kosten|investition|gesamtkosten)/.test(c)) {
      type = "min_eligible_cost";
    }

    if (type !== "other") {
      rules.push({type, amount, context, score:10 + audience.score, explicit:audience.explicit});
    }
  }

  return rules.sort((a,b) => b.score - a.score);
}


function inferMissingInputs(source = "", {size="", target="", locality="", state=""} = {}) {
  const c = norm(source);
  const missing = [];
  const add = (key, label) => {
    if (!missing.some(x => x.key === key)) missing.push({key, label});
  };

  if (/kleinstunternehmen|kleine unternehmen|mittlere unternehmen|grossunternehmen|große unternehmen|\bkm[uü]\b/.test(c) &&
      norm(target) === "unternehmen" && !size) {
    add("company_size", "Unternehmensgröße");
  }

  if (/c-gebiet|grw-gebiet|regionalforderung|regionalförderung|gebietskulisse|fördergebiet|fordergebiet|strukturgebiet/.test(c) &&
      !locality) {
    add("location", "genauer Standort / Kommune bzw. Fördergebiet");
  }

  if (/einkommensbonus|haushaltsjahreseinkommen|zu versteuerndes einkommen|jahreseinkommen/.test(c)) {
    add("income", "zu versteuerndes Haushaltsjahreseinkommen");
  }

  if (/netto.?grundflache|nettogrundfläche|geb[aä]udefl[aä]che|wohnfl[aä]che|nutzfl[aä]che/.test(c)) {
    add("building_area", "Gebäudegröße / Netto- bzw. Wohnfläche");
  }

  if (/wohneinheit|anzahl der wohnungen|anzahl wohnungen/.test(c)) {
    add("housing_units", "Anzahl der Wohneinheiten");
  }

  if (/klimageschwindigkeitsbonus|effizienzbonus|emissionsminderungszuschlag|bonusvoraussetzung|bonus/.test(c)) {
    add("bonus_conditions", "zutreffende Bonusvoraussetzungen / technische Ausführung");
  }

  if (/staffel|förderstufe|forderstufe|stufe [1-9]|basisförderung|basisforderung/.test(c)) {
    add("funding_tier", "zutreffende Förderstufe");
  }

  if (/de-minimis|deminimis|beihilfeintensit[aä]t|beihilferecht/.test(c)) {
    add("state_aid", "bereits erhaltene De-minimis-/Beihilfen");
  }

  if (/eigenanteil|eigenmittel|finanzierungsanteil/.test(c)) {
    add("equity", "verfügbare Eigenmittel / Eigenanteil");
  }

  if (/projektlaufzeit|laufzeit des projekts|bewilligungszeitraum/.test(c)) {
    add("duration", "geplante Projektlaufzeit");
  }

  return missing;
}

function estimateFunding(text, investment, size, target, locality, state) {
  if (!(investment > 0)) {
    return {
      available:false,
      reason:"Keine Investitionssumme angegeben.",
      missing_inputs:[{key:"investment",label:"Investitionssumme / Projektbudget"}]
    };
  }

  const rates = extractRates(text, size, target);
  if (!rates.length) {
    return {
      available:false,
      reason:"In der offiziellen Programmbeschreibung wurde keine belastbare prozentuale Förderquote erkannt.",
      missing_inputs:inferMissingInputs(text,{size,target,locality,state}),
      source_gap:true
    };
  }

  const topScore = rates[0].score;
  const topRates = rates.filter(r => r.score >= topScore - 2);
  const selected = topRates.sort((a,b) => b.rate - a.rate)[0];
  const moneyRules = extractMoneyRules(text, size, target);

  const applicableMaxGrant = moneyRules.find(r => r.type === "max_grant" && r.score >= 10);
  const applicableMaxEligible = moneyRules.find(r => r.type === "max_eligible_cost" && r.score >= 10);
  const minEligible = moneyRules.find(r => r.type === "min_eligible_cost" && r.score >= 10);
  const minGrant = moneyRules.find(r => r.type === "min_grant" && r.score >= 10);

  const eligibleBase = applicableMaxEligible ? Math.min(investment, applicableMaxEligible.amount) : investment;
  const rawAmount = eligibleBase * selected.rate / 100;
  const estimatedAmount = applicableMaxGrant ? Math.min(rawAmount, applicableMaxGrant.amount) : rawAmount;

  const notes = [];
  if (applicableMaxEligible && investment > applicableMaxEligible.amount) {
    notes.push("Die Berechnung wurde auf erkannte maximal förderfähige Kosten von " + applicableMaxEligible.amount + " EUR begrenzt.");
  }
  if (applicableMaxGrant && rawAmount > applicableMaxGrant.amount) {
    notes.push("Der errechnete Betrag wurde auf einen erkannten Förderhöchstbetrag von " + applicableMaxGrant.amount + " EUR begrenzt.");
  }
  if (minEligible && investment < minEligible.amount) {
    notes.push("Die Investitionssumme liegt unter einer erkannten Mindestgrenze von " + minEligible.amount + " EUR.");
  }
  if (minGrant && estimatedAmount < minGrant.amount) {
    notes.push("Der errechnete Förderbetrag liegt unter einer erkannten Mindestfördersumme von " + minGrant.amount + " EUR.");
  }

  const rateAlternatives = [...new Set(topRates.map(r => r.rate))];
  const ambiguous = rateAlternatives.length > 1 && !selected.explicit;
  const selectedContext = norm(selected.context);
  const conditionalRule = /(c-gebiet|grw-gebiet|regionalforderung|regionalförderung|einkommensbonus|klimageschwindigkeitsbonus|effizienzbonus|wohneinheit|netto.?grundflache|nettogrundfläche|geb[aä]udefl[aä]che|bonus|staffel|je m2|pro m2)/.test(selectedContext);

  if (ambiguous) {
    return {
      available:false,
      reason:"Mehrere unterschiedliche Förderquoten wurden erkannt. Für eine belastbare Berechnung fehlen noch Auswahlkriterien.",
      alternatives:rateAlternatives,
      rule_text:selected.context,
      missing_inputs:inferMissingInputs(selected.context,{size,target,locality,state})
    };
  }

  if (conditionalRule && !selected.explicit) {
    return {
      available:false,
      reason:"Die Förderquote hängt von zusätzlichen Bedingungen ab.",
      alternatives:rateAlternatives,
      rule_text:selected.context,
      missing_inputs:inferMissingInputs(selected.context,{size,target,locality,state})
    };
  }

  return {
    available:true,
    investment,
    rate:selected.rate,
    eligible_base:eligibleBase,
    raw_amount:Math.round(rawAmount * 100) / 100,
    amount:Math.round(estimatedAmount * 100) / 100,
    max_grant:applicableMaxGrant?.amount || null,
    max_eligible_cost:applicableMaxEligible?.amount || null,
    min_eligible_cost:minEligible?.amount || null,
    min_grant:minGrant?.amount || null,
    confidence:selected.explicit ? "hoch" : "mittel",
    ambiguous:false,
    alternatives:rateAlternatives,
    rule_text:selected.context,
    notes
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=7200");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const url = String(req.query.url || "").trim();
  const investment = Number(req.query.investment || 0) || 0;
  const size = String(req.query.size || "").trim();
  const target = String(req.query.target || "").trim();
  const locality = String(req.query.locality || "").trim();
  const state = String(req.query.state || "").trim();

  const allowed = /^https:\/\/www\.foerderdatenbank\.de\/FDB\/Content\/DE\/Foerderprogramm\//i.test(url);
  if (!allowed) {
    return res.status(400).json({ok:false,error:"Ungültige Programm-URL"});
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        "user-agent":"FoerderRadar-Prototype/0.4 (+https://github.com/xturn2u/foerder_tool)",
        "accept":"text/html,application/xhtml+xml"
      },
      redirect:"follow"
    });
    if (!upstream.ok) {
      return res.status(502).json({ok:false,error:"Programmdetail antwortet mit HTTP " + upstream.status});
    }

    const html = await upstream.text();
    const title = clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
    const text = clean(html);

    const foerderart = extract(text, "Förderart:", ["Förderbereich:"]);
    const foerderbereich = extract(text, "Förderbereich:", ["Fördergebiet:"]);
    const foerdergebiet = extract(text, "Fördergebiet:", ["Förderberechtigte:"]);
    const foerderberechtigte = extract(text, "Förderberechtigte:", ["Fördergeber:"]);
    const foerdergeber = extract(text, "Fördergeber:", ["Ansprechpunkt:", "Weiterführende Links:", "Rechtsgrundlage"]);
    const ansprechpunkt = extract(text, "Ansprechpunkt:", ["Weiterführende Links:", "Rechtsgrundlage"]);
    const rechtsgrundlage = extract(text, "Rechtsgrundlage", ["Drucken", "Service"]);

    const dateMatches = [...text.matchAll(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g)].map(m => m[0]);
    const uniqueDates = [...new Set(dateMatches)].slice(0, 8);
    const deadlineWarning = /Antragstellung .*nicht mehr möglich|musste .* bis zum|Portal .*geschlossen|Deadline .*geschlossen|nicht mehr berücksichtigt|bereits ausgeschöpft/i.test(text);
    const fundingEstimate = estimateFunding(text, investment, size, target, locality, state);
    const fundingLevel = classifyFundingLevel({title, foerdergeber, foerdergebiet, text});

    return res.status(200).json({
      ok:true,
      title,
      foerderart,
      foerderbereich,
      foerdergebiet,
      foerderberechtigte,
      foerdergeber,
      ansprechpunkt,
      rechtsgrundlage: rechtsgrundlage.slice(0, 2200),
      dates: uniqueDates,
      deadline_warning: deadlineWarning,
      funding_estimate: fundingEstimate,
      funding_level: fundingLevel,
      source_url:url,
      attribution:"Quelle: Förderdatenbank des Bundes. Förderbetrag ist eine technische Schätzung auf Basis erkannter Förderquote/Höchstbeträge und keine Förderzusage."
    });
  } catch (err) {
    return res.status(500).json({ok:false,error:"Programmdetail konnte nicht geladen werden: " + (err?.message || "unbekannter Fehler")});
  }
}
