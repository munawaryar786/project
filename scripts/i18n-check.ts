import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import translations, { getTranslation, locales } from "../lib/i18n";
import { foundation } from "../lib/i18n/translations/foundation";
import { acceptLanguageLocale, browserLocale, cookieLocale, isUiLocale, localeCookieValue, normalizeStoredLocale, resolveClientLocale, resolveServerLocale } from "../lib/i18n/locale-resolution";
import { isPublicMetadataRoute, openGraphLocales, publicMetadataCopy, publicPageMetadata, rootMetadataCopy, type PublicMetadataRoute } from "../lib/i18n/metadata";
import { formatEuro, formatMarketDateTime, formatNumber, pluralCategory } from "../lib/i18n/format";
import { MESSAGE_CODE_KEYS, presentMessage } from "../lib/i18n/message-catalog";
import { BOOKING_STATES, DISPATCH_STATES, DRIVER_OFFER_STATES, DRIVER_STATES, PAYMENT_STATES, presentStatus, statusKey } from "../lib/i18n/status-catalog";

const root = process.cwd();
const localeFiles = locales.map((locale) => path.join(root, "lib/i18n/translations", `${locale}.ts`));
const effective = Object.fromEntries(locales.map((locale) => [locale, translations[locale]]));
const baseKeys = Object.keys(translations.en).sort();

function sourceFile(file: string) {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function propertyKey(property: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(property)) return null;
  return ts.isStringLiteral(property.name) || ts.isIdentifier(property.name) ? property.name.text : null;
}

function objectKeys(object: ts.ObjectLiteralExpression): string[] {
  return object.properties.map(propertyKey).filter((key): key is string => key !== null);
}

function assertNoDuplicateDefinitions(file: string) {
  const source = sourceFile(file);
  const objects: ts.ObjectLiteralExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) objects.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const object of objects) {
    const keys = objectKeys(object);
    assert.equal(new Set(keys).size, keys.length, `Duplicate dictionary definition in ${file}`);
  }
  // Translation sources contain only dictionary declarations and their final
  // spread. An effective key must be defined once per locale, not overridden.
  const keys = objects.flatMap(objectKeys);
  assert.equal(new Set(keys).size, keys.length, `Overridden dictionary key in ${file}`);
  return keys;
}

