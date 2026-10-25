const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let passed = 0;
const checks = [];
function check(label, condition) {
  if (!condition) throw new Error("FAIL " + label);
  passed += 1;
  checks.push("PASS " + label);
}

const home = read("app/page.tsx");
const form = read("components/booking/BookingForm.tsx");
const flag = read("lib/feature-flags.ts");
const translations = ["en", "sk", "de", "uk"].map((lang) => read("lib/i18n/translations/" + lang + ".ts"));

check("hero badge key is rendered", home.includes('t("hero.badge2")'));
check("hero H1 key is rendered", home.includes('t("hero.title")'));
check("accessible CTA uses canonical preselection", home.includes('href="/book?service=accessible"') && home.includes('t("hero.bookAccessible")'));
check("airport CTA uses canonical preselection", home.includes('href="/book?service=airport"') && home.includes('t("hero.bookAirport")'));
check("homepage priority order is accessible, airport, standard", home.indexOf('serviceType: "accessible"') < home.indexOf('serviceType: "airport"') && home.indexOf('serviceType: "airport"') < home.indexOf('serviceType: "standard"'));
check("homepage preserves Children feature filtering", home.includes('isCustomerServiceEnabled(service.serviceType)'));
check("booking selector order is accessible, airport, standard", form.indexOf('value: "accessible"') < form.indexOf('value: "airport"') && form.indexOf('value: "airport"') < form.indexOf('value: "standard"'));
check("booking selector preserves Children feature filtering", form.includes('isCustomerServiceEnabled(service.value)') && flag.includes("NEXT_PUBLIC_CHILDREN_TRANSPORT_ENABLED"));
check("booking selector uses real images", form.includes("Image") && form.includes("/drivo-wav-wheelchair.jpeg") && form.includes("/drivo-airport-transfer.jpeg") && form.includes("/drivo-taxi-service.jpeg"));
check("booking cards expose accessible pressed state", form.includes("aria-pressed={serviceType === s.value}") && form.includes("focus-visible:ring"));
check("booking cards are image-led", form.includes('className="relative h-32 overflow-hidden"') && !form.includes("{s.icon} {s.label}"));
for (const lang of translations) {
  check("localized hero copy includes badge, CTA and headline", lang.includes('"hero.badge2"') && lang.includes('"hero.bookAccessible"') && lang.includes('"hero.bookAirport"') && lang.includes('"hero.title"') && lang.includes('"hero.subtitle"'));
}
check("WAV booking decision flow remains present", form.includes("passengerRemainsInWheelchair") && form.includes("canTransferToSeat"));
check("no pricing or dispatch source is imported by visual update", !home.includes("booking-quote") && !form.includes("dispatch-matching"));

console.log(checks.join("\n"));
console.log("Homepage/service priority checks: " + passed + "/" + checks.length + " passed");
