import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./support.module.css";

export const metadata: Metadata = {
  title: "AfroFood Terminal Support | AfroFood",
  description: "Help with staff access, Tap to Pay on iPhone, cashier orders, payment confirmation and technical support for AfroFood Terminal.",
};

const topics = [
  {
    id: "staff-access",
    title: "Staff login and account access",
    text: "Sign in with the staff account provided by your AfroFood administrator. Your account must be active and assigned to the correct event and cashier workstation. If you cannot sign in, check your internet connection and ask your administrator to check your account or reset your password. If your session expires, sign in again.",
  },
  {
    id: "tap-to-pay",
    title: "Tap to Pay on iPhone setup and activation",
    text: "After signing in, follow the Tap to Pay setup instructions in the app. Review and accept the Apple terms when prompted, and read the merchant guide available in the app. Keep your iPhone connected to the internet. If activation fails, note the error message and contact support with your iPhone model, iOS version and app version.",
  },
  {
    id: "receiving-orders",
    title: "Receiving orders from the AfroFood cashier",
    text: "Orders and baskets are prepared in the AfroFood web cashier. Use the same staff account on the web cashier and the iPhone, with the correct event and assigned workstation. Select card payment in the web cashier and send the order to AfroFood Terminal. If it does not appear, check the connection on both devices and confirm that the order was sent to the correct cashier account.",
  },
  {
    id: "contactless-payments",
    title: "Contactless payment processing",
    text: "Check the order and amount before starting payment. Follow the on-screen instructions and ask the customer to hold their contactless card or supported digital wallet near the iPhone as shown. Keep the app open until a result appears. If a payment is interrupted or its result is unclear, check the order status before attempting another charge.",
  },
  {
    id: "confirmation-receipts",
    title: "Payment confirmation and receipts",
    text: "Wait for payment confirmation and verify the order’s payment status in the AfroFood cashier. Presenting a card alone does not confirm a successful payment. If confirmation is delayed, ask an authorized staff member to verify the transaction before retrying. For a receipt or a payment question, contact the AfroFood team with the order reference and approximate payment time.",
  },
];

export default function TerminalSupportPage() {
  return (
    <main lang="en" className={styles.page}>
      <article className={styles.article}>
        <header>
          <Link href="/" aria-label="AfroFood home" className={styles.logoLink}>
            <Image src="/logo-afrofood.png" alt="AfroFood Offenburg" width={794} height={560} className={styles.logo} />
          </Link>
          <h1>AfroFood Terminal Support</h1>
          <p className={styles.intro}>Help for the AfroFood staff iPhone app, from account access to contactless payment confirmation.</p>
        </header>

        <nav aria-label="Support topics" className={styles.topics}>
          {topics.map(topic => <a key={topic.id} href={`#${topic.id}`}>{topic.title}</a>)}
          <a href="#technical-support">Technical support</a>
        </nav>

        {topics.map(topic => (
          <section key={topic.id} id={topic.id} className={styles.section} aria-labelledby={`${topic.id}-heading`}>
            <h2 id={`${topic.id}-heading`}>{topic.title}</h2>
            <p>{topic.text}</p>
          </section>
        ))}

        <section id="technical-support" className={styles.section} aria-labelledby="technical-support-heading">
          <h2 id="technical-support-heading">Technical support</h2>
          <p>Contact AfroFood at <a href="mailto:info@afrofoodoffenburg.de">info@afrofoodoffenburg.de</a>. Include the order reference if relevant, the approximate time of the issue, the error message, your iPhone model, iOS version and AfroFood Terminal app version.</p>
          <p className={styles.safety}><strong>Keep your information safe.</strong> Never send passwords, bank account details, full card numbers, card security codes (CVC/CVV) or PINs. Remove sensitive information from screenshots before sharing them.</p>
        </section>

        <nav aria-label="AfroFood information" className={styles.footer}>
          <Link href="/privacy">Privacy policy (French)</Link>
          <Link href="/support">Support (French)</Link>
          <Link href="/">AfroFood home</Link>
        </nav>
      </article>
    </main>
  );
}
