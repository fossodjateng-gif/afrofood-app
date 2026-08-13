import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  Text,
  View,
} from "react-native";
import {
  StripeTerminalProvider,
  useStripeTerminal,
} from "@stripe/stripe-terminal-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

type OrderItem = {
  id?: string;
  name: string;
  qty: number;
  price?: number | null;
};

type OrderRow = {
  id: string;
  created_at: string;
  customer_name: string | null;
  event_name?: string | null;
  payment: "cash" | "card";
  status: "PENDING_PAYMENT" | "NEW" | "IN_PROGRESS" | "READY" | "DONE" | "CANCELED";
  items: OrderItem[];
  amount_cents?: number | null;
  stripe_payment_intent_id?: string | null;
};

type CreatePiResponse = {
  ok: boolean;
  reused?: boolean;
  paymentIntentId?: string;
  clientSecret?: string;
  status?: string;
  error?: string;
};

type TerminalActiveOrderResponse = {
  ok: boolean;
  activeOrder?: {
    orderId?: string;
    paymentIntentId?: string | null;
  } | null;
  error?: string;
};

type PrepPaymentIntentResponse = {
  ok: boolean;
  paymentIntentId?: string;
  clientSecret?: string;
  amount?: number;
  currency?: string;
  status?: string;
  error?: string;
};

type NativeRole = "admin" | "cashier" | "kitchen";
type NativeLang = "de" | "fr" | "en";
type SetupStep = "intro" | "terms" | "education" | "prep";

type NativeSession = {
  username: string;
  role: NativeRole;
  loggedAt: string;
};

type NativeUser = {
  username: string;
  password: string;
  role: NativeRole;
};

function getNativeRole(value: string | null): NativeRole {
  return value === "admin" || value === "cashier" || value === "kitchen"
    ? value
    : "cashier";
}

function getNativeSessionFromLink(username: string | null, role: string | null): NativeSession {
  const cleanUsername = String(username || "").trim() || "cashier";
  return {
    username: cleanUsername,
    role: getNativeRole(role),
    loggedAt: new Date().toISOString(),
  };
}

const API_BASE_URL =
  process.env.EXPO_PUBLIC_AFROFOOD_API_BASE_URL || "https://afrofood-app.vercel.app";
const TERMINAL_LOCATION_ID =
  process.env.EXPO_PUBLIC_STRIPE_TERMINAL_LOCATION_ID || "tml_GZ01YQcRTm1DdP";
const APPLE_TAP_TO_PAY_HIG_URL =
  "https://developer.apple.com/design/human-interface-guidelines/tap-to-pay-on-iphone";
const APPLE_TAP_TO_PAY_TERMS_URL =
  "https://www.apple.com/legal/internet-services/business-services/tap-to-pay-on-iphone/terms-en.html";

const NATIVE_DEMO_USERS: NativeUser[] = [
  { username: "admin", password: "0603", role: "admin" },
  { username: "existinguser", password: "0603", role: "cashier" },
  { username: "newuser", password: "0603", role: "kitchen" },
];

function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function getDailySetupStorageKey(username: string) {
  return `afrofood-terminal-tap-setup:${username.trim().toLowerCase()}:${getTodayKey()}`;
}

function getTerminalStepText(lang: NativeLang) {
  if (lang === "de") {
    return {
      termsTitle: "Tap to Pay on iPhone Nutzungsbedingungen",
      termsBody:
        "Offnen Sie die offiziellen Apple Tap to Pay on iPhone Terms and Conditions. Die native iPhone Vorbereitung zeigt die offiziellen Bedingungen ebenfalls an, wenn Apple sie erneut verlangt.",
      termsSummary: [
        "AfroFood Terminal akzeptiert kontaktlose Zahlungen direkt auf diesem iPhone.",
        "Die offiziellen Apple Terms konnen uber die Schaltflache unten geoffnet werden.",
        "Nach der Zustimmung folgt der Handlerleitfaden und die Tap to Pay Vorbereitung.",
      ],
      termsCheck: "Ich habe die Nutzungsbedingungen gelesen und akzeptiere sie.",
      acceptContinue: "Akzeptieren und fortfahren",
      merchantGuideTitle: "Tap to Pay Handlerleitfaden",
      understood: "Ich habe verstanden",
      prepTitle: "Tap to Pay Vorbereitung",
      prepAccepted:
        "Die Bedingungen wurden akzeptiert. Starten Sie jetzt eine echte Tap to Pay Vorbereitung mit 0,50 EUR.",
      prepButton: "Tap to Pay vorbereiten (0,50 EUR)",
      prepBusy: "Vorbereitung lauft...",
      prepDone: "Tap to Pay ist bereit. Die Demo-Zahlung uber 0,50 EUR wurde verarbeitet.",
      readApproved: "Gelesen und akzeptiert",
      configTitle: "Tap to Pay Konfiguration",
      configBody:
        "Jeder Kassenbenutzer bereitet Tap to Pay einmal pro Tag vor. Danach kann die Kasse Bestellungen an AfroFood Terminal senden.",
      configure: "Konfigurieren",
    };
  }
  if (lang === "en") {
    return {
      termsTitle: "Tap to Pay on iPhone Terms and Conditions",
      termsBody:
        "Open the official Apple Tap to Pay on iPhone Terms and Conditions. The native iPhone setup also displays the official terms if Apple requires them again.",
      termsSummary: [
        "AfroFood Terminal accepts contactless payments directly on this iPhone.",
        "The official Apple Terms can be opened with the button below.",
        "After acceptance, the merchant guide and Tap to Pay preparation follow.",
      ],
      termsCheck: "I have read and accept the Terms and Conditions.",
      acceptContinue: "Accept and continue",
      merchantGuideTitle: "Tap to Pay Merchant Guide",
      understood: "I understand",
      prepTitle: "Tap to Pay preparation",
      prepAccepted:
        "The terms have been accepted. Start a real Tap to Pay preparation with 0.50 EUR.",
      prepButton: "Prepare Tap to Pay (0.50 EUR)",
      prepBusy: "Preparing...",
      prepDone: "Tap to Pay is ready. The 0.50 EUR demo payment was processed.",
      readApproved: "Read and approved",
      configTitle: "Tap to Pay configuration",
      configBody:
        "Each cashier prepares Tap to Pay once per day. After that, the cashier page can send orders to AfroFood Terminal.",
      configure: "Configure",
    };
  }
  return {
    termsTitle: "Conditions d'utilisation Tap to Pay on iPhone",
    termsBody:
      "Ouvrez les Tap to Pay on iPhone Terms and Conditions officiels Apple. La preparation native iPhone affiche aussi les conditions officielles si Apple les redemande.",
    termsSummary: [
      "AfroFood Terminal accepte les paiements sans contact directement sur cet iPhone.",
      "Les Terms Apple officiels s'ouvrent avec le bouton ci-dessous.",
      "Apres acceptation, le guide marchand et la preparation Tap to Pay suivent.",
    ],
    termsCheck: "J'ai lu et j'accepte les conditions d'utilisation.",
    acceptContinue: "Accepter et continuer",
    merchantGuideTitle: "Guide marchand Tap to Pay",
    understood: "J'ai compris",
    prepTitle: "Tap to Pay (preparation)",
    prepAccepted:
      "Les conditions ont ete acceptees. Lancez maintenant une vraie preparation Tap to Pay avec 0,50 EUR.",
    prepButton: "Tap to Pay (preparation avec 0,50 EUR)",
    prepBusy: "Preparation...",
    prepDone: "Tap to Pay est pret. Le paiement demo de 0,50 EUR a ete traite.",
    readApproved: "Lu et approuve",
    configTitle: "Configuration Tap to Pay",
    configBody:
      "Chaque caissier prepare Tap to Pay une fois par jour. Ensuite, la caisse peut envoyer les commandes a AfroFood Terminal.",
    configure: "Configurer",
  };
}

