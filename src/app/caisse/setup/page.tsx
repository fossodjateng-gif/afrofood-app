"use client";

import { useEffect, useState } from "react";
import {
  getHeroBannerAssetPath,
  getTapToPayOnIphoneLabel,
} from "@/lib/tap-to-pay-marketing";
import { detectClientPlatform, type ClientPlatform } from "@/lib/payment-platform";
import { getSession, getStaffRoleLabel, type StaffRole, type StaffSession } from "@/lib/staff-auth";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { goBackOr } from "@/lib/client-nav";

type TapToPayConfig = {
  awarenessSeen: boolean;
  termsViewed: boolean;
  termsAccepted: boolean;
  educationSeen: boolean;
  readinessStatus: "not_prepared" | "preparing" | "ready";
};

type TapSetupStep = "awareness" | "terms" | "education" | "prepare";
type UserTapSetupProgress = Pick<TapToPayConfig, "awarenessSeen" | "termsViewed" | "termsAccepted" | "educationSeen">;

const BRAND = {
  orangeSoft: "#FFF3E6",
  border: "#F1D7C8",
  black: "#111",
};

function getTapSetupProgressKey(userId: string) {
  return `af_ttp_setup_progress_${userId}`;
}

function readUserTapSetupProgress(userId: string): UserTapSetupProgress {
  if (typeof window === "undefined") {
    return {
      awarenessSeen: false,
      termsViewed: false,
      termsAccepted: false,
      educationSeen: false,
    };
  }
  try {
    const raw = localStorage.getItem(getTapSetupProgressKey(userId));
    if (!raw) {
      return {
        awarenessSeen: false,
        termsViewed: false,
        termsAccepted: false,
        educationSeen: false,
      };
    }
    const parsed = JSON.parse(raw) as Partial<UserTapSetupProgress>;
    return {
      awarenessSeen: Boolean(parsed.awarenessSeen),
      termsViewed: Boolean(parsed.termsViewed),
      termsAccepted: Boolean(parsed.termsAccepted),
      educationSeen: Boolean(parsed.educationSeen),
    };
  } catch {
    return {
      awarenessSeen: false,
      termsViewed: false,
      termsAccepted: false,
      educationSeen: false,
    };
  }
}

function writeUserTapSetupProgress(userId: string, progress: UserTapSetupProgress) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getTapSetupProgressKey(userId), JSON.stringify(progress));
}

function getPreparationResetMarker(session: StaffSession) {
  return `af_ttp_prepare_reset_${session.userId}_${session.loggedAt}`;
}

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

function isTapPrepareError(message: string | null) {
  if (!message) return false;
  return message.toLowerCase().includes("tap to pay") || message.includes("STRIPE_SECRET_KEY");
}

function getGuide(lang: Lang, platform: ClientPlatform) {
  const isIOS = platform === "ios";
  const deviceHintFr = isIOS ? "le haut de l'iPhone" : "la zone NFC de l'appareil";
  const deviceHintDe = isIOS ? "die Oberkante des iPhones" : "die NFC-Zone des Gerats";
  const deviceHintEn = isIOS ? "the top of the iPhone" : "the device NFC area";

  if (lang === "fr") {
    return {
      title: "Guide marchand Tap to Pay",
      intro: "Ces ecrans d'aide s'affichent apres l'activation et restent disponibles avant l'ouverture de la caisse.",
      continueLabel: "J'ai compris",
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
          ],
        },
        {
          title: "3) Autres wallets numeriques",
          points: [
            "Les wallets compatibles, comme Google Pay et autres wallets NFC, sont acceptes.",
            "Le geste reste le meme: approcher le telephone ou wallet du point de lecture.",
          ],
        },
        {
          title: "4) PIN, accessibilite et fallback",
          points: [
            "Si un code PIN est demande, le client saisit lui-meme son code.",
            "Utiliser les options d'accessibilite si necessaire.",
            "En cas d'echec, reessayer une fois puis proposer cash.",
          ],
        },
      ],
    };
  }

  if (lang === "de") {
    return {
      title: "Tap to Pay Handlerleitfaden",
      intro: "Diese Hilfeseiten werden nach der Aktivierung angezeigt und bleiben vor dem Offnen der Kasse verfugbar.",
      continueLabel: "Ich habe verstanden",
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
            "Kunden konnen mit Apple Pay auf iPhone oder Apple Watch zahlen.",
            "Kunden bitten, ihr Gerat nah an Ihr iPhone zu halten.",
          ],
        },
        {
          title: "3) Andere Wallets",
          points: [
            "Kompatible Wallets wie Google Pay und andere NFC-Wallets werden akzeptiert.",
            "Der Ablauf bleibt gleich: Telefon oder Wallet an das Lesefeld halten.",
          ],
        },
        {
          title: "4) PIN, Barrierefreiheit und Fallback",
          points: [
            "Wenn eine PIN erforderlich ist, gibt der Kunde sie selbst ein.",
            "Barrierefreiheitsoptionen bei Bedarf nutzen.",
            "Bei Fehler einmal erneut versuchen, danach Barzahlung anbieten.",
          ],
        },
      ],
    };
  }

  return {
    title: "Tap to Pay Merchant Education",
    intro: "These education screens appear after setup and remain available before opening the cashier.",
    continueLabel: "I understand",
    sections: [
      {
        title: "1) Contactless cards",
        points: [
          "Verify the amount before presenting the device to the customer.",
          `Ask the customer to tap their contactless card near ${deviceHintEn}.`,
          "Only validate the order after payment succeeds.",
        ],
      },
      {
        title: "2) Apple Pay",
        points: [
          "Customers can pay with Apple Pay on iPhone or Apple Watch.",
          "Ask the customer to hold their device near your iPhone.",
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
          "If a PIN is required, the customer enters the PIN themselves.",
          "Use accessibility options when needed.",
          "If payment fails, retry once and then offer cash.",
        ],
      },
    ],
  };
}

