// M5 communication and notification copy. Human linguistic review is required before release.
import type { UiLocale } from "../locale-resolution";

const entries: Record<string, readonly [string, string, string, string]> = {
  "m5.notifications.title": ["Notifications", "Oznámenia", "Benachrichtigungen", "Сповіщення"],
  "m5.notifications.empty": ["No recent notifications.", "Žiadne nové oznámenia.", "Keine neuen Benachrichtigungen.", "Немає нових сповіщень."],
  "m5.notifications.unknown": ["An update is available. Refresh to see the latest details.", "Je dostupná aktualizácia. Obnovte stránku a pozrite si najnovšie údaje.", "Eine Aktualisierung ist verfügbar. Laden Sie die Seite neu, um die neuesten Details zu sehen.", "Є оновлення. Оновіть сторінку, щоб переглянути останні дані."],
  "m5.notifications.DRIVER_ASSIGNED": ["A driver has been assigned to a booking.", "K objednávke bol priradený vodič.", "Einer Buchung wurde ein Fahrer zugewiesen.", "До бронювання призначено водія."],
  "m5.notifications.DISPATCH_EXHAUSTED": ["A booking needs manual driver assignment.", "Objednávka vyžaduje ručné priradenie vodiča.", "Eine Buchung benötigt eine manuelle Fahrerzuweisung.", "Бронювання потребує ручного призначення водія."],
  "m5.notifications.SCHEDULED_READINESS_FAILED": ["A scheduled ride needs operational attention.", "Plánovaná jazda vyžaduje zásah dispečingu.", "Eine geplante Fahrt erfordert eine Prüfung durch den Betrieb.", "Запланована поїздка потребує уваги диспетчера."],
  "m5.notifications.DRIVER_OFFER_UPDATED": ["Your ride offers have changed. Review the latest offers.", "Vaše ponuky jázd sa zmenili. Skontrolujte aktuálne ponuky.", "Ihre Fahrtangebote haben sich geändert. Prüfen Sie die aktuellen Angebote.", "Ваші пропозиції поїздок змінилися. Перегляньте актуальні пропозиції."],
};

const localeOrder = ["en", "sk", "de", "uk"] as const;
export const m5 = Object.fromEntries(localeOrder.map((locale, index) => [
  locale,
  Object.fromEntries(Object.entries(entries).map(([key, values]) => [key, values[index]])),
])) as Record<UiLocale, Record<string, string>>;
