"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Lang } from "@/lib/translations";
import { getSavedLang, saveLang } from "@/lib/translations";
import { detectClientPlatform, type ClientPlatform } from "@/lib/payment-platform";
import { getSession, getStaffRoleLabel } from "@/lib/staff-auth";
import { goBackOr } from "@/lib/client-nav";
import {
  APPLE_TTP_ASSET_PATHS,
  getHeroBannerAssetPath,
  getLaunchEmailAssetPath,
  getMarketingHeroCopy,
  getMarketingLaunchEmailCopy,
  getMarketingPushCopy,
  getPushTemplateAssetPath,
  getTapToPayOnIphoneLabel,
} from "@/lib/tap-to-pay-marketing";

type AdminItem = {
  id: string;
  name: Record<Lang, string>;
  price: number;
  visible: boolean;
};

type AdminSection = {
  id: string;
  title: Record<Lang, string>;
  items: AdminItem[];
};

type PaymentConfig = {
  cashEnabled: boolean;
  cardEnabled: boolean;
  cashlessEnabled: boolean;
};

type StoreConfig = {
  activeEventName: string;
};

type TapToPayConfig = {
  awarenessSeen: boolean;
  termsViewed: boolean;
  termsAccepted: boolean;
  educationSeen: boolean;
  readinessStatus: "not_prepared" | "preparing" | "ready";
};

type CustomItemCategory = "dish" | "drink" | "dip";
type TapSetupStep = "awareness" | "terms" | "education" | "prepare";

function formatTapPrepareError(error: unknown, lang: Lang) {
  const message = error instanceof Error ? error.message : String(error || "Preparation failed");
  if (message.includes("Missing STRIPE_SECRET_KEY")) {
    if (lang === "de") {
      return "Tap to Pay Vorbereitung blockiert: STRIPE_SECRET_KEY fehlt auf dem Server.";
    }
    if (lang === "fr") {
      return "Preparation Tap to Pay bloquee : STRIPE_SECRET_KEY manque sur le serveur.";
    }
    return "Tap to Pay preparation is blocked: STRIPE_SECRET_KEY is missing on the server.";
  }
  return message;
}

function getTapToPayGuide(lang: Lang, platform: ClientPlatform) {
  const isIOS = platform === "ios";
  const deviceHintFr = isIOS ? "le haut de l'iPhone" : "la zone NFC de l'appareil";
  const deviceHintDe = isIOS ? "die Oberkante des iPhones" : "die NFC-Zone des Gerats";
  const deviceHintEn = isIOS ? "the top of the iPhone" : "the device NFC area";

  if (lang === "fr") {
    return {
      title: "Tap to Pay Help / Guide",
      intro: "Guide marchand a consulter juste apres l'activation, puis a tout moment dans cette section.",
      sections: [
        {
          title: "1) Cartes sans contact",
          points: [
            "Verifier le montant avant de presenter l'appareil au client.",
            `Le client approche sa carte sans contact de ${deviceHintFr}.`,
            "Attendre la confirmation avant de valider la commande.",
          ],
        },
        {
          title: "2) Apple Pay",
          points: [
            "Le client peut payer avec Apple Pay sur iPhone ou Apple Watch.",
            "Demander au client de tenir son appareil pres de votre iPhone.",
            "Garder l'ecran visible jusqu'au succes de la transaction.",
          ],
        },
        {
          title: "3) Autres wallets numeriques",
          points: [
            "Les wallets compatibles, comme Google Pay et autres wallets NFC, sont acceptes.",
            "Le geste est le meme: approcher le telephone ou wallet du point de lecture.",
          ],
        },
        {
          title: "4) PIN, accessibilite et fallback",
          points: [
            "Si PIN demande, laisser le client saisir son code.",
            "Utiliser les options d'accessibilite disponibles si necessaire.",
            "Reessayer une fois.",
            "Sinon proposer cash (ou fallback disponible).",
          ],
        },
        {
          title: "5) Apres paiement",
          points: [
            "Verifier le statut paiement/validation.",
            "Emettre le ticket client puis envoyer en cuisine.",
          ],
        },
      ],
    };
  }

  if (lang === "de") {
    return {
      title: "Tap to Pay Hilfe / Anleitung",
      intro: "Handlerleitfaden direkt nach der Aktivierung und spater jederzeit in diesem Bereich verfugbar.",
      sections: [
        {
          title: "1) Kontaktlose Karten",
          points: [
            "Betrag vor dem Vorhalten des Gerats prufen.",
            `Kunde halt die kontaktlose Karte an ${deviceHintDe}.`,
            "Bestellung erst nach erfolgreicher Bestatigung abschliessen.",
          ],
        },
        {
          title: "2) Apple Pay",
          points: [
            "Der Kunde kann mit Apple Pay auf iPhone oder Apple Watch zahlen.",
            "Kunden bitten, sein Gerat nah an Ihr iPhone zu halten.",
            "Bildschirm sichtbar lassen, bis die Transaktion erfolgreich ist.",
          ],
        },
        {
          title: "3) Andere digitale Wallets",
          points: [
            "Kompatible Wallets wie Google Pay und andere NFC-Wallets werden akzeptiert.",
            "Der Ablauf bleibt gleich: Telefon oder Wallet an das Lesefeld halten.",
          ],
        },
        {
          title: "4) PIN, Barrierefreiheit und Fallback",
          points: [
            "Wenn PIN verlangt wird, Kunde selbst eingeben lassen.",
            "Bei Bedarf verfugbare Barrierefreiheitsoptionen nutzen.",
            "Einmal erneut versuchen.",
            "Sonst Barzahlung anbieten (oder verfugbaren Fallback).",
          ],
        },
        {
          title: "5) Nach der Zahlung",
          points: [
            "Zahlungs-/Validierungsstatus prufen.",
            "Kassenbon ausgeben und an Kuche senden.",
          ],
        },
      ],
    };
  }

  return {
    title: "Tap to Pay Help / Guide",
    intro: "Merchant education available immediately after setup and later from this Tap to Pay section.",
    sections: [
      {
        title: "1) Contactless cards",
        points: [
          "Verify the amount before presenting the device to the customer.",
          `Ask the customer to tap their contactless card near ${deviceHintEn}.`,
          "Only validate the order after the payment succeeds.",
        ],
      },
      {
        title: "2) Apple Pay",
        points: [
          "Customers can pay with Apple Pay on iPhone or Apple Watch.",
          "Ask the customer to hold their device near your iPhone.",
          "Keep the screen visible until the transaction completes.",
        ],
      },
      {
        title: "3) Other digital wallets",
        points: [
          "Supported wallets such as Google Pay and other NFC wallets are accepted.",
          "The flow stays the same: hold the phone or wallet near the reader area.",
        ],
      },
      {
        title: "4) PIN, accessibility, and fallback",
        points: [
          "If PIN is requested, let the customer enter it.",
          "Use available accessibility options when needed.",
          "Retry once.",
          "Then offer cash (or other configured fallback).",
        ],
      },
      {
        title: "5) After payment",
        points: [
          "Check payment/validation status.",
          "Issue customer ticket and send order to kitchen.",
        ],
      },
    ],
  };
}

