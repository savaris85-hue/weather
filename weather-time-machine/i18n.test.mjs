import test from "node:test";
import assert from "node:assert/strict";
import {translate,setLanguage,getLanguage} from "./i18n.mjs";

test("language switch supports Greek and English without changing weather units",()=>{
  assert.equal(setLanguage("en"),"en");
  assert.equal(getLanguage(),"en");
  assert.equal(translate("Θερμοκρασία"),"Temperature");
  assert.equal(translate("Βροχόπτωση"),"Precipitation");
  assert.equal(translate("Πρόγνωση"),"Forecast");
  assert.equal(translate("3 ημέρες"),"3 days");
  assert.equal(translate("1 ημέρα"),"1 day");
  assert.equal(translate("🌡 °C"),"🌡 °C");
  assert.equal(translate("💨 Bft"),"💨 Bft");
  assert.equal(setLanguage("el"),"el");
  assert.equal(translate("Θερμοκρασία"),"Θερμοκρασία");
  assert.equal(setLanguage("xx"),"el");
});
test("English interface includes the main controls and chart settings",()=>{
  assert.equal(translate("Προγνωστικό μοντέλο","en"),"Forecast model");
  assert.equal(translate("Αναζήτηση πόλης ή περιοχής","en"),"Search for a city or area");
  assert.equal(translate("Χρονογραμμή επιλογής","en"),"Timeline selector");
  assert.equal(translate("Γκρίζες ιστορικές καμπύλες · Κλιματική σύγκριση","en"),
    "Gray reference bands · Climate comparison");
  assert.equal(translate("44 ιστορικά έτη (εκτεταμένη σύγκριση)","en"),
    "Previous 44 years (extended comparison)");
});
