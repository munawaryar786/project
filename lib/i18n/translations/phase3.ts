// Passenger authentication copy. Qualified linguistic review remains a release gate.
import type { UiLocale } from "../locale-resolution";

const entries: Record<string, readonly [string, string, string, string]> = {
  "phase3.accountChoice": ["Choose account access", "Vyberte spôsob prístupu k účtu", "Kontozugang wählen", "Оберіть спосіб доступу до облікового запису"],
  "phase3.newCustomer": ["New customer — create account", "Nový zákazník — vytvoriť účet", "Neukunde — Konto erstellen", "Новий клієнт — створити обліковий запис"],
  "phase3.existingCustomer": ["Already have an account? Sign in", "Už máte účet? Prihláste sa", "Sie haben bereits ein Konto? Anmelden", "Уже маєте обліковий запис? Увійдіть"],
  "phase3.dialingCode": ["Country code", "Predvoľba krajiny", "Ländervorwahl", "Код країни"],
  "phase3.invalidEmail": ["Enter a valid email address.", "Zadajte platnú e-mailovú adresu.", "Geben Sie eine gültige E-Mail-Adresse ein.", "Введіть дійсну адресу електронної пошти."],
  "phase3.showPassword": ["Show password", "Zobraziť heslo", "Passwort anzeigen", "Показати пароль"],
  "phase3.hidePassword": ["Hide password", "Skryť heslo", "Passwort verbergen", "Приховати пароль"],
  "phase3.logoutFailed": ["Could not sign out. Please try again.", "Nepodarilo sa odhlásiť. Skúste to znova.", "Abmelden fehlgeschlagen. Bitte versuchen Sie es erneut.", "Не вдалося вийти. Спробуйте ще раз."],
  "passenger.loginContinue": ["Sign in and continue", "Prihlásiť sa a pokračovať", "Anmelden und fortfahren", "Увійти й продовжити"],
  "passenger.useAnotherAccount": ["Use another account", "Použiť iný účet", "Anderes Konto verwenden", "Використати інший обліковий запис"],
  "passenger.backToLogin": ["Back to sign in", "Späť na prihlásenie", "Zurück zur Anmeldung", "Повернутися до входу"],
};

const localeOrder = ["en", "sk", "de", "uk"] as const;
export const phase3 = Object.fromEntries(localeOrder.map((locale, index) => [
  locale,
  Object.fromEntries(Object.entries(entries).map(([key, values]) => [key, values[index]])),
])) as Record<UiLocale, Record<string, string>>;