function AdminMenuPageContent() {
  const searchParams = useSearchParams();
  const [lang, setLang] = useState<Lang>("fr");
  const [clientPlatform, setClientPlatform] = useState<ClientPlatform>("other");
  const [pin, setPin] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [staffRoleSession, setStaffRoleSession] = useState<"admin" | "kitchen" | "cashier" | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sections, setSections] = useState<AdminSection[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({
    cashEnabled: true,
    cardEnabled: true,
    cashlessEnabled: true,
  });
  const [storeConfig, setStoreConfig] = useState<StoreConfig>({
    activeEventName: "",
  });
  const [newItemCategory, setNewItemCategory] = useState<CustomItemCategory>("dish");
  const [newItemName, setNewItemName] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("0");
  const [prepareMessage, setPrepareMessage] = useState<string | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [tapFlowStep, setTapFlowStep] = useState<TapSetupStep>("awareness");
  const [termsChecked, setTermsChecked] = useState(false);
  const [tapToPayConfig, setTapToPayConfig] = useState<TapToPayConfig>({
    awarenessSeen: false,
    termsViewed: false,
    termsAccepted: false,
    educationSeen: false,
    readinessStatus: "not_prepared",
  });

  useEffect(() => {
    setLang(getSavedLang());
    setClientPlatform(detectClientPlatform());
    const s = getSession();
    if (s && s.role !== "admin" && s.role !== "kitchen" && s.role !== "cashier") {
      window.location.href = "/staff";
      return;
    }
    if (s?.role === "admin" || s?.role === "kitchen" || s?.role === "cashier") {
      setStaffRoleSession(s.role);
      setIsUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (isUnlocked) {
      void loadData();
    }
  }, [isUnlocked, staffRoleSession]);

  function buildAuthHeaders(extra?: Record<string, string>) {
    if (staffRoleSession) {
      return {
        ...(extra || {}),
        "x-staff-role": staffRoleSession,
      };
    }
    return {
      ...(extra || {}),
      "x-admin-pin": pin,
    };
  }

  const allItems = useMemo(
    () =>
      sections.flatMap((section) =>
        section.items.map((item) => ({
          ...item,
          sectionId: section.id,
          isCustom: String(item.id || "").startsWith("custom-"),
        }))
      ),
    [sections]
  );
  const guide = getTapToPayGuide(lang, clientPlatform);
  const heroCopy = getMarketingHeroCopy(lang);
  const pushCopy = getMarketingPushCopy(lang);
  const emailCopy = getMarketingLaunchEmailCopy(lang);
  const ttpLabel = getTapToPayOnIphoneLabel(lang);
  const heroBannerPath = getHeroBannerAssetPath(lang);
  const launchEmailPath = getLaunchEmailAssetPath(lang);
  const pushTemplatePath = getPushTemplateAssetPath(lang);
  const canManageCatalog =
    staffRoleSession === "admin" ||
    staffRoleSession === "kitchen" ||
    staffRoleSession === "cashier" ||
    !staffRoleSession;
  const canManageOps = staffRoleSession === "admin" || staffRoleSession === "cashier" || !staffRoleSession;
  const canManageTapToPay = canManageOps;
  const view = String(searchParams.get("view") || "").toLowerCase();
  const from = String(searchParams.get("from") || "").toLowerCase();
  const fromCaisse = from === "caisse";
  const isAddView = view === "add";
  const isPricingView = view === "pricing";
  const isPaymentView = view === "payment";
  const isEventView = view === "event";
  const isTapView = view === "tap";
  const isKitchenScopedView = staffRoleSession === "kitchen" && (isAddView || isPricingView);
  const returnHref = fromCaisse
    ? isAddView || isPricingView
      ? "/staff/cuisine?from=caisse"
      : "/caisse"
    : staffRoleSession === "kitchen" || staffRoleSession === "cashier"
    ? "/staff/cuisine"
    : "/staff";
  const isFocusedView = isAddView || isPricingView || isPaymentView || isEventView || isTapView;
  const showPaymentSection = canManageOps && (isPaymentView || (!isFocusedView && !isKitchenScopedView));
  const showEventSection = canManageOps && (isEventView || (!isFocusedView && !isKitchenScopedView));
  const showTapSections = canManageTapToPay && (isTapView || (!isFocusedView && !isKitchenScopedView));
  const showGuideSection = showTapSections;
  const showMarketingSection = canManageTapToPay && (isTapView || (!isFocusedView && !isKitchenScopedView));
  const showAddSection = canManageCatalog && !isPricingView && !isPaymentView && !isEventView && !isTapView;
  const showPricingSection = canManageCatalog && !isAddView && !isPaymentView && !isEventView && !isTapView;

  useEffect(() => {
    if (!isTapView) return;
    if (!tapToPayConfig.awarenessSeen) {
      setTapFlowStep("awareness");
      return;
    }
    if (!tapToPayConfig.termsAccepted) {
      setTapFlowStep("terms");
      return;
    }
    if (!tapToPayConfig.educationSeen) {
      setTapFlowStep("education");
      return;
    }
    setTapFlowStep("prepare");
  }, [isTapView, tapToPayConfig.awarenessSeen, tapToPayConfig.termsAccepted, tapToPayConfig.educationSeen]);
  const ui = {
    paymentAllowed: lang === "de" ? "Zugelassene Zahlungen" : lang === "en" ? "Allowed payments" : "Paiements autorises",
    save: lang === "de" ? "Speichern" : lang === "en" ? "Save" : "Sauvegarder",
    saving: lang === "de" ? "Speichern..." : lang === "en" ? "Saving..." : "Sauvegarde...",
    ordersClosed:
      lang === "de"
        ? "Bestellungen geschlossen: keine Zahlungsart aktiv."
        : lang === "en"
        ? "Orders closed: no payment method enabled."
        : "Commandes fermees: aucun mode de paiement actif.",
    eventActive: lang === "de" ? "Aktives Event / Markt" : lang === "en" ? "Active event / market" : "Evenement / Marche actif",
    eventHelp:
      lang === "de"
        ? "Standardwert fur den Bestellbildschirm."
        : lang === "en"
        ? "Default value pre-filled on order screen."
        : "Valeur par defaut pre-remplie sur l'ecran commande.",
    termsTitle: "Tap to Pay on iPhone Terms",
    termsHint:
      lang === "de"
        ? "Sichtbarer Status fur Apple Review: Not accepted / Accepted."
        : lang === "en"
        ? "Visible state for Apple review: Not accepted / Accepted."
        : "Etat visible pour review Apple: Not accepted / Accepted.",
    termsAccept:
      lang === "de" ? "Review and accept Terms" : lang === "en" ? "Review and accept Terms" : "Review and accept Terms",
    termsNotAccepted: lang === "de" ? "Als Not accepted markieren" : lang === "en" ? "Mark as Not accepted" : "Mark as Not accepted",
    prepTitle:
      lang === "de" ? "Tap to Pay (Vorbereitung)" : lang === "en" ? "Tap to Pay (preparation)" : "Tap to Pay (preparation)",
    prepHint:
      lang === "de"
        ? "Stripe-Telefon ohne Bestellung und ohne Betrag vorbereiten. Der Betrag wird nur an der Kasse gesetzt."
        : lang === "en"
        ? "Prepare Stripe on device without order/amount. Amount is only set at cashier checkout."
        : "Prepare le telephone Stripe sans commande et sans montant. Le prix reste defini uniquement en caisse.",
    prepAction:
      lang === "de"
        ? "Tap to Pay aktivieren / vorbereiten"
        : lang === "en"
        ? "Enable / Prepare Tap to Pay"
        : "Activer / Preparer Tap to Pay",
    preparing: lang === "de" ? "Vorbereitung..." : lang === "en" ? "Preparing..." : "Preparation...",
    addProductTitle: lang === "de" ? "Produkt hinzufugen" : lang === "en" ? "Add product" : "Ajouter un produit",
    addProductSub:
      lang === "de"
        ? "Schnell ein Gericht, Getrank oder Dip mit Preis und Beschreibung anlegen."
        : lang === "en"
        ? "Quickly add a dish, drink, or dip with price and description."
        : "Ajouter rapidement un plat, une boisson ou un dip avec prix et description.",
    pricingTitle: lang === "de" ? "Preis / Sichtbarkeit Produkte" : lang === "en" ? "Price / product visibility" : "Prix / visibilite produits",
    pricingSub:
      lang === "de"
        ? "Produkte bearbeiten: Preis, Sichtbarkeit und benutzerdefinierte Produkte loschen."
        : lang === "en"
        ? "Edit products: price, visibility, and delete custom items."
        : "Modifier les produits: prix, visibilite et suppression des produits ajoutes.",
    addBtn: lang === "de" ? "Hinzufugen" : lang === "en" ? "Add" : "Ajouter",
    addSaving: lang === "de" ? "Hinzufugen..." : lang === "en" ? "Adding..." : "Ajout...",
    saveItem: lang === "de" ? "Speichern" : lang === "en" ? "Save" : "Sauvegarder",
    saveItemBusy: lang === "de" ? "Speichert..." : lang === "en" ? "Saving..." : "Sauvegarde...",
    visible: lang === "de" ? "Sichtbar" : lang === "en" ? "Visible" : "Visible",
    delete: lang === "de" ? "Loschen" : lang === "en" ? "Delete" : "Supprimer",
    deleting: lang === "de" ? "Loscht..." : lang === "en" ? "Deleting..." : "Suppression...",
    categoryDish: lang === "de" ? "Gericht" : lang === "en" ? "Dish" : "Plat",
    categoryDrink: lang === "de" ? "Getrank" : lang === "en" ? "Drink" : "Boisson",
    categoryDip: lang === "de" ? "Dip" : lang === "en" ? "Dip" : "Dip",
    namePlaceholder:
      lang === "de" ? "Name (z.B. Thiakry)" : lang === "en" ? "Name (e.g. Thiakry)" : "Nom (ex: Thiakry)",
	    descriptionPlaceholder: lang === "de" ? "Beschreibung" : lang === "en" ? "Description" : "Description",
      awarenessTitle:
        lang === "de"
          ? "Tap to Pay on iPhone ist verfugbar"
          : lang === "en"
          ? "Tap to Pay on iPhone is available"
          : "Tap to Pay on iPhone est disponible",
      awarenessBody:
        lang === "de"
          ? "Akzeptieren Sie kontaktlose Karten, Apple Pay und andere Wallets direkt auf dem iPhone. Richten Sie Tap to Pay vor dem Kassieren ein."
          : lang === "en"
          ? "Accept contactless cards, Apple Pay, and other wallets directly on iPhone. Set up Tap to Pay before taking payments."
          : "Acceptez cartes sans contact, Apple Pay et autres wallets directement sur iPhone. Configurez Tap to Pay avant l'encaissement.",
      awarenessPrimary:
        lang === "de" ? "Tap to Pay on iPhone einrichten" : lang === "en" ? "Set up Tap to Pay on iPhone" : "Configurer Tap to Pay on iPhone",
      awarenessSecondary:
        lang === "de" ? "Mehr erfahren" : lang === "en" ? "Learn more" : "En savoir plus",
      termsScreenTitle:
        lang === "de" ? "Tap to Pay on iPhone Nutzungsbedingungen" : lang === "en" ? "Tap to Pay on iPhone Terms and Conditions" : "Conditions d'utilisation Tap to Pay on iPhone",
      termsScreenIntro:
        lang === "de"
          ? "Bitte lesen und akzeptieren Sie die folgenden Bedingungen, bevor Sie kontaktlose Zahlungen annehmen."
          : lang === "en"
          ? "Please review and accept the following terms before accepting contactless payments."
          : "Avant d'accepter des paiements sans contact, veuillez lire et accepter les conditions suivantes.",
      termsItems:
        lang === "de"
          ? [
              "Dieses iPhone wird verwendet, um kontaktlose Zahlungen mit Tap to Pay on iPhone anzunehmen.",
              "Sie konnen kontaktlose Karten, Apple Pay und andere kompatible digitale Wallets akzeptieren.",
              "Der Zahlungsbetrag muss vor dem Vorhalten des iPhones uberpruft werden.",
              "Wenn eine PIN erforderlich ist, muss der Kunde sie selbst eingeben.",
              "Die Bestellung darf nur bestatigt werden, wenn die Zahlung erfolgreich autorisiert wurde.",
              "Falls die Zahlung fehlschlagt, muss eine andere verfugbare Zahlungsart verwendet werden.",
            ]
          : lang === "en"
          ? [
              "This iPhone will be used to accept contactless payments with Tap to Pay on iPhone.",
              "You can accept contactless cards, Apple Pay, and other supported digital wallets.",
              "The payment amount must be verified before presenting the iPhone to the customer.",
              "If a PIN is required, the customer must enter the PIN themselves.",
              "The order must only be validated after the payment has been successfully authorized.",
              "If payment fails, another available payment method must be used.",
            ]
          : [
              "Cet iPhone sera utilise pour accepter des paiements sans contact avec Tap to Pay on iPhone.",
              "Vous pouvez accepter des cartes sans contact, Apple Pay et d'autres portefeuilles numeriques compatibles.",
              "Le montant doit etre verifie avant de presenter l'iPhone au client.",
              "Si un code PIN est demande, le client doit saisir lui-meme son code.",
              "Le paiement ne doit etre valide que lorsque la transaction est correctement autorisee.",
              "En cas d'echec du paiement, vous devez utiliser un autre moyen de paiement disponible.",
            ],
      termsCheckbox:
        lang === "de"
          ? "Ich habe die Nutzungsbedingungen gelesen und akzeptiere sie."
          : lang === "en"
          ? "I have reviewed and accept the Terms and Conditions."
          : "J'ai lu et j'accepte les conditions d'utilisation.",
      termsContinue:
        lang === "de" ? "Akzeptieren und fortfahren" : lang === "en" ? "Accept Terms and Continue" : "Accepter et continuer",
      termsViewFull:
        lang === "de" ? "Vollstandige Bedingungen anzeigen" : lang === "en" ? "View full terms" : "Voir les conditions completes",
      educationTitle:
        lang === "de" ? "Tap to Pay Merchant Education" : lang === "en" ? "Tap to Pay Merchant Education" : "Guide marchand Tap to Pay",
      educationIntro:
        lang === "de"
          ? "Diese Hilfeseiten werden sofort nach der Aktivierung angezeigt und bleiben spater in den Einstellungen verfugbar."
          : lang === "en"
          ? "These education screens appear immediately after setup and remain available later in settings."
          : "Ces ecrans d'aide s'affichent juste apres l'activation et restent disponibles plus tard dans les reglages.",
      educationContinue:
        lang === "de" ? "Ich habe verstanden" : lang === "en" ? "I understand" : "J'ai compris",
      educationLater:
        lang === "de" ? "Spater erneut ansehen" : lang === "en" ? "Review later" : "Revoir plus tard",
      restartTapSetup:
        lang === "de" ? "Tap to Pay Setup neu starten" : lang === "en" ? "Restart Tap to Pay setup" : "Recommencer la configuration Tap to Pay",
      termsNeedCheck:
        lang === "de"
          ? "Bitte bestatigen Sie zuerst, dass Sie die Bedingungen gelesen haben."
          : lang === "en"
          ? "Please confirm that you reviewed the terms first."
          : "Veuillez d'abord confirmer que vous avez lu les conditions.",
		    readApproved:
		      lang === "de"
		        ? "Gelesen und akzeptiert"
	        : lang === "en"
	        ? "Read and approved"
	        : "Lu et approuve",
	    openCashier:
      lang === "de"
        ? "Kasse offnen"
        : lang === "en"
        ? "Open cashier"
        : "Ouvrir caisse",
    tapNeedReady:
      lang === "de"
        ? "Bitte zuerst Tap to Pay vorbereiten (Status Ready)."
        : lang === "en"
	        ? "Please prepare Tap to Pay first (status Ready)."
	        : "Prepare d'abord Tap to Pay (statut Ready).",
	    back: lang === "de" ? "Zuruck" : lang === "en" ? "Back" : "Retour",
	    menuTitle: lang === "de" ? "Admin Menu" : lang === "en" ? "Admin Menu" : "Admin Menu",
	    enterAdminPin: lang === "de" ? "Admin-PIN eingeben" : lang === "en" ? "Enter admin PIN" : "Entrer le PIN admin",
	    openAdmin: lang === "de" ? "Admin offnen" : lang === "en" ? "Open admin" : "Ouvrir admin",
	    loading: lang === "de" ? "Laden..." : lang === "en" ? "Loading..." : "Chargement...",
	    paymentSub:
	      lang === "de"
	        ? "Zugelassene Zahlungsmittel konfigurieren."
	        : lang === "en"
	        ? "Configure allowed payment methods."
	        : "Configurer les moyens de paiement autorises.",
	    eventSub:
	      lang === "de"
	        ? "Aktives Event / Markt festlegen."
	        : lang === "en"
	        ? "Define the active event / market."
	        : "Definir l'evenement / marche actif.",
	    tapSub:
	      lang === "de"
	        ? "Tap to Pay on iPhone konfigurieren und vorbereiten."
	        : lang === "en"
	        ? "Configure and prepare Tap to Pay on iPhone."
	        : "Configurer et preparer Tap to Pay on iPhone.",
	    defaultSub:
	      lang === "de"
	        ? "Preise und Sichtbarkeit ohne Redeploy anpassen."
	        : lang === "en"
	        ? "Edit price and visibility without redeploy."
	        : "Modifier prix et visibilite sans redeploiement.",
	  };

  async function loadData() {
    setLoading(true);
    setAuthError(null);
    const res = await fetch("/api/admin/menu-config", {
      headers: buildAuthHeaders(),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Unauthorized");
    }
    setSections(Array.isArray(data.sections) ? (data.sections as AdminSection[]) : []);
    const incoming = data.paymentConfig as Partial<PaymentConfig> | undefined;
    setPaymentConfig({
      cashEnabled: incoming?.cashEnabled !== false,
      cardEnabled: incoming?.cardEnabled !== false,
      cashlessEnabled: incoming?.cashlessEnabled !== false,
    });
    const incomingStore = data.storeConfig as Partial<StoreConfig> | undefined;
    setStoreConfig({
      activeEventName: String(incomingStore?.activeEventName || ""),
    });
    const incomingTap = data.tapToPayConfig as Partial<TapToPayConfig> | undefined;
    setTapToPayConfig({
      awarenessSeen: Boolean(incomingTap?.awarenessSeen),
      termsViewed: Boolean(incomingTap?.termsViewed),
      termsAccepted: Boolean(incomingTap?.termsAccepted),
      educationSeen: Boolean(incomingTap?.educationSeen),
      readinessStatus:
        incomingTap?.readinessStatus === "preparing" ||
        incomingTap?.readinessStatus === "ready" ||
        incomingTap?.readinessStatus === "not_prepared"
          ? incomingTap.readinessStatus
          : "not_prepared",
    });
  }

  async function saveItem(item: AdminItem) {
    try {
      setSaveError(null);
      setSavingId(item.id);
      const res = await fetch("/api/admin/menu-config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(),
        },
        body: JSON.stringify({
          itemId: item.id,
          price: item.price,
          visible: item.visible,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Save failed");
      }
    } finally {
      setSavingId(null);
    }
  }

  async function savePaymentConfig() {
    try {
      setSaveError(null);
      setSavingId("payment-config");
      const res = await fetch("/api/admin/menu-config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(),
        },
        body: JSON.stringify({
          setting: "payment_config",
          cashEnabled: paymentConfig.cashEnabled,
          cardEnabled: paymentConfig.cardEnabled,
          cashlessEnabled: paymentConfig.cashlessEnabled,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Save failed");
      }
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function saveStoreConfig() {
    try {
      setSaveError(null);
      setSavingId("store-config");
      const res = await fetch("/api/admin/menu-config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(),
        },
        body: JSON.stringify({
          setting: "store_config",
          activeEventName: storeConfig.activeEventName,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Save failed");
      }
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function createCustomItem() {
    try {
      setSaveError(null);
      setSavingId("custom-item-create");
      const res = await fetch("/api/admin/menu-config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(),
        },
        body: JSON.stringify({
          setting: "custom_item_create",
          category: newItemCategory,
          name: newItemName,
          description: newItemDesc,
          price: Number(newItemPrice),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Creation failed");
      }

      setNewItemName("");
      setNewItemDesc("");
      setNewItemPrice("0");
      await loadData();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Creation failed");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteCustomItem(itemId: string) {
    try {
      setSaveError(null);
      setSavingId(`delete-${itemId}`);
      const res = await fetch("/api/admin/menu-config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(),
        },
        body: JSON.stringify({
          setting: "custom_item_delete",
          itemId,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Delete failed");
      }
      await loadData();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSavingId(null);
    }
  }

  async function prepareTapToPay() {
    try {
      setPrepareError(null);
      setPrepareMessage(null);
      setTapToPayConfig((prev) => ({ ...prev, readinessStatus: "preparing" }));
      setSavingId("tap-to-pay-prepare");
      const res = await fetch("/api/admin/tap-to-pay/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(),
        },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Preparation failed");
      }
      setTapToPayConfig((prev) => ({ ...prev, readinessStatus: "ready" }));
      setPrepareMessage("Tap to Pay pret. Aucun montant n'a ete cree.");
    } catch (e: unknown) {
      setTapToPayConfig((prev) => ({ ...prev, readinessStatus: "not_prepared" }));
      setPrepareError(formatTapPrepareError(e, lang));
    } finally {
      setSavingId(null);
    }
  }

  async function saveTapToPayConfig(next: Partial<TapToPayConfig>) {
    try {
      setSaveError(null);
      setSavingId("tap-to-pay-config");
      const payload = {
        setting: "tap_to_pay_config",
        awarenessSeen: next.awarenessSeen ?? tapToPayConfig.awarenessSeen,
        termsViewed: next.termsViewed ?? tapToPayConfig.termsViewed,
        termsAccepted: next.termsAccepted ?? tapToPayConfig.termsAccepted,
        educationSeen: next.educationSeen ?? tapToPayConfig.educationSeen,
        readinessStatus: next.readinessStatus ?? tapToPayConfig.readinessStatus,
      };
      const res = await fetch("/api/admin/menu-config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Save failed");
      }
      setTapToPayConfig({
        awarenessSeen: Boolean(payload.awarenessSeen),
        termsViewed: Boolean(payload.termsViewed),
        termsAccepted: Boolean(payload.termsAccepted),
        educationSeen: Boolean(payload.educationSeen),
        readinessStatus: payload.readinessStatus,
      });
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function continueTapAwareness() {
    await saveTapToPayConfig({ awarenessSeen: true });
    setTapFlowStep("terms");
  }

  async function acceptTapTermsAndContinue() {
    if (!termsChecked) {
      setSaveError(ui.termsNeedCheck);
      return;
    }
    await saveTapToPayConfig({
      awarenessSeen: true,
      termsViewed: true,
      termsAccepted: true,
    });
    setSaveError(null);
    setTapFlowStep("education");
  }

  async function completeTapEducation() {
    await saveTapToPayConfig({
      awarenessSeen: true,
      termsViewed: true,
      termsAccepted: true,
      educationSeen: true,
    });
    setTapFlowStep("prepare");
  }

  async function restartTapSetup() {
    setTermsChecked(false);
    setPrepareMessage(null);
    setPrepareError(null);
    await saveTapToPayConfig({
      awarenessSeen: false,
      termsViewed: false,
      termsAccepted: false,
      educationSeen: false,
      readinessStatus: "not_prepared",
    });
    setTapFlowStep("awareness");
  }

  async function completeTapAndOpenCashier() {
    try {
      setSaveError(null);
      if (tapToPayConfig.readinessStatus !== "ready") {
        setSaveError(ui.tapNeedReady);
        return;
      }
      setSavingId("tap-to-pay-config");
      const res = await fetch("/api/admin/menu-config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(),
        },
        body: JSON.stringify({
          setting: "tap_to_pay_config",
          awarenessSeen: true,
          termsViewed: true,
          termsAccepted: true,
          educationSeen: true,
          readinessStatus: tapToPayConfig.readinessStatus,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || ui.tapNeedReady);
      }
      window.location.href = "/caisse";
    } catch {
      setSaveError(ui.tapNeedReady);
    } finally {
      setSavingId(null);
    }
  }

  if (!isUnlocked) {
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: 24,
          fontFamily: "system-ui",
          backgroundColor: "#FFF3E6",
          backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "cover, min(64vw, 420px)",
          color: "#111",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            margin: "0 auto",
            background: "rgba(17,24,39,0.85)",
            border: "1px solid #334155",
            borderRadius: 14,
            padding: 16,
            color: "white",
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
	            <button
	              type="button"
	              onClick={() => goBackOr("/staff")}
	              className="af-link-btn"
	              style={{
	                padding: "6px 10px",
	                borderRadius: 10,
	                border: "1px solid #475569",
	                background: "white",
	                color: "#111",
	                fontWeight: 800,
	                cursor: "pointer",
	              }}
	            >
	              {ui.back}
	            </button>
            {(["de", "fr", "en"] as Lang[]).map((L) => (
              <button
                key={L}
                type="button"
                onClick={() => {
                  setLang(L);
                  saveLang(L);
                }}
                className={`af-lang-btn ${lang === L ? "is-active" : ""}`}
              >
                {L.toUpperCase()}
              </button>
            ))}
          </div>
	          <h1 style={{ margin: "10px 0 0 0", fontSize: 28, fontWeight: 900 }}>{ui.menuTitle}</h1>
	          <p style={{ marginTop: 8, opacity: 0.85 }}>{ui.enterAdminPin}</p>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
            type="password"
            autoComplete="off"
            inputMode="numeric"
            placeholder="PIN"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #475569",
              background: "#0f172a",
              color: "white",
            }}
          />
          {authError ? <div style={{ color: "#fca5a5", fontWeight: 700, marginTop: 8 }}>{authError}</div> : null}
          <button
            className="af-btn"
            type="button"
            onClick={async () => {
              try {
                await loadData();
                saveLang(lang);
                setIsUnlocked(true);
              } catch (e: unknown) {
                setAuthError(e instanceof Error ? e.message : "Unauthorized");
              }
            }}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg,#ff7a00,#ff3c00)",
              color: "white",
              fontWeight: 900,
            }}
          >
	            {ui.openAdmin}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui",
        backgroundColor: "#FFF3E6",
        backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "cover, min(64vw, 420px)",
        color: "#111",
      }}
    >
	      <div style={{ maxWidth: 960, margin: "0 auto" }}>
	        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            padding: "14px 16px",
            borderRadius: 16,
            border: "1px solid var(--af-border)",
            boxShadow: "0 12px 30px rgba(242,140,40,0.18)",
            background: "white",
            position: "sticky",
            top: 12,
            zIndex: 20,
          }}
        >
	          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
		            <button type="button" onClick={() => goBackOr(returnHref)} className="af-link-btn" style={{ fontWeight: 900, color: "#111", border: "none", background: "transparent", cursor: "pointer" }}>{ui.back}</button>
	          </div>
		          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
	            <img src="/logo-afrofood.png" alt="AfroFood" style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover", border: "1px solid var(--af-border)" }} />
	            {isAddView
              ? ui.addProductTitle
              : isPricingView
              ? ui.pricingTitle
              : isPaymentView
              ? ui.paymentAllowed
              : isEventView
              ? ui.eventActive
	              : isTapView
	              ? "Tap to Pay on iPhone"
		              : ui.menuTitle}
	          </h1>
	          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
	            {staffRoleSession ? <span className="af-role-badge">Role: {getStaffRoleLabel(staffRoleSession, lang)}</span> : null}
	            {(["de", "fr", "en"] as Lang[]).map((L) => (
	              <button
                key={L}
                type="button"
                onClick={() => {
                  setLang(L);
                  saveLang(L);
                }}
                className={`af-lang-btn ${lang === L ? "is-active" : ""}`}
              >
                {L.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            height: 6,
            borderRadius: 999,
            marginTop: 12,
            background:
              "repeating-linear-gradient(90deg, #111 0 10px, #F28C28 10px 20px, #111 20px 30px, #fff 30px 40px)",
            opacity: 0.9,
          }}
        />
        <p style={{ opacity: 0.8, marginTop: 10 }}>
          {isAddView
            ? ui.addProductSub
            : isPricingView
            ? ui.pricingSub
            : isPaymentView
            ? ui.paymentSub
            : isEventView
            ? ui.eventSub
            : isTapView
            ? ui.tapSub
            : ui.defaultSub}
        </p>
        {loading ? <p>{ui.loading}</p> : null}
        {saveError ? <p style={{ color: "#b91c1c", fontWeight: 700 }}>{saveError}</p> : null}
        {isTapView && !loading ? (
          <button
            className="af-btn"
            type="button"
            onClick={restartTapSetup}
            disabled={savingId === "tap-to-pay-config"}
            style={{ marginTop: 8, padding: "10px 14px", borderRadius: 10, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800 }}
          >
            {savingId === "tap-to-pay-config" ? ui.saving : ui.restartTapSetup}
          </button>
        ) : null}

        {showPaymentSection ? (
          <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 12, padding: 12, marginTop: 12 }}>
          <div style={{ fontWeight: 900 }}>{ui.paymentAllowed}</div>
          <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={paymentConfig.cashEnabled}
                onChange={(e) =>
                  setPaymentConfig((prev) => ({
                    ...prev,
                    cashEnabled: e.target.checked,
                  }))
                }
              />
              Cash
            </label>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={paymentConfig.cardEnabled}
                onChange={(e) =>
                  setPaymentConfig((prev) => ({
                    ...prev,
                    cardEnabled: e.target.checked,
                  }))
                }
              />
              Carte
            </label>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={paymentConfig.cashlessEnabled}
                onChange={(e) =>
                  setPaymentConfig((prev) => ({
                    ...prev,
                    cashlessEnabled: e.target.checked,
                  }))
                }
              />
              Cashless
            </label>
            <button
              className="af-btn"
              type="button"
              onClick={savePaymentConfig}
              disabled={savingId === "payment-config"}
              style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#111", color: "white", fontWeight: 800 }}
            >
                  {savingId === "payment-config" ? ui.saving : ui.save}
                </button>
              </div>
              {!paymentConfig.cashEnabled && !paymentConfig.cardEnabled && !paymentConfig.cashlessEnabled ? (
                <div style={{ marginTop: 8, color: "#b45309", fontWeight: 700 }}>
                  {ui.ordersClosed}
                </div>
              ) : null}
            </div>
          ) : null}

            {showEventSection ? (
              <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 12, padding: 12, marginTop: 12 }}>
          <div style={{ fontWeight: 900 }}>{ui.eventActive}</div>
          <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
            {ui.eventHelp}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              value={storeConfig.activeEventName}
              onChange={(e) => setStoreConfig({ activeEventName: e.target.value })}
              placeholder="ex: Stadtfest Offenburg"
              style={{ minWidth: 280, flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd" }}
            />
            <button
              className="af-btn"
              type="button"
              onClick={saveStoreConfig}
              disabled={savingId === "store-config"}
              style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#111", color: "white", fontWeight: 800 }}
            >
              {savingId === "store-config" ? ui.saving : ui.save}
            </button>
          </div>
        </div>
            ) : null}

        {showTapSections ? (
          isTapView ? (
            <>
              {tapFlowStep === "awareness" ? (
                <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 16, padding: 16, marginTop: 12 }}>
                  <div style={{ display: "grid", gap: 14 }}>
                    <img src={heroBannerPath} alt="Tap to Pay awareness" style={{ width: "100%", borderRadius: 12, border: "1px solid var(--af-border)" }} />
                    <div style={{ fontSize: 24, fontWeight: 900 }}>{ui.awarenessTitle}</div>
                    <div style={{ color: "#5b5b5b", lineHeight: 1.5 }}>{ui.awarenessBody}</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        className="af-btn"
                        type="button"
                        onClick={continueTapAwareness}
                        disabled={savingId === "tap-to-pay-config"}
                        style={{ padding: "12px 16px", borderRadius: 12, border: "none", background: "#111", color: "white", fontWeight: 900 }}
                      >
                        {savingId === "tap-to-pay-config" ? ui.saving : ui.awarenessPrimary}
                      </button>
                      <button
                        className="af-btn"
                        type="button"
                        onClick={() => {
                          setTapToPayConfig((prev) => ({ ...prev, awarenessSeen: true }));
                          setTapFlowStep("education");
                        }}
                        style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800 }}
                      >
                        {ui.awarenessSecondary}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {tapFlowStep === "terms" ? (
                <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 16, padding: 16, marginTop: 12 }}>
                  <div style={{ fontWeight: 900, fontSize: 22 }}>{ui.termsScreenTitle}</div>
                  <div style={{ marginTop: 8, color: "#5b5b5b", lineHeight: 1.5 }}>{ui.termsScreenIntro}</div>
                  <div style={{ marginTop: 12, maxHeight: 280, overflowY: "auto", border: "1px solid var(--af-border)", borderRadius: 12, padding: 12, background: "#fffaf6" }}>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {ui.termsItems.map((item) => (
                        <li key={item} style={{ marginTop: 8, lineHeight: 1.5 }}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>{ui.termsViewFull}</div>
                  <label style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "flex-start", fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={termsChecked}
                      onChange={(e) => setTermsChecked(e.target.checked)}
                    />
                    <span>{ui.termsCheckbox}</span>
                  </label>
                  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      className="af-btn"
                      type="button"
                      onClick={acceptTapTermsAndContinue}
                      disabled={savingId === "tap-to-pay-config"}
                      style={{ padding: "12px 16px", borderRadius: 12, border: "none", background: "#111", color: "white", fontWeight: 900 }}
                    >
                      {savingId === "tap-to-pay-config" ? ui.saving : ui.termsContinue}
                    </button>
                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontWeight: 800,
                        background: tapToPayConfig.termsAccepted ? "#dcfce7" : "#fee2e2",
                        color: tapToPayConfig.termsAccepted ? "#166534" : "#991b1b",
                        border: `1px solid ${tapToPayConfig.termsAccepted ? "#86efac" : "#fecaca"}`,
                      }}
                    >
                      {tapToPayConfig.termsAccepted ? "Accepted" : "Not accepted"}
                    </div>
                  </div>
                </div>
              ) : null}

              {tapFlowStep === "education" ? (
                <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 16, padding: 16, marginTop: 12 }}>
                  <div style={{ fontWeight: 900, fontSize: 22 }}>{ui.educationTitle}</div>
                  <div style={{ marginTop: 8, color: "#5b5b5b", lineHeight: 1.5 }}>{ui.educationIntro}</div>
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {guide.sections.map((section) => (
                      <div key={section.title} style={{ border: "1px solid var(--af-border)", borderRadius: 12, padding: 12, background: "#fffaf6" }}>
                        <div style={{ fontWeight: 800, marginBottom: 8 }}>{section.title}</div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {section.points.map((point) => (
                            <li key={point} style={{ marginTop: 6, lineHeight: 1.45 }}>
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      className="af-btn"
                      type="button"
                      onClick={completeTapEducation}
                      disabled={savingId === "tap-to-pay-config"}
                      style={{ padding: "12px 16px", borderRadius: 12, border: "none", background: "#111", color: "white", fontWeight: 900 }}
                    >
                      {savingId === "tap-to-pay-config" ? ui.saving : ui.educationContinue}
                    </button>
                    <button
                      className="af-btn"
                      type="button"
                      onClick={completeTapEducation}
                      style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800 }}
                    >
                      {ui.educationLater}
                    </button>
                  </div>
                </div>
              ) : null}

              {tapFlowStep === "prepare" ? (
                <>
                  <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 12, padding: 12, marginTop: 12 }}>
                    <div style={{ fontWeight: 900 }}>{ui.termsTitle}</div>
                    <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>{ui.termsHint}</div>
                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontWeight: 800,
                          background: tapToPayConfig.termsAccepted ? "#dcfce7" : "#fee2e2",
                          color: tapToPayConfig.termsAccepted ? "#166534" : "#991b1b",
                          border: `1px solid ${tapToPayConfig.termsAccepted ? "#86efac" : "#fecaca"}`,
                        }}
                      >
                        {tapToPayConfig.termsAccepted ? "Accepted" : "Not accepted"}
                      </div>
                      <button
                        className="af-btn"
                        type="button"
                        onClick={() => {
                          setTermsChecked(false);
                          setTapFlowStep("terms");
                        }}
                        style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800 }}
                      >
                        {ui.termsViewFull}
                      </button>
                    </div>
                  </div>

                  <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 12, padding: 12, marginTop: 12 }}>
                    <div style={{ fontWeight: 900 }}>{ui.prepTitle}</div>
                    <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>{ui.prepHint}</div>
                    <div
                      style={{
                        marginTop: 8,
                        display: "inline-block",
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontWeight: 800,
                        background:
                          tapToPayConfig.readinessStatus === "ready"
                            ? "#dcfce7"
                            : tapToPayConfig.readinessStatus === "preparing"
                            ? "#fef3c7"
                            : "#e2e8f0",
                        color:
                          tapToPayConfig.readinessStatus === "ready"
                            ? "#166534"
                            : tapToPayConfig.readinessStatus === "preparing"
                            ? "#92400e"
                            : "#334155",
                        border:
                          tapToPayConfig.readinessStatus === "ready"
                            ? "1px solid #86efac"
                            : tapToPayConfig.readinessStatus === "preparing"
                            ? "1px solid #fcd34d"
                            : "1px solid #cbd5e1",
                      }}
                    >
                      {tapToPayConfig.readinessStatus === "ready"
                        ? "Ready"
                        : tapToPayConfig.readinessStatus === "preparing"
                        ? "Preparing..."
                        : "Not prepared"}
                    </div>
                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        className="af-btn"
                        type="button"
                        onClick={prepareTapToPay}
                        disabled={savingId === "tap-to-pay-prepare"}
                        style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#111", color: "white", fontWeight: 800 }}
                      >
                        {savingId === "tap-to-pay-prepare" ? ui.preparing : ui.prepAction}
                      </button>
                    </div>
                    {prepareMessage ? <div style={{ marginTop: 8, color: "#166534", fontWeight: 700 }}>{prepareMessage}</div> : null}
                    {prepareError ? <div style={{ marginTop: 8, color: "#b91c1c", fontWeight: 700 }}>{prepareError}</div> : null}
                  </div>

                  <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 12, padding: 12, marginTop: 12 }}>
                    <div style={{ fontWeight: 900 }}>{guide.title}</div>
                    <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>{guide.intro}</div>
                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      {guide.sections.map((section) => (
                        <div key={section.title} style={{ border: "1px solid var(--af-border)", borderRadius: 10, padding: 10, background: "#fffaf6" }}>
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>{section.title}</div>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {section.points.map((point) => (
                              <li key={point} style={{ marginTop: 4, lineHeight: 1.35 }}>
                                {point}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>

                  {fromCaisse ? (
                    <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 12, padding: 12, marginTop: 12 }}>
                      <div style={{ fontWeight: 900 }}>{ui.readApproved}</div>
                      <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>{ui.openCashier}</div>
                      <button
                        className="af-btn"
                        type="button"
                        onClick={completeTapAndOpenCashier}
                        disabled={savingId === "tap-to-pay-config"}
                        style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#ff7a00,#ff3c00)", color: "white", fontWeight: 900 }}
                      >
                        {savingId === "tap-to-pay-config" ? ui.saving : `${ui.readApproved} - ${ui.openCashier}`}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <>
              <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 12, padding: 12, marginTop: 12 }}>
                <div style={{ fontWeight: 900 }}>{ui.termsTitle}</div>
                <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>{ui.termsHint}</div>
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      fontWeight: 800,
                      background: tapToPayConfig.termsAccepted ? "#dcfce7" : "#fee2e2",
                      color: tapToPayConfig.termsAccepted ? "#166534" : "#991b1b",
                      border: `1px solid ${tapToPayConfig.termsAccepted ? "#86efac" : "#fecaca"}`,
                    }}
                  >
                    {tapToPayConfig.termsAccepted ? "Accepted" : "Not accepted"}
                  </div>
                </div>
              </div>

              <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 12, padding: 12, marginTop: 12 }}>
                <div style={{ fontWeight: 900 }}>{guide.title}</div>
                <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>{guide.intro}</div>
              </div>
            </>
          )
        ) : null}

        {showGuideSection && !isTapView ? (
          <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 12, padding: 12, marginTop: 12 }}>
            <div style={{ fontWeight: 900 }}>{guide.title}</div>
            <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>{guide.intro}</div>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {guide.sections.map((section) => (
                <div key={section.title} style={{ border: "1px solid var(--af-border)", borderRadius: 10, padding: 10, background: "#fffaf6" }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>{section.title}</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {section.points.map((point) => (
                      <li key={point} style={{ marginTop: 4, lineHeight: 1.35 }}>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {showMarketingSection ? (
          <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 12, padding: 12, marginTop: 12 }}>
          <div style={{ fontWeight: 900 }}>Apple Marketing Compliance ({ttpLabel})</div>
          <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
            Utiliser les assets Apple officiels dans les chemins ci-dessous. Les textes ci-dessous sont prets pour Hero, Push et Launch Email.
          </div>

          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid var(--af-border)", background: "#fffaf6" }}>
            <div style={{ fontWeight: 800 }}>Assets paths (a deposer dans /public)</div>
              <div style={{ marginTop: 6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
              {heroBannerPath}
              <br />
              {launchEmailPath}
              <br />
              {pushTemplatePath}
            </div>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <div style={{ border: "1px solid var(--af-border)", borderRadius: 10, padding: 10, background: "#fffaf6" }}>
              <div style={{ fontWeight: 800 }}>Hero banner copy</div>
              <img src={heroBannerPath} alt="Apple Tap to Pay Hero" style={{ marginTop: 8, width: "100%", maxWidth: 260, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <div style={{ marginTop: 4 }}><b>Title:</b> {heroCopy.title}</div>
              <div style={{ marginTop: 2 }}><b>Body:</b> {heroCopy.body}</div>
              <div style={{ marginTop: 2 }}><b>CTA:</b> {heroCopy.cta}</div>
            </div>

            <div style={{ border: "1px solid var(--af-border)", borderRadius: 10, padding: 10, background: "#fffaf6" }}>
              <div style={{ fontWeight: 800 }}>Push copy</div>
              <img src={pushTemplatePath} alt="Apple Tap to Pay Push Template" style={{ marginTop: 8, width: "100%", maxWidth: 260, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <div style={{ marginTop: 4 }}><b>Title:</b> {pushCopy.title}</div>
              <div style={{ marginTop: 2 }}><b>Body:</b> {pushCopy.body}</div>
            </div>

            <div style={{ border: "1px solid var(--af-border)", borderRadius: 10, padding: 10, background: "#fffaf6" }}>
              <div style={{ fontWeight: 800 }}>Launch email copy</div>
              <img src={launchEmailPath} alt="Apple Tap to Pay Launch Email" style={{ marginTop: 8, width: "100%", maxWidth: 260, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <div style={{ marginTop: 4 }}><b>Subject:</b> {emailCopy.subject}</div>
              <pre style={{ marginTop: 6, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
                {emailCopy.body}
              </pre>
            </div>
          </div>
        </div>
        ) : null}

        {showAddSection ? (
          <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 12, padding: 12, marginTop: 12 }}>
          <div style={{ fontWeight: 900 }}>{ui.addProductTitle}</div>
          <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
            {ui.addProductSub}
          </div>
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <select
              value={newItemCategory}
              onChange={(e) => setNewItemCategory(e.target.value as CustomItemCategory)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", maxWidth: 220 }}
            >
              <option value="dish">{ui.categoryDish}</option>
              <option value="drink">{ui.categoryDrink}</option>
              <option value="dip">{ui.categoryDip}</option>
            </select>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder={ui.namePlaceholder}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd" }}
            />
            <input
              type="text"
              value={newItemDesc}
              onChange={(e) => setNewItemDesc(e.target.value)}
              placeholder={ui.descriptionPlaceholder}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd" }}
            />
            <input
              type="number"
              min={0}
              step={0.1}
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", maxWidth: 180 }}
            />
            <button
              className="af-btn"
              type="button"
              onClick={createCustomItem}
              disabled={savingId === "custom-item-create"}
              style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#111", color: "white", fontWeight: 800, width: "fit-content" }}
            >
              {savingId === "custom-item-create" ? ui.addSaving : ui.addBtn}
            </button>
          </div>
        </div>
        ) : null}

        {showPricingSection ? (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {(isPricingView || isKitchenScopedView) ? (
            <div style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 900 }}>{ui.pricingTitle}</div>
              <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>{ui.pricingSub}</div>
            </div>
          ) : null}
          {allItems.map((item) => (
            <div key={item.id} style={{ background: "white", border: "1px solid var(--af-border)", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 900 }}>{item.name[lang]}</div>
              <div style={{ opacity: 0.7, fontSize: 12, marginTop: 2 }}>{item.id}</div>
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={Number.isFinite(item.price) ? item.price : 0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setSections((prev) =>
                      prev.map((section) => ({
                        ...section,
                        items: section.items.map((it) => (it.id === item.id ? { ...it, price: Number.isFinite(v) ? v : 0 } : it)),
                      }))
                    );
                  }}
                  style={{ width: 120, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd" }}
                />
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={item.visible}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSections((prev) =>
                        prev.map((section) => ({
                          ...section,
                          items: section.items.map((it) => (it.id === item.id ? { ...it, visible: checked } : it)),
                        }))
                      );
                    }}
                  />
                  {ui.visible}
                </label>
                <button
                  className="af-btn"
                  type="button"
                  onClick={() => saveItem(item)}
                  disabled={savingId === item.id}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#111", color: "white", fontWeight: 800 }}
                >
                  {savingId === item.id ? ui.saveItemBusy : ui.saveItem}
                </button>
                {item.isCustom ? (
                  <button
                    className="af-btn"
                    type="button"
                    onClick={() => deleteCustomItem(item.id)}
                    disabled={savingId === `delete-${item.id}`}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#b91c1c", color: "white", fontWeight: 800 }}
                  >
                    {savingId === `delete-${item.id}` ? ui.deleting : ui.delete}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        ) : null}
      </div>
    </main>
  );
}

export default function AdminMenuPage() {
  return (
    <Suspense fallback={null}>
      <AdminMenuPageContent />
    </Suspense>
  );
}
