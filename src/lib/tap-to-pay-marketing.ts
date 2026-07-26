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
  const product = getTapToPayOnIphoneLabel(lang);
  if (lang === "fr") {
    return {
      title: `${product} est disponible`,
      body: "Acceptez les paiements sans contact directement sur iPhone, sans terminal supplementaire.",
      cta: "Activer maintenant",
    };
  }
  if (lang === "de") {
    return {
      title: `${product} ist verfugbar`,
      body: "Nehmen Sie kontaktlose Zahlungen direkt auf dem iPhone an - ohne zusatzliches Lesegerat.",
      cta: "Jetzt aktivieren",
    };
  }
  return {
    title: `${product} is available`,
    body: "Accept contactless payments directly on iPhone, with no additional card reader.",
    cta: "Enable now",
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