const NATIVE_TEXT: Record<
  NativeLang,
  {
    back: string;
    logout: string;
    api: string;
    location: string;
    loginTitle: string;
    loginSubtitle: string;
    username: string;
    password: string;
    openCashier: string;
    demoAccounts: string;
    invalidLogin: string;
    restrictedLogin: string;
    awarenessTitle: string;
    awarenessSubtitle: string;
    enableTitle: string;
    awarenessBody: string;
    setupButton: string;
    setupBusy: string;
    setupStarted: string;
    termsAccepted: string;
    setupCompleteAccepted: string;
    setupCompleteAlready: string;
    setupDefault: string;
    setupAvailableTitle: string;
    setupPoints: string[];
    educationTitle: string;
    educationSubtitle: string;
    cardsTitle: string;
    cardsBody: string;
    walletsTitle: string;
    walletsBody: string;
    pinTitle: string;
    pinBody: string;
    sourceTitle: string;
    sourceBody: string;
    openAppleGuidelines: string;
    openAppleTerms: string;
    continueCashier: string;
    homeTitle: string;
    homeSubtitle: string;
    homeSection: string;
    homeBody: string;
    openTerminal: string;
    educationButton: string;
    handledTitle: string;
    setupAccepted: string;
    educationSeen: string;
    terminalTitle: string;
    terminalSubtitle: string;
    openFromCashier: string;
    orderToPay: string;
    paymentDone: string;
    paidOrder: string;
    returnCashier: string;
    loadingOrder: string;
    refresh: string;
    refreshing: string;
    client: string;
    event: string;
    pay: string;
    paying: string;
    pendingOrders: string;
    refreshOrders: string;
    noPendingOrders: string;
    selectedOrder: string;
    selectOrder: string;
    checkout: string;
    loadPi: string;
    connected: string;
    connectSetup: string;
    checkoutHelp: string;
    logs: string;
    noLogs: string;
    ready: string;
  }
