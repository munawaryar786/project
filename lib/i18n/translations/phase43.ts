import type { UiLocale } from "../locale-resolution";

// New recovery wording requires qualified linguistic review before release.
const entries: Record<string, readonly [string, string, string, string]> = {
  "phase43.reviewTitle": [
    "Review your saved journey", "Skontrolujte si uloženú cestu", "Prüfen Sie Ihre gespeicherte Fahrt", "Перегляньте збережену поїздку",
  ],
  "phase43.guestExplanation": [
    "This unfinished journey was started before sign-in. Review it before continuing with this account. It does not grant access to an existing booking.",
    "Túto nedokončenú cestu ste začali pred prihlásením. Pred pokračovaním v tomto účte ju skontrolujte. Neudeľuje prístup k existujúcej rezervácii.",
    "Diese unvollständige Fahrt wurde vor der Anmeldung begonnen. Prüfen Sie sie, bevor Sie mit diesem Konto fortfahren. Sie gewährt keinen Zugriff auf eine bestehende Buchung.",
    "Цю незавершену поїздку було розпочато до входу. Перевірте її, перш ніж продовжити з цим обліковим записом. Вона не надає доступу до наявного бронювання.",
  ],
  "phase43.continueAccount": [
    "Resume with this account", "Pokračovať s týmto účtom", "Mit diesem Konto fortfahren", "Продовжити з цим обліковим записом",
  ],
  "phase43.signedInContext": [
    "You are signed in to a passenger account. Only continue if this is your unfinished journey.",
    "Ste prihlásení do účtu cestujúceho. Pokračujte iba vtedy, ak je toto vaša nedokončená cesta.",
    "Sie sind bei einem Fahrgastkonto angemeldet. Fahren Sie nur fort, wenn dies Ihre unvollständige Fahrt ist.",
    "Ви увійшли до облікового запису пасажира. Продовжуйте, лише якщо це ваша незавершена поїздка.",
  ],
  "phase43.resetCompleted": [
    "Password reset completed. You can continue your unfinished booking after reviewing it.",
    "Obnovenie hesla sa dokončilo. Po kontrole môžete pokračovať v nedokončenej rezervácii.",
    "Das Passwort wurde zurückgesetzt. Nach der Prüfung können Sie Ihre unvollständige Buchung fortsetzen.",
    "Пароль змінено. Після перевірки ви можете продовжити незавершене бронювання.",
  ],
  "phase43.discard": [
    "Discard and start over", "Zahodiť a začať odznova", "Verwerfen und neu beginnen", "Відкинути й почати спочатку",
  ],
  "phase43.separateLogin": [
    "Sign in on the passenger page", "Prihlásiť sa na stránke cestujúceho", "Auf der Fahrgastseite anmelden", "Увійти на сторінці пасажира",
  ],
  "phase43.privacyDiscarded": [
    "For your privacy, saved journey details from an earlier account were discarded.",
    "Kvôli ochrane vášho súkromia boli uložené údaje o ceste z predchádzajúceho účtu zahodené.",
    "Zum Schutz Ihrer Privatsphäre wurden gespeicherte Fahrtdaten eines früheren Kontos verworfen.",
    "Задля вашої конфіденційності збережені дані поїздки з попереднього облікового запису було відкинуто.",
  ],
  "phase43.unavailable": [
    "Your unfinished journey could not be recovered safely. Please enter the trip details again.",
    "Nedokončenú cestu sa nepodarilo bezpečne obnoviť. Zadajte údaje o ceste znova.",
    "Ihre unvollständige Fahrt konnte nicht sicher wiederhergestellt werden. Bitte geben Sie die Fahrtdaten erneut ein.",
    "Незавершену поїздку не вдалося безпечно відновити. Введіть дані поїздки ще раз.",
  ],
};

const order = ["en", "sk", "de", "uk"] as const;
export const phase43 = Object.fromEntries(order.map((locale, index) => [locale,
  Object.fromEntries(Object.entries(entries).map(([key, values]) => [key, values[index]])),
])) as Record<UiLocale, Record<string, string>>;
