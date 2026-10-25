import type { UiLocale } from "../locale-resolution";

// Wording for explicit consent and fresh-booking review. Translations are
// provided in all customer UI languages; linguistic signoff remains a release gate.
const entries: Record<string, readonly [string, string, string, string]> = {
  "savedRoutes.title": ["My saved routes", "Moje uložené trasy", "Meine gespeicherten Routen", "Мої збережені маршрути"],
  "savedRoutes.description": ["Use a saved route to fill a new booking. Review the details and current price before confirming.", "Použite uloženú trasu na vyplnenie novej rezervácie. Pred potvrdením skontrolujte údaje a aktuálnu cenu.", "Verwenden Sie eine gespeicherte Route für eine neue Buchung. Prüfen Sie vor der Bestätigung die Angaben und den aktuellen Preis.", "Використайте збережений маршрут для нового бронювання. Перед підтвердженням перевірте дані й актуальну ціну."],
  "savedRoutes.prompt": ["Save this route for next time?", "Uložiť túto trasu na nabudúce?", "Diese Route für das nächste Mal speichern?", "Зберегти цей маршрут на майбутнє?"],
  "savedRoutes.saveRoute": ["Save route", "Uložiť trasu", "Route speichern", "Зберегти маршрут"],
  "savedRoutes.notNow": ["Not now", "Teraz nie", "Jetzt nicht", "Не зараз"],
  "savedRoutes.saveAlways": ["Save always", "Ukladať vždy", "Immer speichern", "Зберігати завжди"],
  "savedRoutes.saved": ["Route saved to your account.", "Trasa bola uložená do vášho účtu.", "Route in Ihrem Konto gespeichert.", "Маршрут збережено у вашому обліковому записі."],
  "savedRoutes.notNowDone": ["You can save routes from your account later.", "Trasy si môžete uložiť vo svojom účte aj neskôr.", "Sie können Routen später in Ihrem Konto speichern.", "Ви зможете зберегти маршрути пізніше у своєму обліковому записі."],
  "savedRoutes.manage": ["Manage saved routes", "Spravovať uložené trasy", "Gespeicherte Routen verwalten", "Керувати збереженими маршрутами"],
  "savedRoutes.privacyNotice": ["Saving stores route addresses, service, passenger count and luggage for your account. Medical details, children’s names, phone numbers, payment details and old prices are not stored. Children’s trips are never saved automatically.", "Uložia sa adresy trasy, služba, počet cestujúcich a batožina vo vašom účte. Zdravotné údaje, mená detí, telefónne čísla, platobné údaje ani staré ceny sa neukladajú. Detské cesty sa nikdy neukladajú automaticky.", "Gespeichert werden Adressen, Dienst, Fahrgastzahl und Gepäck in Ihrem Konto. Medizinische Angaben, Namen von Kindern, Telefonnummern, Zahlungsdaten und alte Preise werden nicht gespeichert. Kinderfahrten werden nie automatisch gespeichert.", "У вашому обліковому записі зберігаються адреси, послуга, кількість пасажирів і багаж. Медичні дані, імена дітей, телефони, платіжні дані та старі ціни не зберігаються. Дитячі поїздки ніколи не зберігаються автоматично."],
  "savedRoutes.autoPreference": ["Automatically save future eligible routes", "Automaticky ukladať ďalšie vhodné trasy", "Zukünftige geeignete Routen automatisch speichern", "Автоматично зберігати майбутні відповідні маршрути"],
  "savedRoutes.autoOn": ["Automatic route saving is enabled. You can turn it off in your account.", "Automatické ukladanie trás je zapnuté. Môžete ho vypnúť vo svojom účte.", "Automatisches Speichern ist aktiviert. Sie können es in Ihrem Konto deaktivieren.", "Автоматичне збереження маршрутів увімкнено. Ви можете вимкнути його в обліковому записі."],
  "savedRoutes.autoOff": ["Automatic saving disabled.", "Automatické ukladanie vypnuté.", "Automatisches Speichern deaktiviert.", "Автоматичне збереження вимкнено."],
  "savedRoutes.empty": ["No saved routes yet.", "Zatiaľ nemáte uložené trasy.", "Noch keine gespeicherten Routen.", "Поки немає збережених маршрутів."],
  "savedRoutes.bookAgain": ["Book again", "Rezervovať znova", "Erneut buchen", "Забронювати знову"],
  "savedRoutes.edit": ["Edit", "Upraviť", "Bearbeiten", "Редагувати"],
  "savedRoutes.delete": ["Delete", "Odstrániť", "Löschen", "Видалити"],
  "savedRoutes.routeName": ["Route name", "Názov trasy", "Routenname", "Назва маршруту"],
  "savedRoutes.smallBags": ["Small bags", "Malé batožiny", "Kleine Taschen", "Малий багаж"],
  "savedRoutes.largeBags": ["Large bags", "Veľké batožiny", "Große Taschen", "Великий багаж"],
  "savedRoutes.saveChanges": ["Save changes", "Uložiť zmeny", "Änderungen speichern", "Зберегти зміни"],
  "savedRoutes.cancel": ["Cancel", "Zrušiť", "Abbrechen", "Скасувати"],
  "savedRoutes.confirmDelete": ["Permanently delete this saved route?", "Natrvalo odstrániť túto uloženú trasu?", "Diese gespeicherte Route endgültig löschen?", "Назавжди видалити цей збережений маршрут?"],
  "savedRoutes.updated": ["Route updated.", "Trasa aktualizovaná.", "Route aktualisiert.", "Маршрут оновлено."],
  "savedRoutes.deleted": ["Route deleted.", "Trasa odstránená.", "Route gelöscht.", "Маршрут видалено."],
  "savedRoutes.error": ["Could not save or load routes. Please try again.", "Trasy sa nepodarilo uložiť alebo načítať. Skúste to znova.", "Routen konnten nicht gespeichert oder geladen werden. Bitte versuchen Sie es erneut.", "Не вдалося зберегти або завантажити маршрути. Спробуйте ще раз."],
  "savedRoutes.exists": ["A route with these addresses and service already exists.", "Trasa s týmito adresami a službou už existuje.", "Eine Route mit diesen Adressen und diesem Dienst existiert bereits.", "Маршрут із цими адресами та послугою вже існує."],
  "savedRoutes.limit": ["You have reached the 25-route limit. Delete an old route before saving another.", "Dosiahli ste limit 25 trás. Pred uložením ďalšej odstráňte starú trasu.", "Sie haben das Limit von 25 Routen erreicht. Löschen Sie zuerst eine alte Route.", "Досягнуто обмеження в 25 маршрутів. Видаліть старий маршрут перед збереженням нового."],
  "savedRoutes.unavailable": ["This service is currently unavailable for new bookings.", "Táto služba momentálne nie je dostupná pre nové rezervácie.", "Dieser Dienst ist derzeit für neue Buchungen nicht verfügbar.", "Ця послуга зараз недоступна для нових бронювань."],
  "savedRoutes.reviewWarning": ["Changes to addresses require fresh location and fare checks when booking.", "Zmenené adresy pri rezervácii vyžadujú novú kontrolu polohy a ceny.", "Geänderte Adressen erfordern bei der Buchung neue Orts- und Preisprüfungen.", "Зміни адрес потребують нової перевірки місця та вартості під час бронювання."],
  "savedRoutes.restored": ["Route details filled. Review locations, accessibility needs, date, payment and the latest fare before booking.", "Údaje trasy sú vyplnené. Pred rezerváciou skontrolujte miesta, potreby asistencie, dátum, platbu a aktuálnu cenu.", "Routendaten übernommen. Prüfen Sie Orte, Barrierefreiheit, Datum, Zahlung und den aktuellen Preis vor der Buchung.", "Дані маршруту заповнені. Перед бронюванням перевірте місця, потреби в доступності, дату, оплату й поточну ціну."],
  "savedRoutes.reviewChildren": ["Enter current child and guardian details and verify the destination before booking.", "Pred rezerváciou zadajte aktuálne údaje o dieťati a zákonnom zástupcovi a overte cieľ cesty.", "Geben Sie aktuelle Angaben zu Kind und Erziehungsberechtigten ein und prüfen Sie das Ziel vor der Buchung.", "Перед бронюванням введіть актуальні дані дитини й опікуна та перевірте пункт призначення."],
  "savedRoutes.draftConflict": ["Review or discard your unfinished draft to use this saved route.", "Ak chcete použiť uloženú trasu, skontrolujte alebo zahoďte nedokončenú rezerváciu.", "Prüfen oder verwerfen Sie Ihren Entwurf, um diese Route zu nutzen.", "Перегляньте або видаліть незавершену чернетку, щоб використати цей маршрут."],
  "savedRoutes.loginRequired": ["Sign in as a passenger to use a saved route.", "Ak chcete použiť uloženú trasu, prihláste sa ako cestujúci.", "Melden Sie sich als Fahrgast an, um eine gespeicherte Route zu verwenden.", "Увійдіть як пасажир, щоб скористатися збереженим маршрутом."],
};

const order = ["en", "sk", "de", "uk"] as const;
export const savedRoutesTranslations = Object.fromEntries(order.map((locale, index) => [locale,
  Object.fromEntries(Object.entries(entries).map(([key, values]) => [key, values[index]])),
])) as Record<UiLocale, Record<string, string>>;