> = {
  de: {
    back: "Zuruck",
    logout: "Abmelden",
    api: "API",
    location: "Standort",
    loginTitle: "AfroFood Terminal",
    loginSubtitle: "Native iPhone-Kasse fur Tap to Pay auf dem iPhone",
    username: "Benutzername",
    password: "Passwort",
    openCashier: "Kasse offnen",
    demoAccounts: "Demo-Konten",
    invalidLogin: "Ungultige mobile Demo-Zugangsdaten.",
    restrictedLogin: "Diese native App ist fur Kasse oder Admin reserviert.",
    awarenessTitle: "Tap to Pay auf dem iPhone",
    awarenessSubtitle: "Kontaktlose Zahlungen direkt auf dem iPhone annehmen.",
    enableTitle: "Tap to Pay auf dem iPhone aktivieren",
    awarenessBody:
      "AfroFood Terminal nutzt den offiziellen nativen Stripe Terminal Ablauf. Falls erforderlich, zeigt iPhone die offiziellen Tap to Pay on iPhone Terms and Conditions an.",
    setupButton: "Tap to Pay einrichten und Terms and Conditions anzeigen",
    setupBusy: "Tap to Pay Einrichtung startet...",
    setupStarted: "Offizieller Tap to Pay auf dem iPhone Ablauf startet...",
    termsAccepted: "Offizielle Tap to Pay on iPhone Terms and Conditions wurden akzeptiert.",
    setupCompleteAccepted: "Tap to Pay ist nach Akzeptanz der Terms bereit.",
    setupCompleteAlready: "Tap to Pay ist bereit. Die Terms wurden eventuell bereits akzeptiert.",
    setupDefault:
      "Diese Schaltflache startet den offiziellen nativen Tap to Pay Ablauf mit Terms and Conditions, falls Apple sie verlangt.",
    setupAvailableTitle: "Wo Tap to Pay verfugbar ist",
    setupPoints: [
      "Beim Onboarding neuer Kassenbenutzer",
      "Nach Anmeldung bestehender Kassenbenutzer",
      "In Hilfe / Einstellungen vor der Kasse",
      "Direkt in der Zahlungsvalidierung",
    ],
    educationTitle: "Merchant Education",
    educationSubtitle: "Merchant Education nach Apple Tap to Pay on iPhone Vorgaben.",
    cardsTitle: "Kontaktlose Karten akzeptieren",
    cardsBody:
      "Bitten Sie den Kunden, die kontaktlose Karte oben an das iPhone zu halten, wenn der Tap to Pay Bildschirm erscheint. Die Karte ruhig halten, bis die Zahlung bestatigt ist.",
    walletsTitle: "Apple Pay und Wallets akzeptieren",
    walletsBody:
      "Kunden konnen mit Apple Pay oder anderen kontaktlosen Wallets zahlen, indem sie iPhone oder Watch oben an das Kassen-iPhone halten.",
    pinTitle: "PIN, Barrierefreiheit und Alternative",
    pinBody:
      "Wenn iPhone eine PIN, eine Bedienungshilfe oder weitere Schritte verlangt, folgen Sie dem sicheren iPhone-Hinweis. Falls kontaktlos nicht moglich ist, wahlen Sie eine andere Zahlungsart.",
    sourceTitle: "Apple Quellen",
    sourceBody:
      "Diese Zusammenfassung ist AfroFood Text nach Apple Human Interface Guidelines. Die offiziellen Terms and Conditions erscheinen im nativen iPhone Ablauf.",
    openAppleGuidelines: "Apple Guidelines offnen",
    openAppleTerms: "Apple Terms offnen",
    continueCashier: "Weiter zur Kasse",
    homeTitle: "Kassen-Start",
    homeSubtitle: "Angemeldet als",
    homeSection: "Tap to Pay auf dem iPhone",
    homeBody:
      "Offnen Sie den Live-Zahlungsablauf, verbinden Sie Tap to Pay auf dem iPhone und kassieren Sie die aktivierte Bestellung.",
    openTerminal: "Zahlungsvalidierung offnen",
    educationButton: "Hilfe / Einstellungen: Merchant Education",
    handledTitle: "Diese native App verwaltet",
    setupAccepted: "Tap to Pay Setup akzeptiert",
    educationSeen: "Merchant Education gesehen",
    terminalTitle: "AfroFood Terminal",
    terminalSubtitle: "Zahlungsvalidierung mit Tap to Pay auf dem iPhone",
    openFromCashier: "Offnen Sie eine konkrete Kartenzahlung aus der Kasse. Im Terminal erscheint nur diese aktivierte Bestellung.",
    orderToPay: "Bestellung kassieren",
    paymentDone: "Zahlung abgeschlossen",
    paidOrder: "Bestellung bezahlt",
    returnCashier: "Zuruck zur Kasse: Ticket wird angezeigt, Bestellung wird validiert und an die Kuche gesendet.",
    loadingOrder: "Bestellung wird geladen",
    refresh: "Aktualisieren",
    refreshing: "Aktualisierung...",
    client: "Kunde",
    event: "Event",
    pay: "Kartenzahlung validieren",
    paying: "Zahlung lauft...",
    pendingOrders: "Offene Kartenzahlungen",
    refreshOrders: "Bestellungen aktualisieren",
    noPendingOrders: "Keine offenen Kartenzahlungen.",
    selectedOrder: "Ausgewahlte Bestellung",
    selectOrder: "Wahlen Sie eine Kartenzahlung aus.",
    checkout: "Zahlungsvalidierung",
    loadPi: "PaymentIntent laden/erstellen",
    connected: "Tap to Pay verbunden",
    connectSetup: "Tap to Pay Einrichtung verbinden",
    checkoutHelp:
      "Wenn Tap to Pay noch nicht bereit ist, startet die App zuerst Einrichtung und Verbindung, danach die Zahlung.",
    logs: "Logs",
    noLogs: "Noch keine Logs.",
    ready: "Bereit.",
  },
  fr: {
    back: "Retour",
    logout: "Se deconnecter",
    api: "API",
    location: "Location",
    loginTitle: "AfroFood Terminal",
    loginSubtitle: "Caisse native iPhone pour Tap to Pay sur iPhone",
    username: "Utilisateur",
    password: "Mot de passe",
    openCashier: "Ouvrir la caisse",
    demoAccounts: "Comptes demo",
    invalidLogin: "Identifiants mobile demo invalides.",
    restrictedLogin: "Cette app native est reservee a la caisse ou a l'admin.",
    awarenessTitle: "Tap to Pay sur iPhone",
    awarenessSubtitle: "Accepter les paiements sans contact directement sur iPhone.",
    enableTitle: "Activer Tap to Pay sur iPhone",
    awarenessBody:
      "AfroFood Terminal utilise le flux natif officiel Stripe Terminal. Si necessaire, l'iPhone affiche les Tap to Pay on iPhone Terms and Conditions officiels.",
    setupButton: "Configurer Tap to Pay et afficher les Terms and Conditions",
    setupBusy: "Configuration Tap to Pay...",
    setupStarted: "Demarrage du flux officiel Tap to Pay sur iPhone...",
    termsAccepted: "Les Tap to Pay on iPhone Terms and Conditions officiels ont ete acceptes.",
    setupCompleteAccepted: "Tap to Pay est pret apres acceptation des Terms.",
    setupCompleteAlready: "Tap to Pay est pret. Les Terms ont peut-etre deja ete acceptes.",
    setupDefault:
      "Ce bouton demarre le flux natif officiel Tap to Pay avec Terms and Conditions si Apple les demande.",
    setupAvailableTitle: "Ou Tap to Pay est disponible",
    setupPoints: [
      "Pendant l'onboarding d'un nouveau caissier",
      "Apres connexion d'un caissier existant",
      "Depuis Aide / Reglages avant la caisse",
      "Directement dans la validation de paiement",
    ],
    educationTitle: "Merchant Education",
    educationSubtitle: "Merchant Education conforme aux consignes Apple Tap to Pay on iPhone.",
    cardsTitle: "Accepter les cartes sans contact",
    cardsBody:
      "Demandez au client de presenter sa carte sans contact en haut de l'iPhone lorsque l'ecran Tap to Pay s'affiche. Garder la carte immobile jusqu'a confirmation.",
    walletsTitle: "Accepter Apple Pay et les wallets",
    walletsBody:
      "Les clients peuvent payer avec Apple Pay ou d'autres wallets sans contact en approchant leur telephone ou montre du haut de l'iPhone caisse.",
    pinTitle: "PIN, accessibilite et alternative",
    pinBody:
      "Si l'iPhone demande un PIN, une option d'accessibilite ou une instruction supplementaire, suivez l'invite securisee. Si le sans contact n'est pas possible, choisissez un autre moyen de paiement.",
    sourceTitle: "Sources Apple",
    sourceBody:
      "Ce resume est un texte AfroFood conforme aux Human Interface Guidelines Apple. Les Terms and Conditions officiels apparaissent dans le flux natif iPhone.",
    openAppleGuidelines: "Ouvrir les guidelines Apple",
    openAppleTerms: "Ouvrir les Terms Apple",
    continueCashier: "Continuer vers la caisse",
    homeTitle: "Accueil caisse",
    homeSubtitle: "Connecte comme",
    homeSection: "Tap to Pay sur iPhone",
    homeBody:
      "Ouvrez le flux de paiement, connectez Tap to Pay sur iPhone et encaissez la commande activee.",
    openTerminal: "Ouvrir validation paiement",
    educationButton: "Aide / Reglages : Merchant Education",
    handledTitle: "Cette app native gere",
    setupAccepted: "Setup Tap to Pay accepte",
    educationSeen: "Merchant Education vue",
    terminalTitle: "AfroFood Terminal",
    terminalSubtitle: "Validation paiement avec Tap to Pay sur iPhone",
    openFromCashier: "Ouvrez une commande carte precise depuis la caisse. Le Terminal affiche uniquement cette commande activee.",
    orderToPay: "Commande a encaisser",
    paymentDone: "Paiement termine",
    paidOrder: "Commande payee",
    returnCashier: "Retournez a la caisse: le ticket s'affiche, la commande devient validee et elle part en cuisine.",
    loadingOrder: "Chargement de la commande",
    refresh: "Actualiser",
    refreshing: "Actualisation...",
    client: "Client",
    event: "Evenement",
    pay: "Valider paiement carte",
    paying: "Paiement en cours...",
    pendingOrders: "Paiements carte en attente",
    refreshOrders: "Actualiser commandes",
    noPendingOrders: "Aucun paiement carte en attente.",
    selectedOrder: "Commande selectionnee",
    selectOrder: "Selectionnez une commande carte.",
    checkout: "Validation paiement",
    loadPi: "Charger/creer PaymentIntent",
    connected: "Tap to Pay connecte",
    connectSetup: "Connecter setup Tap to Pay",
    checkoutHelp:
      "Si Tap to Pay n'est pas pret, l'app lance d'abord la configuration/connexion, puis le paiement.",
    logs: "Logs",
    noLogs: "Aucun log.",
    ready: "Pret.",
  },
  en: {
    back: "Back",
    logout: "Logout",
    api: "API",
    location: "Location",
    loginTitle: "AfroFood Terminal",
    loginSubtitle: "Native iPhone cashier for Tap to Pay on iPhone",
    username: "Username",
    password: "Password",
    openCashier: "Open cashier",
    demoAccounts: "Demo accounts",
    invalidLogin: "Invalid mobile demo credentials.",
    restrictedLogin: "This native app is reserved for cashier or admin.",
    awarenessTitle: "Tap to Pay on iPhone",
    awarenessSubtitle: "Accept contactless payments directly on iPhone.",
    enableTitle: "Enable Tap to Pay on iPhone",
    awarenessBody:
      "AfroFood Terminal uses the official native Stripe Terminal flow. If required, iPhone displays the official Tap to Pay on iPhone Terms and Conditions.",
    setupButton: "Set up Tap to Pay and review Terms and Conditions",
    setupBusy: "Starting Tap to Pay setup...",
    setupStarted: "Starting official Tap to Pay on iPhone flow...",
    termsAccepted: "Official Tap to Pay on iPhone Terms and Conditions accepted.",
    setupCompleteAccepted: "Tap to Pay is ready after Terms acceptance.",
    setupCompleteAlready: "Tap to Pay is ready. Terms may already have been accepted.",
    setupDefault:
      "This button starts the official native Tap to Pay flow with Terms and Conditions if Apple requires them.",
    setupAvailableTitle: "Where Tap to Pay is available",
    setupPoints: [
      "During new cashier onboarding",
      "After existing cashier sign in",
      "From Help / Settings before cashier",
      "Directly in payment validation",
    ],
    educationTitle: "Merchant Education",
    educationSubtitle: "Merchant Education aligned with Apple Tap to Pay on iPhone guidance.",
    cardsTitle: "Accept contactless cards",
    cardsBody:
      "Ask the customer to hold their contactless card near the top of the iPhone when the Tap to Pay screen is shown. Keep the card still until payment is confirmed.",
    walletsTitle: "Accept Apple Pay and wallets",
    walletsBody:
      "Customers can pay with Apple Pay or other contactless wallets by holding their phone or watch near the top of the cashier iPhone.",
    pinTitle: "PIN, accessibility, and fallback",
    pinBody:
      "If iPhone requests a PIN, accessibility option, or additional instruction, follow the secure prompt. If contactless is not possible, choose another payment method.",
    sourceTitle: "Apple Sources",
    sourceBody:
      "This summary is AfroFood copy aligned with Apple Human Interface Guidelines. The official Terms and Conditions appear in the native iPhone flow.",
    openAppleGuidelines: "Open Apple Guidelines",
    openAppleTerms: "Open Apple Terms",
    continueCashier: "Continue to cashier",
    homeTitle: "Cashier Home",
    homeSubtitle: "Signed in as",
    homeSection: "Tap to Pay on iPhone",
    homeBody:
      "Open the payment flow, connect Tap to Pay on iPhone, and collect payment for the active order.",
    openTerminal: "Open payment validation",
    educationButton: "Help / Settings: Merchant Education",
    handledTitle: "This native app handles",
    setupAccepted: "Tap to Pay setup accepted",
    educationSeen: "Merchant Education seen",
    terminalTitle: "AfroFood Terminal",
    terminalSubtitle: "Payment validation with Tap to Pay on iPhone",
    openFromCashier: "Open a specific card order from the cashier. Terminal only shows that activated order.",
    orderToPay: "Order to charge",
    paymentDone: "Payment complete",
    paidOrder: "Order paid",
    returnCashier: "Return to cashier: the ticket appears, the order is validated, and it goes to kitchen.",
    loadingOrder: "Loading order",
    refresh: "Refresh",
    refreshing: "Refreshing...",
    client: "Client",
    event: "Event",
    pay: "Validate card payment",
    paying: "Payment in progress...",
    pendingOrders: "Pending card payments",
    refreshOrders: "Refresh orders",
    noPendingOrders: "No pending card payments.",
    selectedOrder: "Selected order",
    selectOrder: "Select a card order.",
    checkout: "Payment validation",
    loadPi: "Load/create PaymentIntent",
    connected: "Tap to Pay connected",
    connectSetup: "Connect Tap to Pay setup",
    checkoutHelp:
      "If Tap to Pay is not ready, the app starts setup/connect first, then collects payment.",
    logs: "Logs",
    noLogs: "No logs yet.",
    ready: "Ready.",
  },
};

