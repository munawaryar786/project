import type { UiLocale } from "../locale-resolution";

// Booking draft recovery copy. Qualified linguistic review remains a release gate.
const entries: Record<string, readonly [string, string, string, string]> = {
  "phase4.found": [
    "Unfinished booking found", "Našli sme nedokončenú rezerváciu", "Unvollständige Buchung gefunden", "Знайдено незавершене бронювання",
  ],
  "phase4.privacy": [
    "Trip selections, including locations, are saved in this tab for up to two hours. You can discard them at any time.",
    "Výber jazdy vrátane miest sa ukladá v tejto karte najviac na dve hodiny. Kedykoľvek ho môžete zahodiť.",
    "Ihre Fahrtangaben einschließlich der Orte werden in diesem Tab bis zu zwei Stunden gespeichert. Sie können sie jederzeit verwerfen.",
    "Дані поїздки, зокрема місця відправлення й прибуття, зберігаються в цій вкладці до двох годин. Ви можете видалити їх будь-коли.",
  ],
  "phase4.reenter": [
    "Names, contact details, accessibility and child information, and payment details are not saved. Enter them again before booking.",
    "Mená, kontaktné údaje, informácie o prístupnosti a deťoch ani platobné údaje sa neukladajú. Pred rezerváciou ich zadajte znova.",
    "Namen, Kontaktdaten, Angaben zu Barrierefreiheit und Kindern sowie Zahlungsdaten werden nicht gespeichert. Geben Sie diese vor der Buchung erneut ein.",
    "Імена, контактні дані, відомості про доступність і дітей та платіжні дані не зберігаються. Введіть їх знову перед бронюванням.",
  ],
  "phase4.resume": ["Resume booking", "Pokračovať v rezervácii", "Buchung fortsetzen", "Продовжити бронювання"],
  "phase4.startOver": ["Start over", "Začať odznova", "Neu beginnen", "Почати знову"],
  "phase4.discard": ["Discard saved progress", "Zahodiť uložený postup", "Gespeicherten Fortschritt verwerfen", "Забути збережений прогрес"],
  "phase4.expired": [
    "Saved booking progress expired. Please enter your trip details again.",
    "Uložený postup rezervácie vypršal. Zadajte údaje o jazde znova.",
    "Der gespeicherte Buchungsfortschritt ist abgelaufen. Geben Sie Ihre Fahrtdaten erneut ein.",
    "Термін збереження даних бронювання минув. Введіть дані поїздки знову.",
  ],
  "phase4.invalid": [
    "Saved booking information could not be used. Please check your selections again.",
    "Uložené údaje o rezervácii sa nedajú použiť. Skontrolujte svoj výber znova.",
    "Die gespeicherten Buchungsdaten können nicht verwendet werden. Prüfen Sie Ihre Auswahl erneut.",
    "Збережені дані бронювання неможливо використати. Перевірте вибрані параметри знову.",
  ],
  "phase4.accountChanged": [
    "Saved trip details were cleared because the passenger account changed.",
    "Uložené údaje o jazde boli vymazané, pretože sa zmenil účet cestujúceho.",
    "Gespeicherte Fahrtdaten wurden gelöscht, weil das Fahrgastkonto gewechselt wurde.",
    "Збережені дані поїздки видалено, оскільки обліковий запис пасажира змінився.",
  ],
  "phase4.saveUnavailable": [
    "Temporary saving is unavailable in this browser. Keep this tab open while completing your booking.",
    "Dočasné uloženie v tomto prehliadači nie je dostupné. Pri dokončovaní rezervácie nechajte túto kartu otvorenú.",
    "Temporäres Speichern ist in diesem Browser nicht verfügbar. Lassen Sie diesen Tab während der Buchung geöffnet.",
    "Тимчасове збереження недоступне в цьому браузері. Не закривайте вкладку, доки не завершите бронювання.",
  ],
  "phase4.sessionUnavailable": [
    "We could not confirm the passenger session, so saved trip details are unavailable. Keep this tab open and try again later.",
    "Nepodarilo sa overiť reláciu cestujúceho, preto uložené údaje o jazde nie sú dostupné. Nechajte túto kartu otvorenú a skúste to neskôr.",
    "Die Fahrgastsitzung konnte nicht bestätigt werden. Gespeicherte Fahrtdaten sind deshalb nicht verfügbar. Lassen Sie diesen Tab geöffnet und versuchen Sie es später erneut.",
    "Не вдалося підтвердити сеанс пасажира, тому збережені дані поїздки недоступні. Не закривайте вкладку й спробуйте пізніше.",
  ],
  "phase4.restored": [
    "Trip selections restored. Re-enter personal and special-service details before continuing.",
    "Výber jazdy bol obnovený. Pred pokračovaním znova zadajte osobné údaje a podrobnosti o špeciálnej službe.",
    "Fahrtangaben wiederhergestellt. Geben Sie persönliche Angaben und Details zu besonderen Leistungen erneut ein.",
    "Параметри поїздки відновлено. Перед продовженням повторно введіть особисті дані та відомості про спеціальні послуги.",
  ],
  "phase4.scheduleNeedsCorrection": [
    "Trip selections restored, but the saved pickup time has passed. Choose a new date and time.",
    "Výber jazdy bol obnovený, ale uložený čas vyzdvihnutia už uplynul. Zvoľte nový dátum a čas.",
    "Fahrtangaben wiederhergestellt, aber die gespeicherte Abholzeit liegt in der Vergangenheit. Wählen Sie ein neues Datum und eine neue Uhrzeit.",
    "Параметри поїздки відновлено, але збережений час подачі вже минув. Виберіть нову дату й час.",
  ],
  "phase4.discarded": ["Saved progress discarded.", "Uložený postup bol zahodený.", "Gespeicherter Fortschritt verworfen.", "Збережений прогрес видалено."],
  "phase4.submissionUncertain": [
    "Your booking request may have reached Drivo. Check your bookings or contact support before trying to book again.",
    "Žiadosť o rezerváciu sa možno dostala do Drivo. Pred ďalším pokusom skontrolujte svoje rezervácie alebo kontaktujte podporu.",
    "Ihre Buchungsanfrage hat Drivo möglicherweise erreicht. Prüfen Sie Ihre Buchungen oder kontaktieren Sie den Support, bevor Sie erneut buchen.",
    "Запит на бронювання міг надійти до Drivo. Перш ніж бронювати знову, перевірте свої бронювання або зверніться до підтримки.",
  ],
};

const localeOrder = ["en", "sk", "de", "uk"] as const;
export const phase4 = Object.fromEntries(localeOrder.map((locale, index) => [
  locale,
  Object.fromEntries(Object.entries(entries).map(([key, values]) => [key, values[index]])),
])) as Record<UiLocale, Record<string, string>>;