function getTerms(lang: Lang) {
  if (lang === "fr") {
    return {
      title: "Conditions d'utilisation Tap to Pay on iPhone",
      intro: "Avant d'accepter des paiements sans contact, veuillez lire et accepter les conditions suivantes.",
      checkbox: "J'ai lu et j'accepte les conditions d'utilisation.",
      action: "Accepter et continuer",
      points: [
        "Cet iPhone sera utilise pour accepter des paiements sans contact avec Tap to Pay on iPhone.",
        "Vous pouvez accepter des cartes sans contact, Apple Pay et d'autres portefeuilles numeriques compatibles.",
        "Le montant doit etre verifie avant de presenter l'iPhone au client.",
        "Si un code PIN est demande, le client doit saisir lui-meme son code.",
        "Le paiement ne doit etre valide que lorsque la transaction est correctement autorisee.",
        "En cas d'echec du paiement, vous devez utiliser un autre moyen de paiement disponible.",
      ],
    };
  }

  if (lang === "de") {
    return {
      title: "Tap to Pay on iPhone Nutzungsbedingungen",
      intro: "Bitte lesen und akzeptieren Sie die folgenden Bedingungen, bevor Sie kontaktlose Zahlungen annehmen.",
      checkbox: "Ich habe die Nutzungsbedingungen gelesen und akzeptiere sie.",
      action: "Akzeptieren und fortfahren",
      points: [
        "Dieses iPhone wird verwendet, um kontaktlose Zahlungen mit Tap to Pay on iPhone anzunehmen.",
        "Sie konnen kontaktlose Karten, Apple Pay und andere kompatible digitale Wallets akzeptieren.",
        "Der Zahlungsbetrag muss vor dem Vorhalten des iPhones uberpruft werden.",
        "Wenn eine PIN erforderlich ist, muss der Kunde sie selbst eingeben.",
        "Die Bestellung darf nur bestatigt werden, wenn die Zahlung erfolgreich autorisiert wurde.",
        "Falls die Zahlung fehlschlagt, muss eine andere verfugbare Zahlungsart verwendet werden.",
      ],
    };
  }

  return {
    title: "Tap to Pay on iPhone Terms and Conditions",
    intro: "Please review and accept the following terms before accepting contactless payments.",
    checkbox: "I have reviewed and accept the Terms and Conditions.",
    action: "Accept Terms and Continue",
    points: [
      "This iPhone will be used to accept contactless payments with Tap to Pay on iPhone.",
      "You can accept contactless cards, Apple Pay, and other supported digital wallets.",
      "The payment amount must be verified before presenting the iPhone to the customer.",
      "If a PIN is required, the customer must enter the PIN themselves.",
      "The order must only be validated after the payment has been successfully authorized.",
      "If payment fails, another available payment method must be used.",
    ],
  };
}

