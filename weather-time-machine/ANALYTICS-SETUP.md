# Απλά στατιστικά επισκεψιμότητας · Anagenisis Meteo

## Τι επιλέξαμε

Cloudflare Web Analytics (δωρεάν, privacy-first, χωρίς cookies/διαφημίσεις). Δεν αλλάζει το domain ή τον Render host. Το έργο είναι `https://anagenisis-meteo.onrender.com/`.

Η εφαρμογή περιέχει τον προαιρετικό φορτωτή `analytics.mjs`, αλλά **δεν καταγράφει επισκέψεις έως ότου ο ιδιοκτήτης ενεργοποιήσει τον προσωπικό του Cloudflare Web Analytics site token** στο `analytics-config.mjs`. Δεν υπάρχει προεγκατεστημένος λογαριασμός ή κοινόχρηστος token. Δεν χρειάζεται να αλλάξει το UI, η πρόγνωση ή ο πάροχος Open-Meteo.

## Πώς ενεργοποιείται

1. Άνοιξε https://dash.cloudflare.com/ και δημιούργησε / συνδέσου σε δικό σου δωρεάν Cloudflare account.
2. Από το Cloudflare dashboard → **Web Analytics** → **Add a site**.
3. Πληκτρολόγησε το hostname **`anagenisis-meteo.onrender.com`** (χωρίς `https://`, χωρίς διαδρομές), επέλεξε την προτεινόμενη καταχώριση και **Done**.
4. Στο **Manage site**, αντέγραψε μόνο το **token** (UUID), μέσα από το snippet. Μην μοιραστείς κωδικούς ή πρόσβαση στον λογαριασμό.
5. Αντικατάστησε το κενό string στο `weather-time-machine/analytics-config.mjs`:
   `export const CLOUDFLARE_WEB_ANALYTICS_TOKEN = "το-δικό-σου-uuid";`
6. Κάνε commit στο `main`· ο Render Blueprint παρακολουθεί αυτό το branch και θα κάνει τη νέα δημοσίευση. Στο Cloudflare → **Web Analytics** → επίλεξε το site για να βλέπεις επισκέπτες, προβολές, πηγές επισκεψιμότητας και άλλα βασικά συγκεντρωτικά στοιχεία.

Ο UUID site token ταυτοποιεί την ιδιοκτησία των μετρήσεων· **δεν είναι API key** και το Cloudflare τον ενσωματώνει δημόσια στο frontend. Μην δημοσιεύεις όμως Cloudflare API tokens ή account credentials.

Οι αναφορές μπορεί να καθυστερούν λίγα λεπτά και κάποια browsers/adblockers μπορεί να αποκλείσουν το beacon. Οι μετρήσεις είναι προσεγγιστικές, όχι ακριβής καταμέτρηση όλων των ανθρώπων. Στο Cloudflare Free τα συγκεντρωτικά δεδομένα ιστορικού Web Analytics διατηρούνται για περιορισμένο χρόνο (σύμφωνα με τους τρέχοντες όρους τους). Επιβεβαίωσε και τις απαιτήσεις προστασίας δεδομένων/ενημέρωσης επισκεπτών για το site σου.

## Τι να παρακολουθήσεις πριν από οποιαδήποτε απόφαση Google Ads

Για 2–3 μήνες παρακολούθησε μοναδικούς επισκέπτες, pageviews, χώρες, παραπομπές/μηχανές αναζήτησης και επανερχόμενη ζήτηση όπου παρέχεται. Μην συμπεραίνεις έσοδα μόνο από επισκέπτες: το RPM διαφέρει δραστικά ανά γεωγραφική περιοχή και θέμα, και η Google μπορεί να μη εγκρίνει το site.

**Όροι Open-Meteo:** https://open-meteo.com/en/terms — η εθελοντική υποστήριξη χωρίς κλειδωμένες λειτουργίες επιτρέπεται, αλλά διαφημίσεις και affiliate links είναι εμπορική χρήση και χρειάζονται εμπορική άδεια. Για ιστορικά δεδομένα ERA5: https://open-meteo.com/en/pricing — Professional ή ανώτερο. Μια ενδεχόμενη εμπορική δραστηριότητα / προβολή της εταιρείας σου μπορεί να χαρακτηριστεί εμπορική ακόμη και χωρίς Google Ads. Δεν μπορούμε να ελέγξουμε αν τρίτοι ιστότοποι με διαφημίσεις έχουν συμβόλαιο Open-Meteo· δεν πρέπει να υποθέτουμε ότι το παρακάμπτουν.

## Επίσημες οδηγίες

- https://developers.cloudflare.com/web-analytics/get-started/
- https://developers.cloudflare.com/web-analytics/about/
- https://developers.cloudflare.com/web-analytics/faq/
