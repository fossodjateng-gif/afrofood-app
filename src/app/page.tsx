export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>🍲 AfroFood Festival 2026</h1>
      <p>Commande digitale (DE • FR • EN)</p>

      <a
        href="/menu"
        style={{
          display: "inline-block",
          marginTop: 20,
          padding: "10px 16px",
          border: "1px solid #000",
          borderRadius: 8,
          textDecoration: "none",
        }}
      >
        Voir le menu
      </a>
    </main>
  );
}