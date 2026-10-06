import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {"title": "Politique de confidentialité | AfroFood", "description": "AfroFood Offenburg — Site AfroFood et AfroFood Terminal"};

export default function Page() {
  return (
    <main lang="fr" style={{ minHeight: "100vh", background: "#fffaf6", color: "#111827", padding: "clamp(16px, 4vw, 48px) 16px" }}>
      <article style={{ maxWidth: 860, margin: "0 auto", background: "white", border: "1px solid #f1d7c8", borderRadius: 20, padding: "clamp(20px, 5vw, 48px)", lineHeight: 1.75 }}>
        <header>
          <Link href="/" aria-label="Accueil AfroFood"><Image src="/logo-afrofood.png" alt="AfroFood Offenburg" width={794} height={560} style={{ width: 160, height: "auto" }} /></Link>
          <h1 style={{ marginTop: 16, fontSize: "clamp(26px, 4vw, 38px)", lineHeight: 1.2 }}>Politique de confidentialité</h1>
          <p style={{ marginTop: 12, color: "#475569" }}>AfroFood Offenburg — Site AfroFood et AfroFood Terminal</p>
          <p style={{ marginTop: 8 }}>Dernière mise à jour : <time dateTime="2026-10-06">6 octobre 2026</time></p>
          <p style={{ marginTop: 12 }}>Contact : <a href="mailto:info@afrofoodoffenburg.de" style={{ color: "#9a3412", textDecoration: "underline", overflowWrap: "anywhere" }}>info@afrofoodoffenburg.de</a></p>
        </header>
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 21, lineHeight: 1.4 }}>Qui sommes-nous et comment nous contacter ?</h2>
          <p style={{ marginTop: 8 }}>Cette politique décrit les traitements liés au site AfroFood et à AfroFood Terminal, l’application d’encaissement d’AfroFood Offenburg. Pour toute question concernant vos données ou pour exercer vos droits, contactez info@afrofoodoffenburg.de.</p>
        </section>
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 21, lineHeight: 1.4 }}>Utilisateurs et comptes</h2>
          <p style={{ marginTop: 8 }}>Nous traitons les noms d’utilisateur, rôles, informations de connexion et paramètres nécessaires à l’accès aux outils du personnel. La version actuelle utilise des comptes locaux : les données de comptes et de session du site, y compris les mots de passe, sont enregistrées dans le navigateur. Sur iPhone, les informations de connexion sont utilisées par l’application pour la session en cours.</p>
        </section>
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 21, lineHeight: 1.4 }}>Clients, commandes et réservations</h2>
          <p style={{ marginTop: 8 }}>Le nom du client est facultatif. Nous traitons les identifiants et dates de commande, les articles, quantités, prix, notes, montants, statuts, événements associés et, lorsqu’une réservation est demandée, son horaire. Ces informations servent à préparer les commandes, suivre leur paiement et organiser leur remise.</p>
        </section>
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 21, lineHeight: 1.4 }}>Paiements par carte et Tap to Pay</h2>
          <p style={{ marginTop: 8 }}>Les paiements par carte utilisent Stripe Terminal et Tap to Pay on iPhone. La collecte des informations de carte est assurée par Stripe Terminal / Tap to Pay. AfroFood traite les références et résultats nécessaires au suivi du paiement et de la commande : montant, devise, moyen de paiement, identifiant PaymentIntent, statuts, date de paiement et erreurs éventuelles. Le backend échange également des jetons de connexion, des secrets temporaires de PaymentIntent et des notifications de paiement avec Stripe. Le code AfroFood audité ne stocke pas directement les numéros complets de carte, CVC ou PIN.</p>
        </section>
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 21, lineHeight: 1.4 }}>Événements et fonctionnement de la caisse</h2>
          <p style={{ marginTop: 8 }}>Nous traitons les identifiants et noms d’événements, les paramètres du menu et des paiements, les disponibilités des articles et les associations entre utilisateur, caisse et commande. Des informations temporaires permettent de transmettre une commande de la caisse web à l’iPhone et de gérer l’utilisation d’une caisse. Des statistiques opérationnelles sont calculées à partir des commandes.</p>
        </section>
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 21, lineHeight: 1.4 }}>Stockage local et diagnostics</h2>
          <p style={{ marginTop: 8 }}>Le navigateur conserve notamment le panier, la langue, l’événement sélectionné, la dernière référence de commande, les comptes et sessions du personnel et la progression de configuration. Sur iPhone, l’application enregistre un marqueur de configuration quotidienne associé au nom d’utilisateur et à la date. Elle utilise en mémoire les commandes, états de paiement et messages de diagnostic. Des informations techniques et erreurs nécessaires au fonctionnement, à la sécurité et à l’assistance peuvent être traitées par l’application, le backend et les services techniques utilisés.</p>
        </section>
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 21, lineHeight: 1.4 }}>Prestataires techniques</h2>
          <p style={{ marginTop: 8 }}>Stripe / Stripe Terminal assurent les services de paiement. Apple fournit les fonctions natives Tap to Pay on iPhone et le parcours de présentation des conditions applicables. Vercel héberge le site et le backend. Les données opérationnelles sont stockées dans une infrastructure PostgreSQL, à laquelle le code accède via le client Neon. Ces services interviennent selon leur rôle dans le fonctionnement de l’application.</p>
        </section>
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 21, lineHeight: 1.4 }}>Conservation et demandes concernant vos données</h2>
          <p style={{ marginTop: 8 }}>Les données sont conservées aussi longtemps que nécessaire aux finalités opérationnelles, comptables ou légales et de sécurité applicables. Aucune durée uniforme n’est annoncée ici. Vous pouvez adresser vos questions et demandes d’accès, de rectification ou de suppression à info@afrofoodoffenburg.de ; leur traitement tient compte des obligations applicables. Ne transmettez jamais de numéro complet de carte, CVC, PIN ou mot de passe dans votre demande.</p>
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
