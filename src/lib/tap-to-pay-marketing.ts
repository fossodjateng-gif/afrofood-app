import type { Lang } from "@/lib/translations";

export const APPLE_TTP_ASSET_PATHS = {
  heroBannerFr: "/assets/apple-tap-to-pay/hero-banner-fr.jpg",
  heroBannerDe: "/assets/apple-tap-to-pay/hero-banner-de.jpg",
  heroBannerEn: "/assets/apple-tap-to-pay/hero-banner-de.jpg",
  launchEmailFr: "/assets/apple-tap-to-pay/launch-email-fr.jpg",
  launchEmailDe: "/assets/apple-tap-to-pay/launch-email-de.jpg",
  launchEmailEn: "/assets/apple-tap-to-pay/launch-email-de.jpg",
  pushTemplateFr: "/assets/apple-tap-to-pay/push-template-de.jpg",
  pushTemplateDe: "/assets/apple-tap-to-pay/push-template-de.jpg",
  pushTemplateEn: "/assets/apple-tap-to-pay/push-template-de.jpg",
} as const;

export function getHeroBannerAssetPath(lang: Lang) {
  if (lang === "fr") return APPLE_TTP_ASSET_PATHS.heroBannerFr;
  if (lang === "de") return APPLE_TTP_ASSET_PATHS.heroBannerDe;
  return APPLE_TTP_ASSET_PATHS.heroBannerEn;
}

export function getLaunchEmailAssetPath(lang: Lang) {
  if (lang === "fr") return APPLE_TTP_ASSET_PATHS.launchEmailFr;
  if (lang === "de") return APPLE_TTP_ASSET_PATHS.launchEmailDe;
  return APPLE_TTP_ASSET_PATHS.launchEmailEn;
}

export function getPushTemplateAssetPath(lang: Lang) {
  if (lang === "fr") return APPLE_TTP_ASSET_PATHS.pushTemplateFr;
  if (lang === "de") return APPLE_TTP_ASSET_PATHS.pushTemplateDe;
  return APPLE_TTP_ASSET_PATHS.pushTemplateEn;
}

export function getTapToPayOnIphoneLabel(lang: Lang) {
  if (lang === "fr") return "Tap to Pay on iPhone";
  if (lang === "de") return "Tap to Pay on iPhone";
  return "Tap to Pay on iPhone";
}

export function getMarketingHeroCopy(lang: Lang) {
  if (lang === "fr") {
    return {
      title: "AfroFood Terminal est disponible",
      body: "Les paiements sans contact sont geres sur le terminal AfroFood, tandis que la caisse web reste simple et rapide.",
      cta: "Voir le terminal",
    };
  }
  if (lang === "de") {
    return {
      title: "AfroFood Terminal ist verfugbar",
      body: "Kontaktlose Zahlungen laufen uber das AfroFood Terminal, wahrend die Web-Kasse bewusst einfach bleibt.",
      cta: "Terminal ansehen",
    };
  }
  return {
    title: "AfroFood Terminal is available",
    body: "Contactless payments run on the AfroFood terminal while the web cashier stays intentionally simple.",
    cta: "View terminal",
  };
}

export function getMarketingPushCopy(lang: Lang) {
  const product = getTapToPayOnIphoneLabel(lang);
  if (lang === "fr") {
    return {
      title: `${product} est pret`,
      body: "Acceptez cartes et wallets sans contact directement sur votre iPhone.",
    };
  }
  if (lang === "de") {
    return {
      title: `${product} ist bereit`,
      body: "Akzeptieren Sie Karten und Wallets kontaktlos direkt auf Ihrem iPhone.",
    };
  }
  return {
    title: `${product} is ready`,
    body: "Accept contactless cards and wallets directly on your iPhone.",
  };
}

export function getMarketingLaunchEmailCopy(lang: Lang) {
  const product = getTapToPayOnIphoneLabel(lang);
  if (lang === "fr") {
    return {
      subject: `${product} est maintenant disponible`,
      body: `Bonjour,\n\n${product} est maintenant disponible dans AfroFood Terminal. Vous pouvez accepter des paiements sans contact directement sur iPhone.\n\nConnectez-vous a l'app pour activer ${product} et commencer a encaisser.\n\nAfroFood Team`,
    };
  }
  if (lang === "de") {
    return {
      subject: `${product} ist jetzt verfugbar`,
      body: `Hallo,\n\n${product} ist jetzt in AfroFood Terminal verfugbar. Sie konnen kontaktlose Zahlungen direkt auf dem iPhone akzeptieren.\n\nMelden Sie sich in der App an, um ${product} zu aktivieren und Zahlungen anzunehmen.\n\nAfroFood Team`,
    };
  }
  return {
    subject: `${product} is now available`,
    body: `Hello,\n\n${product} is now available in AfroFood Terminal. You can accept contactless payments directly on iPhone.\n\nLog in to the app to enable ${product} and start taking payments.\n\nAfroFood Team`,
  };
}
