// Bilingual interface only. Meteorological values/units and provider data
// are not changed by switching languages. No machine translation API needed.
export const LANGUAGE_KEY="anagenisis-weather-language-v1";
let activeLanguage="el";
const subscribers=new Set();
const originalText=new WeakMap();
const translatedText=new WeakMap();
const WORDS={
"Ιστορικός καιρός + προγνωστικά μοντέλα σε μία χρονογραμμή":"Historical weather and forecasts on one timeline",
"Οδηγίες":"Help",
"Αναζήτηση πόλης ή περιοχής":"Search for a city or area",
"★ Οι πόλεις μου":"★ My cities",
"☆ Αποθήκευση πόλης":"☆ Save city",
"★ Αποθηκευμένη":"★ Saved",
"Καρφίτσωσε έως 5 πόλεις για γρήγορη εναλλαγή.":"Pin up to five cities for quick switching.",
"Νεφοκάλυψη":"Cloud cover",
"Υγρασία":"Humidity",
"Άνεμος":"Wind",
"Κατεύθυνση":"Direction",
"Πίεση":"Pressure",
"Βροχόπτωση":"Precipitation",
"Radar βροχής · χάρτης OpenStreetMap":"Rain radar · OpenStreetMap",
"Radar 2 ωρών":"2-hour radar",
"Radar ανενεργό":"Radar off",
"Ο χάρτης φορτώνεται από OpenStreetMap. Δεν παρέχεται ζωντανό radar.":"Map tiles from OpenStreetMap. Live radar is not available.",
"Τα ιστορικά στοιχεία είναι αναανάλυση ERA5 (1940–σήμερα), όχι ακριβείς μετρήσεις μετεωρολογικού σταθμού. Τα μοντέλα έχουν διαφορετικά χρονικά όρια και η πιθανότητα βροχής δεν υποστηρίζεται πάντοτε από όλα τα μοντέλα.":"Historical data are ERA5 reanalysis (1940–present), not verified station measurements. Forecast models have different horizons and some do not support precipitation probability.",
"Από (UTC)":"From (UTC)",
"Έως (UTC)":"To (UTC)",
"Προγνωστικό μοντέλο":"Forecast model",
"↻ Φόρτωση":"↻ Load",
"← Πίσω":"← Back",
"Μπροστά →":"Forward →",
"Σήμερα":"Today",
"ΗΜΕΡΟΜΗΝΙΕΣ":"DATES",
"Αναμονή φόρτωσης ιστορικών και προγνωστικών δεδομένων…":"Waiting for historical and forecast weather data…",
"Πλοήγηση:":"Navigation:",
"Σύρε το γράφημα οριζόντια για να μετακινηθείς στον χρόνο, κάνε scroll για zoom, και χρησιμοποίησε το κάτω mini timeline για εύρεση ημερομηνιών. Καθώς προχωράς αριστερά, φορτώνονται αυτόματα παλαιότερα ιστορικά δεδομένα μέχρι το 1940. Τα βελάκια του ανέμου δείχνουν την κατεύθυνση προς την οποία φυσά.":"Drag the chart horizontally to travel through time. Scroll to zoom or use the bottom mini timeline to select dates. Earlier historical data load automatically as you move left, back to 1940. Wind arrows show the direction the wind is blowing toward.",
"Πρόσφατο ιστορικό ERA5":"Recent ERA5 history",
"Πρόγνωση":"Forecast",
"Κλιματικός μέσος και 10–90% προηγούμενων ετών":"Historical mean and 10–90% range from previous years",
"Πορτοκαλί: τώρα":"Orange: now",
"Μοβ: σημερινή ημέρα":"Purple: today",
"Συνεχές zoom, pan, δυναμική φόρτωση ιστορικού":"Zoom, pan and automatic history loading",
"Χρονογραμμή επιλογής":"Timeline selector",
"Σύρε τη φωτισμένη περιοχή ή τα πλαϊνά άκρα για μετακίνηση / zoom":"Drag the highlighted window or its edges to pan / zoom",
"ΑΠΟ":"FROM",
"ΕΩΣ":"TO",
"Φωτισμένη περιοχή:":"Highlighted window:",
"εμφανίζεται στο κύριο γράφημα":"shown in the main chart",
"Φορτωμένο διάστημα: —":"Loaded period: —",
"Layers · Επιλογή γραφημάτων":"Layers · Chart settings",
"Κάθε παράμετρος έχει δικό της χρώμα. Το ιστορικό φαίνεται πιο ανοιχτό και η πρόγνωση πιο σκούρα και έντονη.":"Each weather variable has its own color. Historical values are lighter; forecasts are darker and thicker.",
"Γκρίζες ιστορικές καμπύλες · Κλιματική σύγκριση":"Gray reference bands · Climate comparison",
"Κρυφές · χωρίς κλιματικά στατιστικά":"Off · no climate statistics",
"1 προηγούμενο έτος":"Previous year only",
"2 προηγούμενα έτη":"Previous 2 years",
"3 προηγούμενα έτη":"Previous 3 years",
"10 ιστορικά έτη":"Previous 10 years",
"20 ιστορικά έτη (γρήγορο)":"Previous 20 years",
"44 ιστορικά έτη (εκτεταμένη σύγκριση)":"Previous 44 years (extended comparison)",
"Επιλογή ετών (από–έως)…":"Custom year range…",
"Από έτος":"Start year",
"Έως έτος":"End year",
"Εφαρμογή":"Apply",
"Σύγκριση με το προηγούμενο έτος":"Compare with previous year",
"Το γκρίζο υπόβαθρο δείχνει μέση τιμή και εύρος 10–90% για την ίδια εποχή — όχι μόνο πέρυσι.":"The gray background shows the historical mean and 10–90% range for this season, not just the previous year.",
"Ύψος κάθε γραφήματος":"Chart row height",
"Πάχος γραμμής πρόγνωσης":"Forecast line thickness",
"Χρώματα γραμμών":"Line colors",
"Classic · ξεχωριστά χρώματα ανά παράμετρο":"Classic · colors by variable",
"Ocean · Μπλε / Τυρκουάζ":"Ocean · blue / teal",
"Contrast · Μαύρο / Μωβ":"Contrast · black / purple",
"Προσαρμοσμένα":"Custom",
"Ιστορικό":"History",
"Κλίμα":"Climate",
"Συσσώρευση βροχής":"Precipitation accumulation",
"Ανά ημέρα (reset 00:00 UTC)":"Daily (reset 00:00 UTC)",
"Συνολικά από την αρχή της προβολής":"Total since the start of the view",
"Αποθήκευση":"Save settings",
"Επαναφορά":"Reset",
"Κλείσιμο":"Close",
"Τα layers αναδιατάσσονται αυτόματα. Ορισμένα προγνωστικά δεδομένα μπορεί να μην είναι διαθέσιμα για κάθε μοντέλο ή ιστορική περίοδο. Τα κενά δεν αντικαθίστανται με επινοημένες τιμές.":"Chart rows reorder automatically. Some forecast fields may be unavailable for a selected model or period. Missing values are never invented.",
"Ανεξάρτητη εφαρμογή ανάλυσης ιστορικού και προγνωστικού καιρού. API free tier: μη εμπορική χρήση.":"Independent historical-weather and forecasting app. Free weather API: non-commercial use only.",
"προγνωστική εκτίμηση":"forecast estimate",
"Προγνωστική εκτίμηση":"Forecast estimate",
"Ιστορική αναανάλυση":"Historical reanalysis",
"Πρόσφατη εκτίμηση μοντέλου":"Recent model estimate",
"Ιστορικό ERA5":"ERA5 history",
"Δεν υπάρχουν τρέχοντα δεδομένα":"No current weather data",
"Φόρτωση δεδομένων νέας περιοχής…":"Loading new location…",
"Αναμονή πρόγνωσης":"Waiting for forecast",
"Εντοπισμός κοντινής περιοχής…":"Finding nearby place…",
"Επιλεγμένη περιοχή":"Selected area",
"Αθροιστική βροχή":"Cumulative rainfall",
"Πιθανότητα βροχής":"Rain probability",
"Σχετική υγρασία":"Relative humidity",
"Διεύθυνση ανέμου":"Wind direction",
"Ένταση ανέμου":"Wind speed",
"Ριπές ανέμου":"Wind gusts",
"Ηλιακή ακτινοβολία":"Solar radiation",
"Θερμοκρασία":"Temperature",
"Σημείο δρόσου":"Dew point",
"Ατμοσφαιρική πίεση":"Atmospheric pressure",
"Δείκτης UV":"UV index",
"Καιρός":"Weather",
"Παρ":"Fri","Σαβ":"Sat","Κυρ":"Sun","Δευ":"Mon","Τρι":"Tue","Τετ":"Wed","Πεμ":"Thu",
"Ιαν":"Jan","Φεβ":"Feb","Μαρ":"Mar","Απρ":"Apr","Μαΐ":"May","Ιουν":"Jun","Ιουλ":"Jul","Αυγ":"Aug","Σεπ":"Sep","Οκτ":"Oct","Νοε":"Nov","Δεκ":"Dec"
};
const PHRASES=[
[/^(\d+) ημέρες$/,"$1 days"],
[/^1 ημέρα$/,"1 day"],
[/^Φορτωμένο: (.*)$/,"Loaded: $1"],
[/^Φόρτωση δεδομένων για (.*)…$/,"Loading weather for $1…"],
[/^Πορτοκαλί: τώρα · Μοβ: σήμερα · Γκρίζο: κλιματικό ιστορικό$/,"Orange: now · Purple: today · Gray: climate reference"],
[/^(\d+) σημεία στο γράφημα(.*)$/,"$1 chart points$2"],
[/^Γκρίζες κλιματικές ζώνες: απενεργοποιημένες\.$/,"Gray climate bands: disabled."],
[/^Κλιματική σύγκριση ERA5: (\d+) έτη (.*)$/,"ERA5 climate comparison: $1 years $2"],
[/^Φόρτωση ιστορικής κλιματικής σύγκρισης (.*)$/,"Loading historical climate comparison $1"],
[/^Δεν φορτώθηκαν όλα τα δεδομένα: (.*)$/,"Could not load all weather data: $1"],
[/^Φόρτωση δεδομένων · (.*)$/,"Loading weather · $1"],
[/^✓ Η διάταξη αποθηκεύτηκε στον browser\.$/,"✓ Settings saved in this browser."],
[/^Φόρτωση παλιότερων δεδομένων: (.*)$/,"Loading older weather data: $1"],
[/^Η διάταξη αποθηκεύτηκε στον browser\.$/,"Settings saved in this browser."],
[/^Φόρτωση RainViewer…$/,"Loading RainViewer…"],
[/^Radar προσωρινά μη διαθέσιμο: (.*)$/,"Radar temporarily unavailable: $1"],
[/^Φόρτωση πλησιέστερης περιοχής.*$/,"Finding nearest place…"]
];
function englishValue(source){
  if(Object.prototype.hasOwnProperty.call(WORDS,source))return WORDS[source];
  for(const [pattern,replacement] of PHRASES)if(pattern.test(source))return source.replace(pattern,replacement);
  return source;
}
export function translate(value,language=activeLanguage){
  if(language!=="en" || typeof value!=="string")return value;
  return englishValue(value);
}
export function getLanguage(){return activeLanguage}
export function setLanguage(lang){
  const next=lang==="en"?"en":"el";
  activeLanguage=next;
  try{localStorage.setItem(LANGUAGE_KEY,next)}catch{}
  if(typeof document!=="undefined"){
    document.documentElement.lang=next;
    for(const button of document.querySelectorAll("[data-lang]")){
      const selected=button.dataset.lang===next;
      button.setAttribute("aria-pressed",String(selected));
      button.classList.toggle("active",selected);
    }
    localizePage();
  }
  for(const callback of subscribers)callback(next);
  return next;
}
export function onLanguageChange(callback){
  subscribers.add(callback);
  return ()=>subscribers.delete(callback);
}
export function initLanguage(){
  let next="el";
  try{next=localStorage.getItem(LANGUAGE_KEY)==="en"?"en":"el"}catch{}
  setLanguage(next);
}
function updateTextNode(node){
  if(!node||node.nodeType!==3)return;
  const parent=node.parentElement;
  if(!parent||parent.closest("#plot, #overview, #map, #suggestions, #pinned-cities, #current-place, #place, #chart-title, #chart-subtitle, #status, #climate-status, #current-time, #radar-time, #nav-from-date, #nav-to-date, #nav-duration, #nav-loaded-range, #sticky-date-values, #nav-date-ticks, #layer-options, #pin-current, #period-summary"))return;
  const existing=originalText.get(node);
  const last=translatedText.get(node);
  if(existing===undefined || (node.nodeValue!==last && node.nodeValue!==existing)){
    originalText.set(node,node.nodeValue);
  }
  const original=originalText.get(node);
  const trimmed=original.trim();
  if(!trimmed)return;
  const mapped=translate(trimmed);
  const next=original.replace(trimmed,mapped);
  if(node.nodeValue!==next)node.nodeValue=next;
  translatedText.set(node,next);
}
export function localizePage(){
  if(typeof document==="undefined"||!document.body)return;
  const targets=[
    "#site-header","#location-sidebar","#main-controls","#sticky-dates",
    "#help",".legend-strip",".navigator-shell","#layer-panel",".footerline"
  ];
  for(const selector of targets){
    const root=document.querySelector(selector);
    if(!root)continue;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const textNodes=[];
    while(walker.nextNode())textNodes.push(walker.currentNode);
    for(const node of textNodes)updateTextNode(node);
  }
}
