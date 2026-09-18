const DEV_COUPON = "ENTWICKLUNG10";

function decodeHtml(s = "") {
  const map = {"&amp;":"&","&quot;":"\"","&#39;":"'","&apos;":"'","&lt;":"<","&gt;":">","&nbsp;":" ","&auml;":"ä","&ouml;":"ö","&uuml;":"ü","&Auml;":"Ä","&Ouml;":"Ö","&Uuml;":"Ü","&szlig;":"ß","&ndash;":"–","&mdash;":"—","&euro;":"€"};
  return String(s).replace(/&(?:amp|quot|#39|apos|lt|gt|nbsp|auml|ouml|uuml|Auml|Ouml|Uuml|szlig|ndash|mdash|euro);/g,m=>map[m]||m)
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}
function clean(s=""){return decodeHtml(String(s).replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim()}
function norm(s=""){return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")}
function moneyToNumber(raw=""){const v=String(raw).replace(/\./g,"").replace(",",".").replace(/[^0-9.]/g,"");const n=Number(v);return Number.isFinite(n)?n:null}
function contextAround(text,index,length,radius=240){return text.slice(Math.max(0,index-radius),Math.min(text.length,index+length+radius)).trim()}
function uniqueBy(arr,keyFn){const seen=new Set();return arr.filter(x=>{const k=keyFn(x);if(seen.has(k))return false;seen.add(k);return true})}
function labelValue(text,label,nextLabels=[]){
  const esc=x=>x.replace(/[.*+?^$()|[\]\\{}]/g,"\\$&");
  const ends=nextLabels.map(esc).join("|");
  const re=new RegExp(esc(label)+"\\s*(.*?)(?="+(ends||"$")+"|$)","i");
  return (text.match(re)?.[1]||"").trim();
}

function safeExternalUrl(href,baseUrl){
  try{
    const u=new URL(decodeHtml(href),baseUrl);
    if(u.protocol!=="https:") return null;
    const h=u.hostname.toLowerCase();
    if(h==="localhost"||h.endsWith(".local")||/^\d+\.\d+\.\d+\.\d+$/.test(h))return null;
    if(h==="foerderdatenbank.de"||h.endsWith(".foerderdatenbank.de"))return null;
    return u.toString();
  }catch{return null}
}
function extractExternalLinks(html,baseUrl){
  const links=[];
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const m of html.matchAll(re)){
    const url=safeExternalUrl(m[1],baseUrl);
    if(!url)continue;
    const label=clean(m[2]||"");
    const hay=norm(label+" "+url);
    if(/datenschutz|impressum|barrierefreiheit|kontaktformular|rss|facebook|linkedin|youtube|instagram|tracking/.test(hay))continue;
    let score=0;
    if(/informationen zum|forderung|foerderung|forderprogramm|foerderprogramm/.test(hay))score+=28;
    if(/antragstellung|antrag stellen|antragsportal|forderportal|foerderportal|online.?antrag/.test(hay))score+=42;
    if(/richtlinie|merkblatt|konditionen|forderung im detail|foerderung im detail/.test(hay))score+=20;
    if(/kfw\.de|bafa\.de|digitalbonus\.bayern|lfa\.de|nrwbank\.de|ibb\.de|bayern\.de|stmwi\.bayern\.de|bund\.de|arbeitsagentur\.de|gesetze-bayern\.de/.test(hay))score+=18;
    links.push({label:label||new URL(url).hostname,url,score});
  }
  return uniqueBy(links.sort((a,b)=>b.score-a.score),x=>x.url);
}
async function fetchHtml(url){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),6500);
  try{
    const r=await fetch(url,{headers:{"user-agent":"FoerderRadar/0.7 (+https://github.com/xturn2u/foerder_tool)","accept":"text/html,application/xhtml+xml"},redirect:"follow",signal:ctrl.signal});
    if(!r.ok)throw new Error("HTTP "+r.status);
    const type=r.headers.get("content-type")||"";
    if(!/text\/html|application\/xhtml/i.test(type))throw new Error("kein HTML");
    const html=await r.text();
    return {html,url:r.url||url};
  }finally{clearTimeout(timer)}
}

function detectMissing(text,profile){
  const c=norm(text); const out=[];
  const add=(key,label,question)=>{if(!out.some(x=>x.key===key))out.push({key,label,question})};
  if(/kleinstunternehmen|kleine unternehmen|mittlere unternehmen|grossunternehmen|große unternehmen|\bkmu\b/.test(c)&&norm(profile.target)==="unternehmen"&&!profile.size)add("company_size","Unternehmensgröße","Wie groß ist dein Unternehmen?");
  if(/c-gebiet|grw-gebiet|gebietskulisse|regionalforderung|regionalförderung/.test(c)&&!profile.locality)add("location","genauer Investitionsort","Wo genau wird das Vorhaben umgesetzt?");
  if(/einkommensbonus|haushaltsjahreseinkommen|zu versteuerndes einkommen/.test(c))add("income","Haushaltsjahreseinkommen","Wie hoch ist das maßgebliche Haushaltsjahreseinkommen?");
  if(/netto.?grundflache|nettogrundfläche|geb[aä]udefl[aä]che|wohnfl[aä]che|nutzfl[aä]che/.test(c))add("building_area","Gebäude-/Nettogrundfläche","Wie groß ist die relevante Gebäude- bzw. Nettogrundfläche?");
  if(/wohneinheit|anzahl der wohnungen/.test(c))add("housing_units","Anzahl Wohneinheiten","Wie viele Wohneinheiten sind betroffen?");
  if(/de-minimis|deminimis|beihilfeintensit[aä]t|beihilferecht/.test(c))add("state_aid","De-minimis-/Beihilfen","Welche De-minimis- oder sonstigen Beihilfen wurden bereits erhalten?");
  if(/vor beginn|vorhabenbeginn|vor projektbeginn|noch nicht begonnen|antrag.*vor.*beginn/.test(c))add("project_started","Projekt bereits begonnen?","Wurde das Vorhaben bereits verbindlich begonnen oder beauftragt?");
  if(/bonus|effizienzbonus|klimageschwindigkeitsbonus/.test(c))add("bonus_conditions","Bonusvoraussetzungen","Welche technischen bzw. Bonusvoraussetzungen treffen zu?");
  return out;
}
function detectRisks(text){
  const c=norm(text); const out=[];
  const add=(level,title,detail)=>{if(!out.some(x=>x.title===title))out.push({level,title,detail})};
  if(/antrag.*vor.*beginn|vorhabenbeginn|vor projektbeginn/.test(c))add("critical","Vorhabenbeginn beachten","Ein förderschädlicher Projekt- oder Maßnahmenbeginn vor Antrag/Zusage kann möglich sein. Die genaue Regel muss vor Auftrag geprüft werden.");
  if(/aufschiebende|auflosende bedingung|auflösende bedingung/.test(c))add("critical","Vertragsklausel erforderlich","Die Primärquelle nennt besondere Bedingungen für Lieferungs- oder Leistungsverträge.");
  if(/de-minimis|deminimis/.test(c))add("warning","Beihilferecht prüfen","De-minimis- bzw. beihilferechtliche Grenzen können die Förderung beeinflussen.");
  if(/haushaltsmittel|mittel.*vorbehalt|kein rechtsanspruch/.test(c))add("info","Kein Rechtsanspruch","Die Bewilligung kann unter Haushalts- oder Verfügbarkeitsvorbehalt stehen.");
  if(/kontingent|ausgeschopft|ausgeschöpft/.test(c))add("warning","Kontingent/Verfügbarkeit","Das Programm kann kontingentiert oder zeitweise ausgeschöpft sein.");
  return out;
}
function detectDocuments(text){
  const c=norm(text); const out=[];
  const add=x=>{if(!out.includes(x))out.push(x)};
  if(/angebot|kostenvoranschlag/.test(c))add("Angebot bzw. Kostenaufstellung");
  if(/bza|bestatigung zum antrag|bestätigung zum antrag/.test(c))add("Bestätigung zum Antrag (BzA/gBzA), sofern zutreffend");
  if(/de-minimis|deminimis/.test(c))add("De-minimis-Erklärung / Beihilfenachweise");
  if(/handelsregister|gewerbeanmeldung/.test(c))add("Unternehmensnachweis");
  if(/projektbeschreibung|vorhabenbeschreibung/.test(c))add("Projekt- bzw. Vorhabenbeschreibung");
  if(/fachunternehmen|energieeffizienz-experte|energieeffizienzexperte/.test(c))add("Bestätigung/Nachweis durch Fachunternehmen oder Experten");
  if(!out.length){add("Projektbeschreibung");add("Kosten-/Investitionsnachweis");add("Nachweise gemäß offizieller Richtlinie")}
  return out;
}
function rateCandidates(text,source){
  const rows=[];
  for(const m of text.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)){
    const rate=Number(m[1].replace(",","."));
    if(!(rate>0&&rate<=100))continue;
    const context=contextAround(text,m.index,m[0].length,260);
    const c=norm(context);
    if(!/(zuschuss|forderquote|foerderquote|forderung|foerderung|zuwendung|beihilfe|forderfahige|förderfähige)/.test(c))continue;
    let score=source.kind==="primary"?35:15;
    if(/forderquote|foerderquote|zuschuss in hohe|zuschuss in höhe|bis zu|maximal/.test(c))score+=15;
    if(/darlehen|zins|effektivzins/.test(c)&&!/zuschuss/.test(c))score-=25;
    rows.push({rate,score,context,source});
  }
  return rows.sort((a,b)=>b.score-a.score||b.rate-a.rate);
}
function moneyRules(text,source){
  const rows=[];
  for(const m of text.matchAll(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*(?:EUR|Euro)/gi)){
    const amount=moneyToNumber(m[1]); if(!amount)continue;
    const context=contextAround(text,m.index,m[0].length,230); const c=norm(context);
    let type="";
    if(/forderfahige|förderfähige|zuwendungsfahige|zuwendungsfähige/.test(c)&&/(maximal|hochstens|höchstens|bis zu|forderhochstbetrag|förderhöchstbetrag)/.test(c))type="max_eligible";
    else if(/zuschuss|forderung|förderung|foerderung|zuwendung/.test(c)&&/(maximal|hochstens|höchstens|bis zu|forderhochstbetrag|förderhöchstbetrag)/.test(c))type="max_grant";
    if(type)rows.push({type,amount,context,source,score:(source.kind==="primary"?30:10)});
  }
  return rows.sort((a,b)=>b.score-a.score);
}
function shortEvidence(context){
  const s=clean(context);
  return s.length>260?s.slice(0,257)+"…":s;
}
function calculateFunding(sources,profile){
  const rates=sources.flatMap(s=>rateCandidates(s.text,s));
  const rules=sources.flatMap(s=>moneyRules(s.text,s));
  if(!(Number(profile.investment)>0))return {available:false,reason:"Keine Investitionssumme angegeben.",missing:["Investitionssumme / Projektbudget"]};
  if(!rates.length)return {available:false,reason:"Keine eindeutige Förderquote in den ausgewerteten Quellen erkannt."};

  const bestScore=rates[0].score;
  const top=rates.filter(x=>x.score>=bestScore-3);
  const distinct=[...new Set(top.map(x=>x.rate))];
  const chosen=top[0];
  const combined=norm(top.map(x=>x.context).join(" "));
  const conditional=/(bonus|c-gebiet|grw-gebiet|wohneinheit|nettogrundflache|netto-grundflache|staffel|einkommen|je m2|pro m2)/.test(combined);
  if(distinct.length>1||conditional){
    return {available:false,reason:"Die Quellen enthalten mehrere oder bedingte Förderquoten. Eine einzelne Zahl wäre ohne weitere Angaben nicht belastbar.",alternatives:distinct,source:{label:chosen.source.label,url:chosen.source.url},evidence:shortEvidence(chosen.context)};
  }

  const maxEligible=rules.find(x=>x.type==="max_eligible");
  const maxGrant=rules.find(x=>x.type==="max_grant");
  const investment=Number(profile.investment);
  const base=maxEligible?Math.min(investment,maxEligible.amount):investment;
  const raw=base*chosen.rate/100;
  const amount=maxGrant?Math.min(raw,maxGrant.amount):raw;
  return {
    available:true,investment,rate:chosen.rate,eligible_base:base,raw_amount:Math.round(raw*100)/100,amount:Math.round(amount*100)/100,
    max_eligible_cost:maxEligible?.amount||null,max_grant:maxGrant?.amount||null,
    source:{label:chosen.source.label,url:chosen.source.url,kind:chosen.source.kind},
    evidence:shortEvidence(chosen.context),
    formula:(maxEligible&&investment>maxEligible.amount?"min("+investment+" €, "+maxEligible.amount+" €)":" "+base+" €")+" × "+chosen.rate+" %"+(maxGrant?"; Deckel "+maxGrant.amount+" €":""),
    confidence:chosen.source.kind==="primary"?"hoch":"mittel"
  };
}
function criterionChecks(fdb,profile,combinedText){
  const rows=[];
  const who=norm(fdb.foerderberechtigte); const target=norm(profile.target);
  let targetPass=false;
  if(target==="unternehmen")targetPass=/unternehmen|existenzgrunder|existenzgründer/.test(who);
  else if(target==="privatperson")targetPass=/privatperson|naturliche person|natürliche person/.test(who);
  else if(target==="grunder"||target==="gründer")targetPass=/existenzgrunder|existenzgründer|unternehmen/.test(who);
  else targetPass=who.includes(target);
  rows.push({label:"Zielgruppe",status:targetPass?"pass":"open",detail:targetPass?"passt zur Programmbeschreibung":"muss anhand der Richtlinie bestätigt werden"});

  const area=norm(fdb.foerdergebiet);
  const state=norm(profile.state);
  const areaPass=/bundesweit|deutschland/.test(area)||(state&&area.includes(state));
  rows.push({label:"Fördergebiet",status:areaPass?"pass":"open",detail:areaPass?"passt zum angegebenen Bundesland":"genauen Standort bzw. Fördergebiet prüfen"});

  if(profile.investment)rows.push({label:"Investitionssumme",status:"pass",detail:Number(profile.investment).toLocaleString("de-DE")+" € angegeben"});
  else rows.push({label:"Investitionssumme",status:"open",detail:"noch nicht angegeben"});

  if(/vorhabenbeginn|vor projektbeginn|antrag.*vor.*beginn/.test(norm(combinedText)))rows.push({label:"Vorhabenbeginn",status:"open",detail:"muss vor Auftrag/Start ausdrücklich geprüft werden"});
  return rows;
}
function draftTexts(profile,title){
  const q=clean(profile.q||"");
  const investment=Number(profile.investment)||0;
  const project=q||"das geplante Vorhaben";
  return {
    project_description:"Geplant ist "+project+". Das Vorhaben soll im Fördergebiet "+(profile.state||"Deutschland")+(profile.locality?" am Standort "+profile.locality:"")+" umgesetzt werden"+(investment?" und umfasst ein geplantes Investitionsvolumen von "+investment.toLocaleString("de-DE")+" €":"")+".",
    funding_rationale:"Für das Vorhaben wird eine Förderung im Programm „"+title+"“ geprüft. Ziel ist es, die geplante Investition programmgerecht umzusetzen und die in der Richtlinie vorgesehenen Fördervoraussetzungen vor Maßnahmenbeginn vollständig nachzuweisen."
  };
}
function extractApplicationLinks(html,baseUrl){
  return extractExternalLinks(html,baseUrl).filter(x=>/antrag|portal|formular/.test(norm(x.label+" "+x.url))).slice(0,5);
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Access-Control-Allow-Origin","*");

  const url=String(req.query.url||"").trim();
  const code=String(req.query.code||"").trim().toUpperCase().replace(/\s+/g,"");
  if(code!==DEV_COUPON)return res.status(402).json({ok:false,error:"Persönliche Förderprüfung nicht freigeschaltet."});
  if(!/^https:\/\/www\.foerderdatenbank\.de\/FDB\/Content\/DE\/Foerderprogramm\//i.test(url))return res.status(400).json({ok:false,error:"Ungültige Programm-URL"});

  const profile={
    target:String(req.query.target||"").trim(),size:String(req.query.size||"").trim(),state:String(req.query.state||"").trim(),
    locality:String(req.query.locality||"").trim(),investment:Number(req.query.investment||0)||0,start:String(req.query.start||"").trim(),
    q:String(req.query.q||"").trim().slice(0,500)
  };

  try{
    const fdbFetched=await fetchHtml(url);
    const fdbHtml=fdbFetched.html; const fdbText=clean(fdbHtml);
    const title=clean(fdbHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||"");
    const fdb={
      foerderart:labelValue(fdbText,"Förderart:",["Förderbereich:"]),
      foerderbereich:labelValue(fdbText,"Förderbereich:",["Fördergebiet:"]),
      foerdergebiet:labelValue(fdbText,"Fördergebiet:",["Förderberechtigte:"]),
      foerderberechtigte:labelValue(fdbText,"Förderberechtigte:",["Fördergeber:"]),
      foerdergeber:labelValue(fdbText,"Fördergeber:",["Ansprechpunkt:","Weiterführende Links:","Rechtsgrundlage"]),
      ansprechpunkt:labelValue(fdbText,"Ansprechpunkt:",["Weiterführende Links:","Rechtsgrundlage"])
    };

    const external=extractExternalLinks(fdbHtml,url);
    const preferred=external.filter(x=>x.score>=18).slice(0,3);
    const primary=[];
    for(const link of preferred){
      if(primary.length>=2)break;
      try{
        const fetched=await fetchHtml(link.url);
        const text=clean(fetched.html);
        if(text.length<500)continue;
        primary.push({kind:"primary",label:link.label||new URL(fetched.url).hostname,url:fetched.url,text,html:fetched.html});
      }catch{}
    }

    const sources=[
      {kind:"directory",label:"Förderdatenbank des Bundes",url,text:fdbText,html:fdbHtml},
      ...primary
    ];
    const combined=sources.map(x=>x.text).join(" ");
    const missing=detectMissing(combined,profile);
    const risks=detectRisks(combined);
    const documents=detectDocuments(combined);
    const calculation=calculateFunding(sources,profile);
    const criteria=criterionChecks(fdb,profile,combined);
    const applications=uniqueBy([
      ...extractApplicationLinks(fdbHtml,url),
      ...primary.flatMap(x=>extractApplicationLinks(x.html,x.url))
    ],x=>x.url).slice(0,6);

    return res.status(200).json({
      ok:true,title,profile,
      verification:{
        status:primary.length?"primary_verified":"fdb_only",
        label:primary.length?"Primärquelle geprüft":"Nur Förderdatenbank verfügbar",
        sources:sources.map(x=>({kind:x.kind,label:x.label,url:x.url}))
      },
      criteria,
      calculation,
      missing_inputs:missing,
      risks,
      documents,
      drafts:draftTexts(profile,title),
      application_links:applications,
      contact:fdb.ansprechpunkt,
      program:{...fdb,source_url:url},
      disclaimer:"Automatisierte Vorprüfung, keine Förderzusage. Maßgeblich sind die aktuellen Bedingungen des Fördergebers."
    });
  }catch(err){
    return res.status(500).json({ok:false,error:"Persönliche Förderprüfung fehlgeschlagen: "+(err?.message||"unbekannter Fehler")});
  }
}