for (const file of [...localeFiles, path.join(root, "lib/i18n/translations/foundation.ts")]) {
  if (file.endsWith("foundation.ts")) {
    const source = sourceFile(file);
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const keys = objectKeys(node);
        assert.equal(new Set(keys).size, keys.length, `Duplicate M2 key in ${file}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  } else {
    const existing = new Set(assertNoDuplicateDefinitions(file));
    const locale = path.basename(file, ".ts") as keyof typeof foundation;
    for (const key of Object.keys(foundation[locale])) {
      assert.ok(!existing.has(key), `M2 overlay would silently replace ${locale}:${key}`);
    }
  }
}

for (const locale of locales) {
  const keys = Object.keys(effective[locale]).sort();
  assert.deepEqual(keys, baseKeys, `${locale} dictionary key parity`);
  for (const key of keys) {
    const value = effective[locale][key];
    assert.equal(typeof value, "string", `${locale}:${key} is not text`);
    assert.ok(value.trim(), `${locale}:${key} is blank`);
    const placeholders = [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map((match) => match[1]).sort();
    const englishPlaceholders = [...translations.en[key].matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(placeholders, englishPlaceholders, `${locale}:${key} placeholder mismatch`);
    assert.ok(!/<\/?[a-z][^>]*>/i.test(value), `${locale}:${key} contains HTML`);
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

const literals = new Set<string>();
const computed: string[] = [];
for (const file of [...walk(path.join(root, "app")), ...walk(path.join(root, "components"))]) {
  const source = sourceFile(file);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t" && node.arguments.length) {
      const first = node.arguments[0];
      if (ts.isStringLiteral(first)) literals.add(first.text);
      else computed.push(`${path.relative(root, file)}:${source.getLineAndCharacterOfPosition(first.getStart(source)).line + 1} ${first.getText(source)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
const missingLiterals = [...literals].filter((key) => !Object.hasOwn(translations.en, key)).sort();
assert.deepEqual(missingLiterals, [], "Literal UI translation keys missing");

const dynamicKeys = [
  ...[1, 2, 3, 4].flatMap((n) => [`faq.q${n}`, `faq.a${n}`]),
  ...["1 week", "2 weeks", "1 month", "Custom"].map((duration) => `rental.duration.${duration}`),
  ...["one", "few", "many", "other"].map((category) => `driverPortal.passengers.${category}`),
  ...["STANDARD", "ACCESSIBLE", "SENIOR", "CHILDREN", "AIRPORT", "RENTAL"].flatMap((service) => [
    `service.${service}`, `services.${service.toLowerCase()}.title`,
  ]),
  ...["NONE", "SMALL", "LARGE"].map((luggage) => `luggage.${luggage}`),
  ...["CARD", "CASH", "INVOICE"].map((method) => `payment.${method}`),
  ...["AVAILABLE", "OFFLINE", "BUSY", "LOCATION_NOT_READY"].map((state) => `driverPortal.presence.${state}`),
  ...["PENDING", "PAID", "FAILED", "EXPIRED", "CANCELLED", "PAY_ON_RIDE", "INVOICE"].map((state) => `dispatch.payment.${state}`),
  ...["sk", "de", "uk", "en"].map((locale) => `language.option.${locale}`),
  ...BOOKING_STATES.map((state) => statusKey("booking", state)),
  ...PAYMENT_STATES.map((state) => statusKey("payment", state)),
  ...DISPATCH_STATES.map((state) => statusKey("dispatch", state)),
  ...DRIVER_STATES.map((state) => statusKey("driver", state)),
  ...DRIVER_OFFER_STATES.map((state) => statusKey("driverOffer", state)),
  ...Object.values(MESSAGE_CODE_KEYS),
];
for (const key of dynamicKeys) assert.ok(Object.hasOwn(translations.en, key), `Computed/catalog key missing: ${key}`);

assert.equal(isUiLocale("en"), true);
assert.equal(isUiLocale("cs"), false);
assert.equal(normalizeStoredLocale("cs"), "sk");
assert.equal(normalizeStoredLocale("slovak"), "sk");
assert.equal(normalizeStoredLocale("de"), "de");
assert.equal(normalizeStoredLocale("unsafe"), null);
assert.equal(browserLocale(["fr-FR", "uk-UA"]), "uk");
assert.equal(cookieLocale("other=1; drivo-language=de; x=2"), "de");
assert.equal(cookieLocale("drivo-language=unsafe"), null);
assert.equal(resolveClientLocale({ selected: "en", cookie: "drivo-language=de", browserLanguages: ["sk-SK"] }), "de");
assert.equal(resolveClientLocale({ selected: "bad", cookie: "drivo-language=de", browserLanguages: ["uk-UA"] }), "de");
assert.equal(resolveClientLocale({ browserLanguages: ["cs-CZ"] }), "sk");
assert.equal(resolveClientLocale({ selected: "uk", cookie: "drivo-language=invalid", browserLanguages: ["de-DE"] }), "uk");
assert.equal(acceptLanguageLocale("fr-FR, de-DE;q=0.8, en-GB;q=0.9"), "en");
assert.equal(acceptLanguageLocale("de-DE;q=0, uk-UA;q=0.7"), "uk");
assert.equal(acceptLanguageLocale("cs-CZ, en;q=0.5"), "sk");
assert.equal(acceptLanguageLocale("de;q=1.1, en;q=0.4"), "en");
assert.equal(acceptLanguageLocale("*, fr-FR;q=0.8"), null);
assert.equal(resolveServerLocale({ cookie: "de", acceptLanguage: "uk-UA" }), "de");
assert.equal(resolveServerLocale({ cookie: "<script>", acceptLanguage: "uk-UA" }), "uk");
assert.equal(resolveServerLocale({ cookie: "", acceptLanguage: "fr-FR" }), "sk");
assert.ok(localeCookieValue("en", true).includes("SameSite=Lax; Secure"));

const metadataRoutes: PublicMetadataRoute[] = ["/", "/about", "/accessible-transport", "/airport", "/car-rental", "/children", "/contact", "/faq", "/rental", "/seniors", "/taxi"];
for (const route of metadataRoutes) {
  assert.ok(isPublicMetadataRoute(route));
  for (const locale of locales) {
    const content = publicMetadataCopy(route, locale);
    assert.ok(content.title.trim() && content.description.trim(), `${route}:${locale} metadata copy`);
    if (route !== "/") {
      const metadata = publicPageMetadata(route, locale);
      assert.equal(metadata.alternates?.canonical, route, `${route}:${locale} canonical`);
      assert.equal(metadata.openGraph?.locale, openGraphLocales[locale], `${route}:${locale} OG locale`);
      assert.equal(metadata.openGraph?.title, content.title, `${route}:${locale} OG title`);
      assert.equal(metadata.description, content.description, `${route}:${locale} description`);
      assert.equal(metadata.twitter?.title, content.title, `${route}:${locale} Twitter title`);
    }
  }
}
assert.notEqual(rootMetadataCopy("en", false).description, rootMetadataCopy("en", true).description, "children feature flag metadata");
assert.ok(readFileSync(path.join(root, "app/layout.tsx"), "utf8").includes("<html lang={locale}"), "root initial html language");
assert.ok(readFileSync(path.join(root, "app/layout.tsx"), "utf8").includes("<LanguageProvider initialLocale={locale}"), "provider gets server locale");
assert.ok(readFileSync(path.join(root, "app/layout.tsx"), "utf8").includes('export const dynamic = "force-dynamic"'), "locale HTML is never statically shared");
assert.ok(readFileSync(path.join(root, "lib/i18n/LanguageContext.tsx"), "utf8").includes("() => initialLocale"), "hydration server snapshot");
const providerSource = readFileSync(path.join(root, "lib/i18n/LanguageContext.tsx"), "utf8");
assert.ok(providerSource.includes("new MutationObserver(update)"), "late client navigation metadata is reconciled");
assert.ok(!providerSource.includes("router.refresh()") && !providerSource.includes("location.reload("), "language switching retains mounted booking forms");
assert.ok(providerSource.includes("document.documentElement.lang = locale"), "document language follows selected UI locale");
assert.ok(providerSource.includes("document.cookie = localeCookieValue(newLocale"), "explicit language selection reaches future server requests");
assert.ok(readFileSync(path.join(root, "app/children/page.tsx"), "utf8").includes("if (!FEATURE_FLAGS.childrenTransport) notFound()"), "disabled children route unchanged");

const winter = new Date("2026-01-15T12:00:00Z");
const summer = new Date("2026-07-15T12:00:00Z");
for (const locale of locales) {
  assert.ok(formatMarketDateTime(winter, locale).includes("13:00"), `${locale} winter Bratislava time`);
  assert.ok(formatMarketDateTime(summer, locale).includes("14:00"), `${locale} summer Bratislava time`);
  assert.ok(formatEuro(12.5, locale).includes("12"));
  assert.ok(/€|EUR/.test(formatEuro(12.5, locale)));
  assert.ok(formatNumber(1234, locale));
  assert.ok(pluralCategory(1, locale));
  if (locale !== "en") assert.notEqual(getTranslation(locale, "missing.key", "Raw English fallback"), "Raw English fallback", `${locale} fallback`);
  for (const kind of ["booking", "payment", "dispatch", "driver", "driverOffer"] as const) {
    assert.ok(!presentStatus(kind, "INTERNAL_ENUM", locale).includes("INTERNAL_ENUM"));
  }
  assert.ok(!presentMessage("SECRET_BACKEND_ERROR", locale).includes("SECRET_BACKEND_ERROR"));
  assert.ok(!presentMessage("RATE_LIMITED", locale, { minutes: 5 }).includes("{"));
  assert.equal(presentMessage("RATE_LIMITED", locale, { minutes: Number.NaN }), getTranslation(locale, "error.service"));
  assert.equal(presentMessage("RATE_LIMITED", locale, { minutes: "<script>" as unknown as number }), getTranslation(locale, "error.service"));
  assert.ok(!presentMessage("RATE_LIMITED", locale, { minutes: 5, ...({ secret: "<script>" } as object) }).includes("<script>"));
}
assert.notEqual(presentMessage("PAYMENT_NOT_CONFIRMED", "de"), presentMessage("PAYMENT_NOT_CONFIRMED", "en"));

console.log(`M2 i18n gate PASS: ${baseKeys.length} effective keys per locale; ${literals.size} literal calls covered; ${new Set(dynamicKeys).size} enumerated dynamic/catalog keys covered.`);
console.log(`Computed call sites inventoried: ${computed.length}. Remaining page-level dynamic/English-copy review belongs to M3/M4/M5:`);
for (const site of computed) console.log(`  ${site}`);
