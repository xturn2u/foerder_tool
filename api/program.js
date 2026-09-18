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

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=7200");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const url = String(req.query.url || "").trim();
  const allowed = /^https:\/\/www\.foerderdatenbank\.de\/FDB\/Content\/DE\/Foerderprogramm\//i.test(url);
  if (!allowed) {
    return res.status(400).json({ok:false,error:"Ungültige Programm-URL"});
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        "user-agent":"FoerderRadar-Prototype/0.3 (+https://github.com/xturn2u/foerder_tool)",
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

    const dateMatches = [...rechtsgrundlage.matchAll(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g)].map(m => m[0]);
    const uniqueDates = [...new Set(dateMatches)].slice(0, 8);
    const deadlineWarning = /Antragstellung .*nicht mehr möglich|musste .* bis zum|Portal .*geschlossen|Deadline .*geschlossen|nicht mehr berücksichtigt/i.test(text);

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
      source_url:url,
      attribution:"Quelle: Förderdatenbank des Bundes. Maßgeblich sind die offiziellen Programmbedingungen."
    });
  } catch (err) {
    return res.status(500).json({ok:false,error:"Programmdetail konnte nicht geladen werden: " + (err?.message || "unbekannter Fehler")});
  }
}