export default function CaisseSetupPage() {
  const [lang, setLang] = useState<Lang>("fr");
  const [platform, setPlatform] = useState<ClientPlatform>("other");
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [session, setSession] = useState<StaffSession | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [hasServerConnection, setHasServerConnection] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prepareMessage, setPrepareMessage] = useState<string | null>(null);
  const [termsChecked, setTermsChecked] = useState(false);
  const [hasCompletedSetupBefore, setHasCompletedSetupBefore] = useState(false);
  const [tapConfig, setTapConfig] = useState<TapToPayConfig>({
    awarenessSeen: false,
    termsViewed: false,
    termsAccepted: false,
    educationSeen: false,
    readinessStatus: "not_prepared",
  });

  useEffect(() => {
    setLang(getSavedLang());
    setPlatform(detectClientPlatform());
    setIsOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const session = getSession();
    if (!session) {
      window.location.href = "/team/login";
      return;
    }
    if (session.role !== "cashier" && session.role !== "admin") {
      window.location.href = "/staff";
      return;
    }
    setSession(session);
    setStaffRole(session.role);
  }, []);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (!staffRole || !session?.userId) return;
    void loadConfig(staffRole, session.userId);
  }, [staffRole, session?.userId]);

  useEffect(() => {
    if (!staffRole || !session || loading) return;
    if (staffRole !== "admin") return;
    const marker = getPreparationResetMarker(session);
    if (sessionStorage.getItem(marker) === "1") return;
    sessionStorage.setItem(marker, "1");
    setPrepareMessage(null);
    void saveReadinessStatus("not_prepared");
  }, [staffRole, session, loading]);

  const terms = getTerms(lang);
  const guide = getGuide(lang, platform);
  const heroBannerPath = getHeroBannerAssetPath(lang);
  const ttpLabel = getTapToPayOnIphoneLabel(lang);
  const backLabel = lang === "de" ? "Zuruck" : lang === "en" ? "Back" : "Retour";
  const awarenessTitle =
    lang === "de" ? "Tap to Pay on iPhone ist verfugbar" : lang === "en" ? "Tap to Pay on iPhone is available" : "Tap to Pay on iPhone est disponible";
  const awarenessBody =
    lang === "de"
      ? "Akzeptieren Sie kontaktlose Karten, Apple Pay und andere Wallets direkt auf dem iPhone. Richten Sie Tap to Pay vor dem Kassieren ein."
      : lang === "en"
      ? "Accept contactless cards, Apple Pay, and other wallets directly on iPhone. Set up Tap to Pay before taking payments."
      : "Acceptez cartes sans contact, Apple Pay et autres wallets directement sur iPhone. Configurez Tap to Pay avant l'encaissement.";
  const awarenessPrimary =
    lang === "de" ? "Tap to Pay on iPhone einrichten" : lang === "en" ? "Set up Tap to Pay on iPhone" : "Configurer Tap to Pay on iPhone";
  const statusLabel =
    tapConfig.readinessStatus === "ready"
      ? "Ready"
      : tapConfig.readinessStatus === "preparing"
      ? "Preparing..."
      : "Not prepared";
  const isActivationAdmin = staffRole === "admin" || staffRole === "cashier";
  const adminRequiredMessage =
    lang === "de"
      ? "Nur ein Admin darf Tap to Pay on iPhone Bedingungen akzeptieren und die Funktion aktivieren. Bitte bitten Sie einen Admin, Tap to Pay zu aktivieren."
      : lang === "en"
      ? "Only an admin can accept Tap to Pay on iPhone terms and enable the feature. Please ask an admin to enable Tap to Pay."
      : "Seul un admin peut accepter les conditions Tap to Pay on iPhone et activer la fonction. Demandez a un admin d'activer Tap to Pay.";

  const step: TapSetupStep = !tapConfig.awarenessSeen
    ? "awareness"
    : !tapConfig.termsAccepted
    ? "terms"
    : !tapConfig.educationSeen
    ? "education"
    : "prepare";
  const awarenessSecondary =
    lang === "de" ? "Mehr erfahren" : lang === "en" ? "Learn more" : "En savoir plus";
  const restartLabel =
    lang === "de" ? "Tap to Pay Setup neu starten" : lang === "en" ? "Restart Tap to Pay setup" : "Recommencer la configuration Tap to Pay";
  const canOpenCashier = tapConfig.awarenessSeen && tapConfig.termsAccepted && tapConfig.educationSeen;
  const setupCompleted = hasCompletedSetupBefore;
  const shouldShowAdminBlock = !isActivationAdmin && !setupCompleted;
  const connectionBlocked = !isOnline || !hasServerConnection;
  const offlineMessage =
    lang === "de"
      ? "Tap to Pay ist blockiert, solange keine Verbindung verfugbar ist."
      : lang === "en"
      ? "Tap to Pay is blocked while no connection is available."
      : "Tap to Pay est bloque tant qu'aucune connexion n'est disponible.";
  const prepareError = isTapPrepareError(error) ? error : null;
  const generalError = !isTapPrepareError(error) ? error : null;
  async function loadConfig(role: StaffRole, userId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/menu-config", {
        headers: { "x-staff-role": role },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Unauthorized");
      }
      const incoming = data.tapToPayConfig as Partial<TapToPayConfig> | undefined;
      const serverProgress: TapToPayConfig = {
        awarenessSeen: Boolean(incoming?.awarenessSeen),
        termsViewed: Boolean(incoming?.termsViewed),
        termsAccepted: Boolean(incoming?.termsAccepted),
        educationSeen: Boolean(incoming?.educationSeen),
        readinessStatus:
          incoming?.readinessStatus === "ready" ||
          incoming?.readinessStatus === "preparing" ||
          incoming?.readinessStatus === "not_prepared"
            ? incoming.readinessStatus
            : "not_prepared",
      };
      const userProgress = role === "admin" ? serverProgress : readUserTapSetupProgress(userId);
      const mergedProgress = serverProgress.termsAccepted ? serverProgress : userProgress;
      setHasServerConnection(true);
      setHasCompletedSetupBefore(
        mergedProgress.awarenessSeen && mergedProgress.termsAccepted && mergedProgress.educationSeen
      );
      setTapConfig({
        awarenessSeen: mergedProgress.awarenessSeen,
        termsViewed: mergedProgress.termsViewed,
        termsAccepted: mergedProgress.termsAccepted,
        educationSeen: mergedProgress.educationSeen,
        readinessStatus: serverProgress.readinessStatus,
      });
    } catch (e: unknown) {
      setHasServerConnection(false);
      setError(e instanceof Error ? e.message : "Loading failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveUserProgress(next: Partial<UserTapSetupProgress>) {
    if (!session?.userId) return;
    if (!isActivationAdmin) {
      setError(adminRequiredMessage);
      return;
    }
    const merged: UserTapSetupProgress = {
      awarenessSeen: next.awarenessSeen ?? tapConfig.awarenessSeen,
      termsViewed: next.termsViewed ?? tapConfig.termsViewed,
      termsAccepted: next.termsAccepted ?? tapConfig.termsAccepted,
      educationSeen: next.educationSeen ?? tapConfig.educationSeen,
    };
    setSavingId("config");
    setError(null);
    try {
      const res = await fetch("/api/admin/menu-config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-staff-role": staffRole || "",
        },
        body: JSON.stringify({
          setting: "tap_to_pay_config",
          ...merged,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Save failed");
      writeUserTapSetupProgress(session.userId, merged);
      setHasCompletedSetupBefore(
        merged.awarenessSeen && merged.termsAccepted && merged.educationSeen
      );
      setTapConfig((prev) => ({
        ...prev,
        ...merged,
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function saveReadinessStatus(nextStatus: TapToPayConfig["readinessStatus"]) {
    if (!staffRole) return;
    setError(null);
    setSavingId("config");
    try {
      const payload = {
        setting: "tap_to_pay_config",
        readinessStatus: nextStatus,
      };
      const res = await fetch("/api/admin/menu-config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-staff-role": staffRole,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Save failed");
      }
      setTapConfig((prev) => ({
        ...prev,
        readinessStatus: payload.readinessStatus,
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function prepareTapToPay() {
    if (!staffRole) return;
    if (!isActivationAdmin) {
      setError(adminRequiredMessage);
      return;
    }
    setPrepareMessage(null);
    setError(null);
    setSavingId("prepare");
    setTapConfig((prev) => ({ ...prev, readinessStatus: "preparing" }));
    try {
      const res = await fetch("/api/admin/tap-to-pay/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-staff-role": staffRole,
        },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Preparation failed");
      }
      setTapConfig((prev) => ({ ...prev, readinessStatus: "ready" }));
      setPrepareMessage(
        lang === "de"
          ? "Tap to Pay ist bereit. Es wurde kein Betrag erstellt."
          : lang === "en"
          ? "Tap to Pay is ready. No amount has been created."
          : "Tap to Pay est pret. Aucun montant n'a ete cree."
      );
    } catch (e: unknown) {
      setTapConfig((prev) => ({ ...prev, readinessStatus: "not_prepared" }));
      setError(formatTapPrepareError(e, lang));
    } finally {
      setSavingId(null);
    }
  }

  async function restartTapSetup() {
    if (!isActivationAdmin) {
      setError(adminRequiredMessage);
      return;
    }
    setTermsChecked(false);
    setPrepareMessage(null);
    setHasCompletedSetupBefore(false);
    saveUserProgress({
      awarenessSeen: false,
      termsViewed: false,
      termsAccepted: false,
      educationSeen: false,
    });
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui",
        backgroundColor: BRAND.orangeSoft,
        backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "cover, min(64vw, 420px)",
        color: BRAND.black,
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
            border: `1px solid ${BRAND.border}`,
            boxShadow: "0 12px 30px rgba(242,140,40,0.18)",
            background: "white",
            position: "sticky",
            top: 12,
            zIndex: 20,
          }}
        >
          <button type="button" onClick={() => goBackOr("/staff")} className="af-link-btn">
            {backLabel}
          </button>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/logo-afrofood.png" alt="AfroFood" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${BRAND.border}` }} />
            {ttpLabel}
          </h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {staffRole ? <span className="af-role-badge">Role: {getStaffRoleLabel(staffRole, lang)}</span> : null}
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
            background: "repeating-linear-gradient(90deg, #111 0 10px, #F28C28 10px 20px, #111 20px 30px, #fff 30px 40px)",
            opacity: 0.9,
          }}
        />

        <p style={{ opacity: 0.8, marginTop: 10 }}>
          {lang === "de"
            ? "Konfigurieren und bereiten Sie Tap to Pay auf dem iPhone vor, bevor Sie die Kasse offnen."
            : lang === "en"
            ? "Configure and prepare Tap to Pay on iPhone before opening the cashier."
            : "Configurez et preparez Tap to Pay sur iPhone avant d'ouvrir la caisse."}
        </p>

        {loading ? <p>{lang === "de" ? "Laden..." : lang === "en" ? "Loading..." : "Chargement..."}</p> : null}
        {generalError ? <p style={{ color: "#b91c1c", fontWeight: 700 }}>{generalError}</p> : null}
        {!loading ? (
          <button
            className="af-btn"
            type="button"
            onClick={() => void restartTapSetup()}
            disabled={savingId === "config"}
            style={{ marginTop: 8, padding: "10px 14px", borderRadius: 10, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800 }}
          >
            {savingId === "config" ? (lang === "de" ? "Speichern..." : lang === "en" ? "Saving..." : "Sauvegarde...") : restartLabel}
          </button>
        ) : null}

        {!loading && shouldShowAdminBlock ? (
          <section style={{ background: "white", border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: 16, marginTop: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 22 }}>
              {lang === "de"
                ? "Admin-Zugriff erforderlich"
                : lang === "en"
                ? "Admin access required"
                : "Acces admin requis"}
            </div>
            <div style={{ marginTop: 8, color: "#5b5b5b", lineHeight: 1.5 }}>
              {adminRequiredMessage}
            </div>
            <button
              className="af-btn"
              type="button"
              onClick={() => {
                window.location.href = "/team/login";
              }}
              style={{ marginTop: 14, padding: "12px 16px", borderRadius: 12, border: "none", background: "#111", color: "white", fontWeight: 900 }}
            >
              {lang === "de" ? "Als Admin anmelden" : lang === "en" ? "Sign in as admin" : "Se connecter comme admin"}
            </button>
          </section>
        ) : null}

        {!loading && !shouldShowAdminBlock && step === "awareness" ? (
          <section style={{ background: "white", border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: 16, marginTop: 12 }}>
            <div
              style={{
                position: "relative",
                width: "100%",
                borderRadius: 12,
                overflow: "hidden",
                border: `1px solid ${BRAND.border}`,
                background: "white",
              }}
            >
              <img src={heroBannerPath} alt="Tap to Pay awareness" style={{ width: "100%", display: "block" }} />
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "5%",
                  bottom: "14%",
                  width: "36%",
                  maxWidth: 300,
                  height: "11%",
                  minHeight: 46,
                  background: "white",
                  borderRadius: 999,
                  boxShadow: "0 4px 14px rgba(255,255,255,0.96)",
                }}
              />
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 14 }}>{awarenessTitle}</div>
            <div style={{ marginTop: 8, color: "#5b5b5b", lineHeight: 1.5 }}>{awarenessBody}</div>
            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className="af-btn"
                type="button"
                onClick={() => void saveUserProgress({ awarenessSeen: true })}
                disabled={savingId === "config"}
                style={{ padding: "12px 16px", borderRadius: 12, border: "none", background: "#111", color: "white", fontWeight: 900 }}
              >
                {savingId === "config" ? (lang === "de" ? "Speichern..." : lang === "en" ? "Saving..." : "Sauvegarde...") : awarenessPrimary}
              </button>
              <button
                className="af-btn"
                type="button"
                onClick={() => void saveUserProgress({ awarenessSeen: true })}
                style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800 }}
              >
                {awarenessSecondary}
              </button>
            </div>
          </section>
        ) : null}

        {!loading && !shouldShowAdminBlock && step === "terms" ? (
          <section style={{ background: "white", border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: 16, marginTop: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 22 }}>{terms.title}</div>
            <div style={{ marginTop: 8, color: "#5b5b5b", lineHeight: 1.5 }}>{terms.intro}</div>
            <div style={{ marginTop: 12, maxHeight: 280, overflowY: "auto", border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 12, background: "#fffaf6" }}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {terms.points.map((point) => (
                  <li key={point} style={{ marginTop: 8, lineHeight: 1.5 }}>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <label style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "flex-start", fontWeight: 700 }}>
              <input type="checkbox" checked={termsChecked} onChange={(e) => setTermsChecked(e.target.checked)} />
              <span>{terms.checkbox}</span>
            </label>
            <button
              className="af-btn"
              type="button"
              onClick={() => {
                if (!termsChecked) {
                  setError(
                    lang === "de"
                      ? "Bitte bestatigen Sie zuerst, dass Sie die Bedingungen gelesen haben."
                      : lang === "en"
                      ? "Please confirm that you reviewed the terms first."
                      : "Veuillez d'abord confirmer que vous avez lu les conditions."
                  );
                  return;
                }
                void saveUserProgress({ awarenessSeen: true, termsViewed: true, termsAccepted: true });
              }}
              disabled={savingId === "config"}
              style={{ marginTop: 14, padding: "12px 16px", borderRadius: 12, border: "none", background: "#111", color: "white", fontWeight: 900 }}
            >
              {savingId === "config" ? (lang === "de" ? "Speichern..." : lang === "en" ? "Saving..." : "Sauvegarde...") : terms.action}
            </button>
          </section>
        ) : null}

        {!loading && !shouldShowAdminBlock && step === "education" ? (
          <section style={{ background: "white", border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: 16, marginTop: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 22 }}>{guide.title}</div>
            <div style={{ marginTop: 8, color: "#5b5b5b", lineHeight: 1.5 }}>{guide.intro}</div>
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {guide.sections.map((section) => (
                <div key={section.title} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 12, background: "#fffaf6" }}>
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
            <button
              className="af-btn"
              type="button"
              onClick={() =>
                void saveUserProgress({ awarenessSeen: true, termsViewed: true, termsAccepted: true, educationSeen: true })
              }
              disabled={savingId === "config"}
              style={{ marginTop: 14, padding: "12px 16px", borderRadius: 12, border: "none", background: "#111", color: "white", fontWeight: 900 }}
            >
              {savingId === "config" ? (lang === "de" ? "Speichern..." : lang === "en" ? "Saving..." : "Sauvegarde...") : guide.continueLabel}
            </button>
          </section>
        ) : null}

        {!loading && !shouldShowAdminBlock && step === "prepare" && !setupCompleted ? (
          <>
            <section style={{ background: "white", border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: 16, marginTop: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 22 }}>
                {lang === "de" ? "Tap to Pay (Vorbereitung)" : lang === "en" ? "Tap to Pay (Preparation)" : "Tap to Pay (Preparation)"}
              </div>
              <div style={{ marginTop: 8, color: "#5b5b5b", lineHeight: 1.5 }}>
                {lang === "de"
                  ? "Bereiten Sie Stripe auf dem Gerat ohne Bestellung oder Betrag vor. Der Betrag wird erst an der Kasse gesetzt."
                  : lang === "en"
                  ? "Prepare Stripe on device without order or amount. Amount is only set at cashier checkout."
                  : "Preparez Stripe sur l'appareil sans commande ni montant. Le montant est defini uniquement en caisse."}
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: "inline-block",
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontWeight: 800,
                  background: tapConfig.readinessStatus === "ready" ? "#dcfce7" : tapConfig.readinessStatus === "preparing" ? "#fef3c7" : "#e2e8f0",
                  color: tapConfig.readinessStatus === "ready" ? "#166534" : tapConfig.readinessStatus === "preparing" ? "#92400e" : "#334155",
                  border: tapConfig.readinessStatus === "ready" ? "1px solid #86efac" : tapConfig.readinessStatus === "preparing" ? "1px solid #fcd34d" : "1px solid #cbd5e1",
                }}
              >
                {statusLabel}
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  className="af-btn"
                  type="button"
                  onClick={() => void prepareTapToPay()}
                  disabled={savingId === "prepare" || connectionBlocked}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "none",
                    background: connectionBlocked ? "#94a3b8" : "#111",
                    color: "white",
                    fontWeight: 900,
                    cursor: connectionBlocked ? "not-allowed" : "pointer",
                    opacity: connectionBlocked ? 0.8 : 1,
                  }}
                >
                  {savingId === "prepare"
                    ? lang === "de"
                      ? "Vorbereitung..."
                      : lang === "en"
                      ? "Preparing..."
                      : "Preparation..."
                    : lang === "de"
                    ? "Tap to Pay aktivieren / vorbereiten"
                    : lang === "en"
                    ? "Enable / Prepare Tap to Pay"
                    : "Activer / Preparer Tap to Pay"}
                </button>
              </div>
              {prepareError ? <div style={{ marginTop: 10, color: "#b91c1c", fontWeight: 700 }}>{prepareError}</div> : null}
              {!prepareError && connectionBlocked ? <div style={{ marginTop: 10, color: "#b91c1c", fontWeight: 700 }}>{offlineMessage}</div> : null}
              {prepareMessage ? <div style={{ marginTop: 10, color: "#166534", fontWeight: 700 }}>{prepareMessage}</div> : null}
            </section>

            <section style={{ background: "white", border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: 16, marginTop: 12 }}>
              <div style={{ fontWeight: 900 }}>
                {lang === "de" ? "Gelesen und akzeptiert" : lang === "en" ? "Read and approved" : "Lu et approuve"}
              </div>
              <div style={{ marginTop: 6, color: "#5b5b5b" }}>
                {lang === "de" ? "Danach die Kasse offnen." : lang === "en" ? "Then open the cashier." : "Puis ouvrir la caisse."}
              </div>
              <button
                className="af-btn"
                type="button"
                onClick={() => {
                  if (!canOpenCashier) {
                    setError(
                      lang === "de"
                        ? "Bitte schliessen Sie zuerst Awareness, Terms und Education ab."
                        : lang === "en"
                        ? "Please complete awareness, terms, and education first."
                        : "Veuillez d'abord terminer awareness, terms et education."
                    );
                    return;
                  }
                  if (connectionBlocked) {
                    setError(offlineMessage);
                    return;
                  }
                  window.location.href = "/caisse";
                }}
                disabled={connectionBlocked}
                style={{
                  marginTop: 10,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: connectionBlocked ? "#94a3b8" : "linear-gradient(135deg,#ff7a00,#ff3c00)",
                  color: "white",
                  fontWeight: 900,
                  cursor: connectionBlocked ? "not-allowed" : "pointer",
                  opacity: connectionBlocked ? 0.8 : 1,
                }}
              >
                {lang === "de" ? "Kasse offnen" : lang === "en" ? "Open cashier" : "Ouvrir caisse"}
              </button>
            </section>
          </>
        ) : null}
        {!loading && setupCompleted ? (
          <>
            <section style={{ background: "white", border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: 16, marginTop: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 22 }}>
                {lang === "de" ? "Tap to Pay auf dem iPhone Bedingungen" : lang === "en" ? "Tap to Pay on iPhone Terms" : "Conditions Tap to Pay on iPhone"}
              </div>
              <div style={{ marginTop: 6, color: "#5b5b5b" }}>
                {lang === "de"
                  ? "Sichtbarer Status fur Apple Review: Nicht akzeptiert / Akzeptiert."
                  : lang === "en"
                  ? "Visible state for Apple review: Not accepted / Accepted."
                  : "Etat visible pour review Apple : Non accepte / Accepte."}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "6px 12px",
                    borderRadius: 999,
                    fontWeight: 800,
                    background: tapConfig.termsAccepted ? "#dcfce7" : "#fee2e2",
                    color: tapConfig.termsAccepted ? "#166534" : "#991b1b",
                    border: `1px solid ${tapConfig.termsAccepted ? "#86efac" : "#fecaca"}`,
                  }}
                >
                  {tapConfig.termsAccepted ? "Accepted" : "Not accepted"}
                </span>
                <button
                  className="af-btn"
                  type="button"
                  onClick={() => {
                    setTermsChecked(false);
                    setHasCompletedSetupBefore(false);
                    void saveUserProgress({ awarenessSeen: true, termsViewed: false, termsAccepted: false, educationSeen: false });
                  }}
                  style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800 }}
                >
                  {lang === "de" ? "Vollstandige Bedingungen anzeigen" : lang === "en" ? "View full terms" : "Voir les conditions"}
                </button>
              </div>
            </section>

            <section style={{ background: "white", border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: 16, marginTop: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 22 }}>
                {lang === "de" ? "Tap to Pay (Vorbereitung)" : lang === "en" ? "Tap to Pay (Preparation)" : "Tap to Pay (Preparation)"}
              </div>
              <div style={{ marginTop: 8, color: "#5b5b5b", lineHeight: 1.5 }}>
                {lang === "de"
                  ? "Bereiten Sie Stripe auf dem Gerat ohne Bestellung oder Betrag vor. Der Betrag wird erst an der Kasse gesetzt."
                  : lang === "en"
                  ? "Prepare Stripe on device without order or amount. Amount is only set at cashier checkout."
                  : "Preparez Stripe sur l'appareil sans commande ni montant. Le montant est defini uniquement en caisse."}
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: "inline-block",
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontWeight: 800,
                  background: tapConfig.readinessStatus === "ready" ? "#dcfce7" : tapConfig.readinessStatus === "preparing" ? "#fef3c7" : "#e2e8f0",
                  color: tapConfig.readinessStatus === "ready" ? "#166534" : tapConfig.readinessStatus === "preparing" ? "#92400e" : "#334155",
                  border: tapConfig.readinessStatus === "ready" ? "1px solid #86efac" : tapConfig.readinessStatus === "preparing" ? "1px solid #fcd34d" : "1px solid #cbd5e1",
                }}
              >
                {statusLabel}
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  className="af-btn"
                  type="button"
                  onClick={() => void prepareTapToPay()}
                  disabled={savingId === "prepare" || connectionBlocked}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "none",
                    background: connectionBlocked ? "#94a3b8" : "#111",
                    color: "white",
                    fontWeight: 900,
                    cursor: connectionBlocked ? "not-allowed" : "pointer",
                    opacity: connectionBlocked ? 0.8 : 1,
                  }}
                >
                  {savingId === "prepare"
                    ? lang === "de"
                      ? "Vorbereitung..."
                      : lang === "en"
                      ? "Preparing..."
                      : "Preparation..."
                    : lang === "de"
                    ? "Tap to Pay aktivieren / vorbereiten"
                    : lang === "en"
                    ? "Enable / Prepare Tap to Pay"
                    : "Activer / Preparer Tap to Pay"}
                </button>
              </div>
              {prepareError ? <div style={{ marginTop: 10, color: "#b91c1c", fontWeight: 700 }}>{prepareError}</div> : null}
              {!prepareError && connectionBlocked ? <div style={{ marginTop: 10, color: "#b91c1c", fontWeight: 700 }}>{offlineMessage}</div> : null}
              {prepareMessage ? <div style={{ marginTop: 10, color: "#166534", fontWeight: 700 }}>{prepareMessage}</div> : null}
            </section>

            <section style={{ background: "white", border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: 16, marginTop: 12 }}>
              <div style={{ fontWeight: 900 }}>
                {lang === "de" ? "Gelesen und akzeptiert" : lang === "en" ? "Read and approved" : "Lu et approuve"}
              </div>
              <div style={{ marginTop: 6, color: "#5b5b5b" }}>
                {lang === "de" ? "Danach die Kasse offnen." : lang === "en" ? "Then open the cashier." : "Puis ouvrir la caisse."}
              </div>
              <button
                className="af-btn"
                type="button"
                onClick={() => {
                  if (connectionBlocked) {
                    setError(offlineMessage);
                    return;
                  }
                  window.location.href = "/caisse";
                }}
                disabled={connectionBlocked}
                style={{
                  marginTop: 10,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: connectionBlocked ? "#94a3b8" : "linear-gradient(135deg,#ff7a00,#ff3c00)",
                  color: "white",
                  fontWeight: 900,
                  cursor: connectionBlocked ? "not-allowed" : "pointer",
                  opacity: connectionBlocked ? 0.8 : 1,
                }}
              >
                {lang === "de" ? "Kasse offnen" : lang === "en" ? "Open cashier" : "Ouvrir caisse"}
              </button>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