function formatEur(cents?: number | null) {
  return `${((cents || 0) / 100).toFixed(2)} EUR`;
}

function Button({
  label,
  onPress,
  disabled,
  kind = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: "primary" | "secondary" | "success";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        kind === "secondary" ? styles.buttonSecondary : null,
        kind === "success" ? styles.buttonSuccess : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          kind === "secondary" ? styles.buttonSecondaryText : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function roleLabel(role: NativeRole) {
  if (role === "admin") return "Admin";
  if (role === "cashier") return "Cashier";
  return "Kitchen";
}

function LanguageSwitcher({
  lang,
  onChange,
}: {
  lang: NativeLang;
  onChange: (lang: NativeLang) => void;
}) {
  return (
    <View style={styles.langRow}>
      {(["de", "fr", "en"] as NativeLang[]).map((item) => (
        <Pressable
          key={item}
          onPress={() => onChange(item)}
          style={[styles.langButton, lang === item ? styles.langButtonActive : null]}
        >
          <Text style={[styles.langButtonText, lang === item ? styles.langButtonTextActive : null]}>
            {item.toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function BrandHeader({
  title,
  subtitle,
  lang,
  onLangChange,
  meta,
}: {
  title: string;
  subtitle: string;
  lang: NativeLang;
  onLangChange: (lang: NativeLang) => void;
  meta?: string;
}) {
  return (
    <View style={styles.brandHeader}>
      <View style={styles.brandTitleRow}>
        <Image
          source={{ uri: `${API_BASE_URL}/logo-afrofood.png` }}
          style={styles.logo}
          resizeMode="cover"
        />
        <View style={styles.brandText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
      </View>
      <LanguageSwitcher lang={lang} onChange={onLangChange} />
    </View>
  );
}

function AwarenessScreen({
  session,
  onSetupComplete,
  onLogout,
  lang,
  onLangChange,
}: {
  session: NativeSession;
  onSetupComplete: () => void;
  onLogout: () => void;
  lang: NativeLang;
  onLangChange: (lang: NativeLang) => void;
}) {
  const t = NATIVE_TEXT[lang];
  const stepText = getTerminalStepText(lang);
  const [setupStep, setSetupStep] = useState<SetupStep>("intro");
  const [termsChecked, setTermsChecked] = useState(false);
  const [prepComplete, setPrepComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [setupLog, setSetupLog] = useState("");
  const [termsAcceptedBySdk, setTermsAcceptedBySdk] = useState(false);
  const discoveredReadersRef = useRef<any[]>([]);
  const terminal = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers: any[]) => {
      discoveredReadersRef.current = readers;
    },
    onDidAcceptTermsOfService: () => {
      setTermsAcceptedBySdk(true);
      setSetupLog(t.termsAccepted);
    },
  } as any) as any;

  async function prepareTapToPayDemoPayment() {
    try {
      setBusy(true);
      setSetupLog(t.setupStarted);

      const init = await terminal.initialize();
      if (init?.error) throw init.error;

      const discovery = await terminal.discoverReaders({
        discoveryMethod: "tapToPay",
        simulated: false,
      });
      if (discovery?.error) throw discovery.error;

      const discoveredReaders = discoveredReadersRef.current || terminal.discoveredReaders || [];
      const reader = Array.isArray(discoveredReaders) ? discoveredReaders[0] : null;
      if (!reader) throw new Error("No Tap to Pay on iPhone reader found on this device.");

      const connectedResult = await terminal.connectReader(
        {
          reader,
          locationId: TERMINAL_LOCATION_ID,
          merchantDisplayName: "AfroFood",
          tosAcceptancePermitted: true,
        },
        "tapToPay"
      );
      if (connectedResult?.error) throw connectedResult.error;

      const prepRes = await fetch(`${API_BASE_URL}/api/stripe/terminal/prep-payment-intent`, {
        method: "POST",
      });
      const prepData = (await prepRes.json()) as PrepPaymentIntentResponse;
      if (!prepRes.ok || !prepData?.ok || !prepData.clientSecret) {
        throw new Error(prepData?.error || "Unable to create preparation payment.");
      }

      setSetupLog(
        lang === "de"
          ? "Karte fur die Tap to Pay Vorbereitung uber 0,50 EUR vorhalten."
          : lang === "en"
          ? "Present the card for the 0.50 EUR Tap to Pay preparation."
          : "Presentez la carte pour la preparation Tap to Pay de 0,50 EUR."
      );

      const retrieved = await terminal.retrievePaymentIntent(prepData.clientSecret);
      if (retrieved?.error) throw retrieved.error;
      const intent = retrieved?.paymentIntent;
      if (!intent) throw new Error("No payment intent returned by Terminal SDK");

      const collected = await terminal.collectPaymentMethod({
        paymentIntent: intent,
      });
      if (collected?.error) throw collected.error;

      const toProcess = collected?.paymentIntent || intent;
      const processed =
        (await terminal.confirmPaymentIntent?.({ paymentIntent: toProcess })) ||
        (await terminal.processPayment?.({ paymentIntent: toProcess })) ||
        (await terminal.processPaymentIntent?.({ paymentIntent: toProcess }));
      if (!processed) {
        throw new Error("Stripe Terminal payment confirmation is not available in this build");
      }
      if (processed?.error) throw processed.error;

      setSetupLog(stepText.prepDone);
      setPrepComplete(true);
    } catch (e: any) {
      const message = e?.message || "Unable to start Tap to Pay on iPhone setup.";
      setSetupLog(message);
      Alert.alert(t.awarenessTitle, message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader
        title={t.awarenessTitle}
        subtitle={t.awarenessSubtitle}
        lang={lang}
        onLangChange={onLangChange}
        meta={`${session.username} (${roleLabel(session.role)})`}
      />

      {setupStep === "intro" ? (
        <Section title={stepText.configTitle}>
          <Text style={styles.helpText}>{stepText.configBody}</Text>
          <Button
            label={stepText.configure}
            onPress={() => setSetupStep("terms")}
            disabled={busy}
            kind="success"
          />
          <Button label={t.logout} onPress={onLogout} kind="secondary" disabled={busy} />
        </Section>
      ) : setupStep === "terms" ? (
        <Section title={stepText.termsTitle}>
          <Text style={styles.helpText}>{stepText.termsBody}</Text>
          <View style={styles.summaryList}>
            {stepText.termsSummary.map((point) => (
              <View key={point} style={styles.summaryRow}>
                <Text style={styles.summaryBullet}>•</Text>
                <Text style={styles.summaryText}>{point}</Text>
              </View>
            ))}
          </View>
          <Button
            label={t.openAppleTerms}
            onPress={() => void Linking.openURL(APPLE_TAP_TO_PAY_TERMS_URL)}
            kind="secondary"
            disabled={busy}
          />
          <Pressable
            onPress={() => setTermsChecked((value) => !value)}
            style={styles.checkboxRow}
          >
            <View style={[styles.checkboxBox, termsChecked ? styles.checkboxBoxChecked : null]}>
              <Text style={styles.checkboxMark}>{termsChecked ? "✓" : ""}</Text>
            </View>
            <Text style={styles.checkboxLabel}>{stepText.termsCheck}</Text>
          </Pressable>
          <Button
            label={stepText.acceptContinue}
            onPress={() => setSetupStep("education")}
            disabled={busy || !termsChecked}
            kind="success"
          />
          <Button label={t.logout} onPress={onLogout} kind="secondary" disabled={busy} />
        </Section>
      ) : setupStep === "education" ? (
        <Section title={stepText.merchantGuideTitle}>
          <Text style={styles.selectedLabel}>{t.cardsTitle}</Text>
          <Text style={styles.helpText}>{t.cardsBody}</Text>
          <Text style={styles.selectedLabel}>{t.walletsTitle}</Text>
          <Text style={styles.helpText}>{t.walletsBody}</Text>
          <Text style={styles.selectedLabel}>{t.pinTitle}</Text>
          <Text style={styles.helpText}>{t.pinBody}</Text>
          <Button
            label={stepText.understood}
            onPress={() => setSetupStep("prep")}
            disabled={busy}
            kind="success"
          />
        </Section>
      ) : (
        <Section title={stepText.prepTitle}>
          <Text style={styles.successText}>{t.termsAccepted}</Text>
          <Text style={styles.helpText}>{stepText.prepAccepted}</Text>
          <Button
            label={busy ? stepText.prepBusy : stepText.prepButton}
            onPress={() => void prepareTapToPayDemoPayment()}
            disabled={busy || prepComplete}
            kind={prepComplete ? "secondary" : "success"}
          />
          <Text style={termsAcceptedBySdk || prepComplete ? styles.successText : styles.helpText}>
            {setupLog || t.setupDefault}
          </Text>
          <Button
            label={stepText.readApproved}
            onPress={onSetupComplete}
            disabled={busy || !prepComplete}
            kind="success"
          />
        </Section>
      )}
    </ScrollView>
  );
}

function EducationScreen({
  onContinue,
  onBack,
  lang,
  onLangChange,
}: {
  onContinue: () => void;
  onBack: () => void;
  lang: NativeLang;
  onLangChange: (lang: NativeLang) => void;
}) {
  const t = NATIVE_TEXT[lang];
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader
        title={t.educationTitle}
        subtitle={t.educationSubtitle}
        lang={lang}
        onLangChange={onLangChange}
      />

      <Section title={t.cardsTitle}>
        <Text style={styles.helpText}>{t.cardsBody}</Text>
      </Section>

      <Section title={t.walletsTitle}>
        <Text style={styles.helpText}>{t.walletsBody}</Text>
      </Section>

      <Section title={t.pinTitle}>
        <Text style={styles.helpText}>{t.pinBody}</Text>
      </Section>

      <Section title={t.sourceTitle}>
        <Text style={styles.helpText}>{t.sourceBody}</Text>
        <View style={styles.buttonColumn}>
          <Button
            label={t.openAppleGuidelines}
            onPress={() => void Linking.openURL(APPLE_TAP_TO_PAY_HIG_URL)}
            kind="secondary"
          />
          <Button
            label={t.openAppleTerms}
            onPress={() => void Linking.openURL(APPLE_TAP_TO_PAY_TERMS_URL)}
            kind="secondary"
          />
        </View>
      </Section>

      <View style={styles.buttonColumn}>
        <Button label={t.continueCashier} onPress={onContinue} kind="success" />
        <Button label={t.back} onPress={onBack} kind="secondary" />
      </View>
    </ScrollView>
  );
}

function LoginScreen({
  onLogin,
  lang,
  onLangChange,
}: {
  onLogin: (session: NativeSession) => void;
  lang: NativeLang;
  onLangChange: (lang: NativeLang) => void;
}) {
  const t = NATIVE_TEXT[lang];
  const [username, setUsername] = useState("existinguser");
  const [password, setPassword] = useState("0603");
  const [error, setError] = useState("");

  function submit() {
    const user = NATIVE_DEMO_USERS.find(
      (candidate) =>
        candidate.username.toLowerCase() === username.trim().toLowerCase() &&
        candidate.password === password
    );
    if (!user) {
      setError(t.invalidLogin);
      return;
    }
    if (user.role !== "cashier" && user.role !== "admin") {
      setError(t.restrictedLogin);
      return;
    }
    setError("");
    onLogin({
      username: user.username,
      role: user.role,
      loggedAt: new Date().toISOString(),
    });
  }

  return (
    <View style={styles.screen}>
      <BrandHeader
        title={t.loginTitle}
        subtitle={t.loginSubtitle}
        lang={lang}
        onLangChange={onLangChange}
        meta={`${t.api}: ${API_BASE_URL}`}
      />

      <Section title={t.openCashier}>
        <Text style={styles.fieldLabel}>{t.username}</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          placeholder="existinguser"
        />
        <Text style={styles.fieldLabel}>{t.password}</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          placeholder="0603"
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Button label={t.openCashier} onPress={submit} />
      </Section>

      <Section title={t.demoAccounts}>
        {NATIVE_DEMO_USERS.map((user) => (
          <Text key={user.username} style={styles.orderItem}>
            {user.username} / {user.password} / {roleLabel(user.role)}
          </Text>
        ))}
      </Section>
    </View>
  );
}

function HomeScreen({
  session,
  onOpenTerminal,
  onOpenEducation,
  tapSetupAccepted,
  merchantEducationSeen,
  onLogout,
  lang,
  onLangChange,
}: {
  session: NativeSession;
  onOpenTerminal: () => void;
  onOpenEducation: () => void;
  tapSetupAccepted: boolean;
  merchantEducationSeen: boolean;
  onLogout: () => void;
  lang: NativeLang;
  onLangChange: (lang: NativeLang) => void;
}) {
  const t = NATIVE_TEXT[lang];
  return (
    <View style={styles.screen}>
      <BrandHeader
        title={t.homeTitle}
        subtitle={`${t.homeSubtitle} ${session.username} (${roleLabel(session.role)})`}
        lang={lang}
        onLangChange={onLangChange}
        meta={new Date(session.loggedAt).toLocaleString()}
      />

      <Section title={t.homeSection}>
        <Text style={styles.helpText}>{t.homeBody}</Text>
        <View style={styles.buttonColumn}>
          <Button label={t.openTerminal} onPress={onOpenTerminal} />
          <Button label={t.educationButton} onPress={onOpenEducation} kind="secondary" />
          <Button label={t.logout} onPress={onLogout} kind="secondary" />
        </View>
      </Section>

      <Section title={t.handledTitle}>
        <Text style={styles.orderItem}>{t.setupAccepted}: {tapSetupAccepted ? "yes" : "no"}</Text>
        <Text style={styles.orderItem}>{t.educationSeen}: {merchantEducationSeen ? "yes" : "no"}</Text>
        <Text style={styles.orderItem}>PaymentIntent retrieval, collection, and confirmation</Text>
      </Section>
    </View>
  );
}

function TerminalScreen({
  session,
  onBack,
  onLogout,
  initialOrderId,
  lang,
  onLangChange,
}: {
  session: NativeSession;
  onBack: () => void;
  onLogout: () => void;
  initialOrderId?: string | null;
  lang: NativeLang;
  onLangChange: (lang: NativeLang) => void;
}) {
  const t = NATIVE_TEXT[lang];
  const discoveredReadersRef = useRef<any[]>([]);
  const autoPreparedOrderRef = useRef<string | null>(null);
  const terminal = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers: any[]) => {
      discoveredReadersRef.current = readers;
    },
    onDidAcceptTermsOfService: () => {
      setLogs((prev) => [
        `${new Date().toLocaleTimeString()} Official Tap to Pay on iPhone Terms accepted`,
        ...prev,
      ].slice(0, 40));
    },
  } as any) as any;

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState(t.ready);
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const cashierLaunch = Boolean(initialOrderId);

  const connected = useMemo(
    () => Boolean(terminal.connectedReader),
    [terminal.connectedReader]
  );

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  function log(line: string) {
    setStatusMessage(line);
    setLogs((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 40));
  }

  async function refreshOrders() {
    try {
      setRefreshing(true);
      if (!initialOrderId) {
        setOrders([]);
        setSelectedOrderId(null);
        setPaymentIntentId("");
        setClientSecret("");
        return;
      }
      const res = await fetch(`${API_BASE_URL}/api/orders?status=PENDING_PAYMENT`, {
        cache: "no-store",
      });
      const data = (await res.json()) as OrderRow[] | { error?: string };
      if (!res.ok || !Array.isArray(data)) {
        throw new Error(
          !Array.isArray(data) && data?.error
            ? data.error
            : "Unable to load pending orders"
        );
      }

      const cardOrders = data.filter((order) => order.payment === "card");
      const scopedOrders = cardOrders.filter((order) => order.id === initialOrderId);
      setOrders(scopedOrders);

      if (scopedOrders.length === 0) {
        setSelectedOrderId(null);
        setPaymentIntentId("");
        setClientSecret("");
        return;
      }

      setSelectedOrderId((prev) => {
        if (initialOrderId && scopedOrders.some((order) => order.id === initialOrderId)) {
          return initialOrderId;
        }
        return prev && scopedOrders.some((order) => order.id === prev)
          ? prev
          : scopedOrders[0].id;
      });
    } catch (e: any) {
      log(`Refresh failed: ${e?.message || "unknown error"}`);
      Alert.alert("Orders error", e?.message || "Unable to load pending orders");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void refreshOrders();
  }, []);

  useEffect(() => {
    if (!initialOrderId) return;
    setSelectedOrderId(initialOrderId);
    log(`Opened from cashier for order ${initialOrderId}`);
    void refreshOrders();
  }, [initialOrderId]);

  useEffect(() => {
    if (!selectedOrder) {
      setPaymentIntentId("");
      setClientSecret("");
      return;
    }

    if (
      paymentIntentId &&
      selectedOrder.stripe_payment_intent_id &&
      paymentIntentId === selectedOrder.stripe_payment_intent_id
    ) {
      return;
    }

    setPaymentIntentId(selectedOrder.stripe_payment_intent_id || "");
    setClientSecret("");
  }, [selectedOrder, paymentIntentId]);

  useEffect(() => {
    if (
      !initialOrderId ||
      !selectedOrder ||
      selectedOrder.id !== initialOrderId
    ) {
      return;
    }
    if (clientSecret.trim()) return;
    if (autoPreparedOrderRef.current === selectedOrder.id) return;
    autoPreparedOrderRef.current = selectedOrder.id;
    void loadOrCreatePaymentIntentFromSelectedOrder();
  }, [initialOrderId, selectedOrder, clientSecret]);

  async function loadOrCreatePaymentIntentFromSelectedOrder() {
    if (!selectedOrder) {
      Alert.alert("No order selected", "Select a pending card order first.");
      return null;
    }

    try {
      setBusy(true);
      const res = await fetch(`${API_BASE_URL}/api/stripe/terminal/payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: selectedOrder.id }),
      });
      const data = (await res.json()) as CreatePiResponse;
      if (!res.ok || !data?.ok || !data.clientSecret) {
        throw new Error(data?.error || "Failed to create payment intent");
      }
      setPaymentIntentId(String(data.paymentIntentId || ""));
      setClientSecret(String(data.clientSecret || ""));
      log(
        `${data.reused ? "Existing PI loaded" : "PI created"} for ${selectedOrder.id}: ${String(
          data.paymentIntentId || ""
        )}${data.status ? ` (${data.status})` : ""}`
      );
      await refreshOrders();
      return String(data.clientSecret || "");
    } catch (e: any) {
      log(`PI create failed: ${e?.message || "unknown error"}`);
      Alert.alert("Error", e?.message || "Unable to create payment intent");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function connectTapToPay() {
    try {
      setBusy(true);
      const init = await terminal.initialize();
      if (init?.error) throw init.error;
      log("Terminal initialized");
      log(`Using location: ${TERMINAL_LOCATION_ID}`);

      const discovery = await terminal.discoverReaders({
        discoveryMethod: "tapToPay",
        simulated: false,
      });
      if (discovery?.error) throw discovery.error;

      const discoveredReaders = discovery?.readers || discoveredReadersRef.current || terminal.discoveredReaders || [];
      if (!Array.isArray(discoveredReaders) || discoveredReaders.length === 0) {
        throw new Error("No Tap to Pay reader found on this iPhone");
      }

      const reader = discoveredReaders[0];
      const connectedResult = await terminal.connectReader(
        {
          reader,
          locationId: TERMINAL_LOCATION_ID,
          merchantDisplayName: "AfroFood",
          tosAcceptancePermitted: true,
        },
        "tapToPay"
      );
      if (connectedResult?.error) throw connectedResult.error;
      log("Tap to Pay connected");
      return true;
    } catch (e: any) {
      log(`Connect failed: ${e?.message || "unknown error"}`);
      Alert.alert("Connect error", e?.message || "Unable to connect Tap to Pay");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function startTapToPayCheckout() {
    if (!selectedOrder) {
      Alert.alert("No order selected", "Select a pending card order first.");
      return;
    }

    let checkoutClientSecret = clientSecret.trim();
    if (!checkoutClientSecret) {
      const loadedClientSecret = await loadOrCreatePaymentIntentFromSelectedOrder();
      log("Tap to Pay on iPhone selected: PaymentIntent requested for checkout.");
      if (!loadedClientSecret) return;
      checkoutClientSecret = loadedClientSecret;
    }

    if (!connected) {
      const didConnect = await connectTapToPay();
      log("Tap to Pay on iPhone selected: setup/connect flow requested.");
      if (!didConnect) return;
    }

    await collectAndProcessPayment(checkoutClientSecret);
  }

  async function collectAndProcessPayment(checkoutClientSecret = clientSecret.trim()) {
    if (!selectedOrder) {
      Alert.alert("No order selected", "Select a pending card order first.");
      return;
    }

    if (!checkoutClientSecret.trim()) {
      Alert.alert("Missing client secret", "Create PI from the selected order first.");
      return;
    }

    try {
      setBusy(true);

      const retrieved = await terminal.retrievePaymentIntent(checkoutClientSecret.trim());
      if (retrieved?.error) throw retrieved.error;
      const intent = retrieved?.paymentIntent;
      if (!intent) throw new Error("No payment intent returned by Terminal SDK");

      const collected = await terminal.collectPaymentMethod({
        paymentIntent: intent,
      });
      if (collected?.error) throw collected.error;

      const toProcess = collected?.paymentIntent || intent;
      const processed =
        (await terminal.confirmPaymentIntent?.({ paymentIntent: toProcess })) ||
        (await terminal.processPayment?.({ paymentIntent: toProcess })) ||
        (await terminal.processPaymentIntent?.({ paymentIntent: toProcess }));
      if (!processed) {
        throw new Error("Stripe Terminal payment confirmation is not available in this build");
      }
      if (processed?.error) throw processed.error;

      const processedIntent = processed?.paymentIntent || processed?.intent || toProcess;
      const confirmedPaymentIntentId = String(
        processedIntent?.id ||
          processedIntent?.stripeId ||
          paymentIntentId ||
          selectedOrder.stripe_payment_intent_id ||
          ""
      ).trim();

      const confirmRes = await fetch(`${API_BASE_URL}/api/orders/${selectedOrder.id}/stripe-confirm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          confirmedPaymentIntentId ? { paymentIntentId: confirmedPaymentIntentId } : {}
        ),
      });
      const confirmData = await confirmRes.json().catch(() => null);
      const alreadyConfirmed =
        !confirmRes.ok &&
        /not waiting for payment/i.test(String(confirmData?.error || ""));
      if ((!confirmRes.ok || !confirmData?.ok) && !alreadyConfirmed) {
        throw new Error(confirmData?.error || "Payment processed, but cashier confirmation failed");
      }

      log(`Payment confirmed for ${selectedOrder.id}`);
      setCompletedOrderId(selectedOrder.id);
      await fetch(`${API_BASE_URL}/api/terminal-active-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-staff-role": session.role,
        },
        body: JSON.stringify({
          action: "clear",
          username: session.username,
          orderId: selectedOrder.id,
        }),
      }).catch(() => null);
      if (!cashierLaunch) {
        Alert.alert("Success", "Payment confirmed. The order was sent to the kitchen.");
      }
      setClientSecret("");
      await refreshOrders();
    } catch (e: any) {
      log(`Collect/process failed: ${e?.message || "unknown error"}`);
      Alert.alert("Payment error", e?.message || "Could not complete payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void refreshOrders()} />
      }
    >
      <View style={styles.topBar}>
        <Text style={styles.topBarMeta}>
          {session.username} · {roleLabel(session.role)}
        </Text>
        <View style={styles.buttonRow}>
          <Button label={t.back} onPress={onBack} kind="secondary" disabled={busy} />
          <Button label={t.logout} onPress={onLogout} kind="secondary" disabled={busy} />
        </View>
      </View>
      <BrandHeader
        title={t.terminalTitle}
        subtitle={t.terminalSubtitle}
        lang={lang}
        onLangChange={onLangChange}
        meta={`${t.api}: ${API_BASE_URL} · ${t.location}: ${TERMINAL_LOCATION_ID}`}
      />

      {!cashierLaunch ? (
        <Section title={t.selectedOrder}>
          <Text style={styles.helpText}>{t.openFromCashier}</Text>
          <Button label={t.back} onPress={onBack} kind="secondary" disabled={busy} />
        </Section>
      ) : (
        <Section title={completedOrderId ? t.paymentDone : t.orderToPay}>
          {completedOrderId && !selectedOrder ? (
            <>
              <Text style={styles.successText}>{t.paidOrder}: {completedOrderId}</Text>
              <Text style={styles.helpText}>{t.returnCashier}</Text>
            </>
          ) : !selectedOrder ? (
            <>
              <Text style={styles.emptyText}>
                {t.loadingOrder} {initialOrderId || ""}...
              </Text>
              <Button
                label={refreshing ? t.refreshing : t.refresh}
                onPress={() => void refreshOrders()}
                disabled={busy || refreshing}
                kind="secondary"
              />
            </>
          ) : (
            <>
              <View style={styles.orderHeader}>
                <Text style={styles.orderId}>{selectedOrder.id}</Text>
                <Text style={styles.orderAmount}>{formatEur(selectedOrder.amount_cents)}</Text>
              </View>
              {selectedOrder.customer_name ? (
                <Text style={styles.orderMeta}>{t.client}: {selectedOrder.customer_name}</Text>
              ) : null}
              {selectedOrder.event_name ? (
                <Text style={styles.orderMeta}>{t.event}: {selectedOrder.event_name}</Text>
              ) : null}
              {selectedOrder.items.map((item, index) => (
                <Text key={`${selectedOrder.id}-${index}`} style={styles.orderItem}>
                  {item.qty}x {item.name}
                </Text>
              ))}
              <View style={styles.buttonColumn}>
                <Button
                  label={busy ? t.paying : t.pay}
                  onPress={() => void startTapToPayCheckout()}
                  disabled={busy || !selectedOrder}
                  kind="success"
                />
              </View>
              <Text style={styles.helpText}>{statusMessage}</Text>
            </>
          )}
        </Section>
      )}
    </ScrollView>
  );
}

export default function App() {
  const [session, setSession] = useState<NativeSession | null>(null);
  const [screen, setScreen] = useState<"login" | "awareness" | "education" | "home" | "terminal">("login");
  const [tapSetupAccepted, setTapSetupAccepted] = useState(false);
  const [merchantEducationSeen, setMerchantEducationSeen] = useState(false);
  const [pendingDeepLinkOrderId, setPendingDeepLinkOrderId] = useState<string | null>(null);
  const [lang, setLang] = useState<NativeLang>("fr");

  function handleDeepLink(url: string | null) {
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "afrofoodterminal:") return;
      const action = parsed.hostname || parsed.pathname.replace(/^\/+/, "");
      const nextSession = getNativeSessionFromLink(
        parsed.searchParams.get("username"),
        parsed.searchParams.get("role")
      );

      if (action === "setup") {
        setPendingDeepLinkOrderId(null);
        void openTerminalFromCashier(nextSession, null, true);
        return;
      }

      if (action === "checkout") {
        const orderId = parsed.searchParams.get("orderId");
        if (!orderId) return;
        setPendingDeepLinkOrderId(orderId);
        void openTerminalFromCashier(nextSession, orderId, false);
      }
    } catch {
      // Ignore links that are not valid AfroFood Terminal URLs.
    }
  }

  useEffect(() => {
    void Linking.getInitialURL().then(handleDeepLink);
    const subscription = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    return () => subscription.remove();
  }, []);

  async function hasCompletedSetupToday(username: string) {
    try {
      return (await AsyncStorage.getItem(getDailySetupStorageKey(username))) === "done";
    } catch {
      return false;
    }
  }

  async function markSetupCompleteToday(username: string) {
    await AsyncStorage.setItem(getDailySetupStorageKey(username), "done");
  }

  async function openTerminalFromCashier(
    nextSession: NativeSession,
    orderId: string | null,
    forceSetup: boolean
  ) {
    setSession(nextSession);
    const preparedToday = await hasCompletedSetupToday(nextSession.username);
    setTapSetupAccepted(preparedToday);
    setMerchantEducationSeen(preparedToday);
    setScreen(forceSetup || !preparedToday ? "awareness" : orderId ? "terminal" : "home");
  }

  useEffect(() => {
    if (!session || !tapSetupAccepted || !merchantEducationSeen) return;
    const currentSession = session;
    let stopped = false;

    async function pollActiveOrder() {
      try {
        const params = new URLSearchParams({ username: currentSession.username });
        const res = await fetch(`${API_BASE_URL}/api/terminal-active-order?${params.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as TerminalActiveOrderResponse;
        const orderId = String(data?.activeOrder?.orderId || "").trim();
        if (!stopped && res.ok && data?.ok && orderId && orderId !== pendingDeepLinkOrderId) {
          setPendingDeepLinkOrderId(orderId);
          setScreen("terminal");
        }
      } catch {
        // Polling is best-effort; the cashier page remains the source of truth.
      }
    }

    void pollActiveOrder();
    const interval = setInterval(() => {
      void pollActiveOrder();
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [session, tapSetupAccepted, merchantEducationSeen, pendingDeepLinkOrderId]);

  async function handleLogin(nextSession: NativeSession) {
    setSession(nextSession);
    const preparedToday = await hasCompletedSetupToday(nextSession.username);
    setTapSetupAccepted(preparedToday);
    setMerchantEducationSeen(preparedToday);
    setScreen(preparedToday ? (pendingDeepLinkOrderId ? "terminal" : "home") : "awareness");
  }

  function handleLogout() {
    setSession(null);
    setTapSetupAccepted(false);
    setMerchantEducationSeen(false);
    setScreen("login");
  }

  return (
    <StripeTerminalProvider
      tokenProvider={async () => {
        const res = await fetch(`${API_BASE_URL}/api/stripe/terminal/connection-token`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok || !data?.ok || !data?.secret) {
          throw new Error(data?.error || "Unable to get connection token");
        }
        return String(data.secret);
      }}
      logLevel="verbose"
    >
      {session && screen === "terminal" ? (
        <TerminalScreen
          session={session}
          onBack={() => {
            setPendingDeepLinkOrderId(null);
            setScreen("home");
          }}
          onLogout={handleLogout}
          initialOrderId={pendingDeepLinkOrderId}
          lang={lang}
          onLangChange={setLang}
        />
      ) : session && screen === "education" ? (
        <EducationScreen
          onContinue={() => {
            setMerchantEducationSeen(true);
            setScreen("home");
          }}
          onBack={() => setScreen(tapSetupAccepted ? "home" : "awareness")}
          lang={lang}
          onLangChange={setLang}
        />
      ) : session && screen === "awareness" ? (
        <AwarenessScreen
          session={session}
          onSetupComplete={() => {
            void markSetupCompleteToday(session.username).finally(() => {
              setTapSetupAccepted(true);
              setMerchantEducationSeen(true);
              setScreen(pendingDeepLinkOrderId ? "terminal" : "home");
            });
          }}
          onLogout={handleLogout}
          lang={lang}
          onLangChange={setLang}
        />
      ) : session ? (
        <HomeScreen
          session={session}
          onOpenTerminal={() => setScreen("terminal")}
          onOpenEducation={() => setScreen("education")}
          tapSetupAccepted={tapSetupAccepted}
          merchantEducationSeen={merchantEducationSeen}
          onLogout={handleLogout}
          lang={lang}
          onLangChange={setLang}
        />
      ) : (
        <LoginScreen onLogin={handleLogin} lang={lang} onLangChange={setLang} />
      )}
    </StripeTerminalProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f6efe7",
    padding: 20,
    gap: 12,
  },
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: "#f6efe7",
    minHeight: "100%",
    gap: 12,
  },
  hero: {
    gap: 4,
    paddingTop: 12,
  },
  brandHeader: {
    borderWidth: 1,
    borderColor: "#F1D7C8",
    borderRadius: 12,
    backgroundColor: "white",
    padding: 12,
    gap: 12,
  },
  brandTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandText: {
    flex: 1,
    minWidth: 0,
  },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#F1D7C8",
    backgroundColor: "#fffaf6",
  },
  langRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  langButton: {
    minWidth: 54,
    borderWidth: 1,
    borderColor: "#d6c9bb",
    borderRadius: 999,
    backgroundColor: "white",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  langButtonActive: {
    borderColor: "#ff7a00",
    backgroundColor: "#ff7a00",
  },
  langButtonText: {
    color: "#1f2937",
    fontWeight: "900",
    textAlign: "center",
  },
  langButtonTextActive: {
    color: "white",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  topBarMeta: {
    color: "#475569",
    fontWeight: "700",
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111",
  },
  subtitle: {
    color: "#334155",
    marginTop: 2,
  },
  meta: {
    color: "#64748b",
    fontSize: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: "#e7d7c7",
    borderRadius: 16,
    backgroundColor: "white",
    padding: 14,
    gap: 10,
  },
  cardTitle: {
    fontWeight: "900",
    fontSize: 18,
    color: "#0f172a",
  },
  fieldLabel: {
    fontWeight: "800",
    color: "#334155",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d6c9bb",
    borderRadius: 12,
    backgroundColor: "#fffaf6",
    color: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  buttonColumn: {
    gap: 10,
  },
  button: {
    backgroundColor: "#1d4ed8",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  buttonSecondary: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#0f172a",
  },
  buttonSuccess: {
    backgroundColor: "#0f9f44",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "white",
    fontWeight: "800",
    textAlign: "center",
  },
  buttonSecondaryText: {
    color: "#0f172a",
  },
  emptyText: {
    color: "#64748b",
  },
  errorText: {
    color: "#b91c1c",
    fontWeight: "700",
  },
  orderCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#fffaf6",
    gap: 4,
  },
  orderCardSelected: {
    borderColor: "#2563eb",
    borderWidth: 2,
    backgroundColor: "#eff6ff",
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
  },
  orderId: {
    fontWeight: "900",
    fontSize: 16,
    color: "#111827",
  },
  orderAmount: {
    fontWeight: "900",
    fontSize: 16,
    color: "#111827",
  },
  orderMeta: {
    color: "#475569",
    fontSize: 12,
  },
  orderItem: {
    color: "#111827",
    fontSize: 14,
  },
  selectedLabel: {
    fontWeight: "700",
    color: "#475569",
    marginTop: 2,
  },
  summaryList: {
    gap: 8,
    paddingVertical: 4,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  summaryBullet: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 16,
    lineHeight: 20,
  },
  summaryText: {
    flex: 1,
    color: "#334155",
    fontWeight: "700",
    lineHeight: 20,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  checkboxBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  checkboxBoxChecked: {
    backgroundColor: "#0f9f44",
    borderColor: "#0f9f44",
  },
  checkboxMark: {
    color: "white",
    fontWeight: "900",
    fontSize: 17,
  },
  checkboxLabel: {
    flex: 1,
    color: "#111827",
    fontWeight: "800",
    lineHeight: 20,
  },
  code: {
    color: "#111827",
    fontFamily: "Courier",
    backgroundColor: "#fffaf6",
    borderWidth: 1,
    borderColor: "#e7d7c7",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  helpText: {
    color: "#475569",
    lineHeight: 20,
  },
  successText: {
    color: "#047857",
    fontWeight: "800",
  },
  log: {
    color: "#334155",
    fontSize: 12,
    fontFamily: "Courier",
  },
});
