import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {"title": "AfroFood Offenburg — Assistance AfroFood Terminal | AfroFood", "description": "Aide pour la connexion, les commandes et les paiements Tap to Pay."};

export default function Page() {
  return (
    <main lang="fr" style={{ minHeight: "100vh", background: "#fffaf6", color: "#111827", padding: "clamp(16px, 4vw, 48px) 16px" }}>
      <article style={{ maxWidth: 860, margin: "0 auto", background: "white", border: "1px solid #f1d7c8", borderRadius: 20, padding: "clamp(20px, 5vw, 48px)", lineHeight: 1.75 }}>
        <header>
          <Link href="/" aria-label="Accueil AfroFood"><Image src="/logo-afrofood.png" alt="AfroFood Offenburg" width={794} height={560} style={{ width: 160, height: "auto" }} /></Link>
          <h1 style={{ marginTop: 16, fontSize: "clamp(26px, 4vw, 38px)", lineHeight: 1.2 }}>AfroFood Offenburg — Assistance AfroFood Terminal</h1>
          <p style={{ marginTop: 12, color: "#475569" }}>Aide pour la connexion, les commandes et les paiements Tap to Pay.</p>
          <p style={{ marginTop: 12 }}>Contact : <a href="mailto:info@afrofoodoffenburg.de" style={{ color: "#9a3412", textDecoration: "underline", overflowWrap: "anywhere" }}>info@afrofoodoffenburg.de</a></p>
        </header>
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 21, lineHeight: 1.4 }}>À propos d’AfroFood Terminal</h2>
          <p style={{ marginTop: 8 }}>AfroFood Terminal permet à l’équipe AfroFood Offenburg d’encaisser une commande avec Tap to Pay on iPhone. La commande et le panier sont gérés dans la caisse web AfroFood ; l’iPhone reçoit la commande à payer et affiche le résultat du paiement.</p>
        </section>
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 21, lineHeight: 1.4 }}>Problème de connexion</h2>
          <p style={{ marginTop: 8 }}>Vérifiez votre connexion Internet et les identifiants autorisés fournis par votre administrateur. En cas d’accès refusé ou de compte indisponible, contactez votre administrateur ou notre assistance. Ne communiquez pas votre mot de passe.</p>
        </section>
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 21, lineHeight: 1.4 }}>Configurer Tap to Pay</h2>
          <p style={{ marginTop: 8 }}>Après connexion, suivez l’écran de configuration Tap to Pay et acceptez les conditions Apple si elles sont présentées. Consultez le guide marchand accessible dans l’aide de l’application. Si la configuration échoue, vérifiez la connexion Internet et les conditions de compatibilité de votre appareil avec Stripe Terminal / Tap to Pay, puis transmettez le message d’erreur à l’assistance.</p>
        </section>
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 21, lineHeight: 1.4 }}>Commande absente sur l’iPhone</h2>
          <p style={{ marginTop: 8 }}>Vérifiez que la caisse web utilise le même utilisateur que l’iPhone et le bon événement. Depuis la caisse web, sélectionnez la commande à payer par carte et envoyez-la vers AfroFood Terminal. Vérifiez la connexion Internet des deux appareils, puis actualisez la commande sur l’iPhone si nécessaire.</p>
        </section>
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 21, lineHeight: 1.4 }}>Paiement non confirmé</h2>
          <p style={{ marginTop: 8 }}>Vérifiez l’état de la commande dans la caisse web avant de tenter un deuxième paiement. Un paiement peut avoir été traité alors que sa confirmation n’est pas encore arrivée. En cas de doute, demandez à l’équipe autorisée de vérifier la transaction et contactez l’assistance ; ne recommencez pas le paiement sans avoir vérifié son résultat.</p>
        </section>
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 21, lineHeight: 1.4 }}>Informations utiles pour l’assistance</h2>
          <p style={{ marginTop: 8 }}>Indiquez l’identifiant de commande, l’heure approximative du problème et le message d’erreur affiché. Vous pouvez aussi préciser le modèle d’iPhone et la version de l’application. Ne transmettez jamais de numéro complet de carte, CVC, PIN ou mot de passe.</p>
        </section>
        <nav aria-label="Informations AfroFood" style={{ marginTop: 32, borderTop: "1px solid #f1d7c8", paddingTop: 20, display: "flex", flexWrap: "wrap", gap: 20 }}>
          <Link href="/privacy" style={{ color: "#9a3412", textDecoration: "underline" }}>Politique de confidentialité</Link>
          <Link href="/support" style={{ color: "#9a3412", textDecoration: "underline" }}>Assistance</Link>
          <Link href="/" style={{ color: "#9a3412", textDecoration: "underline" }}>Accueil AfroFood</Link>
        </nav>
      </article>
    </main>
  );
}
