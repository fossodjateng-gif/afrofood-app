import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StripeTerminalProvider, useStripeTerminal } from "@stripe/stripe-terminal-react-native";

type CreatePiResponse = {
  ok: boolean;
  paymentIntentId?: string;
  clientSecret?: string;
  error?: string;
};

const API_BASE_URL =
  process.env.EXPO_PUBLIC_AFROFOOD_API_BASE_URL || "https://afrofood-app.vercel.app";

function Button({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled ? styles.buttonDisabled : null]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function TerminalScreen() {
  const terminal = useStripeTerminal() as any;

  const [orderId, setOrderId] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const connected = useMemo(() => Boolean(terminal.connectedReader), [terminal.connectedReader]);

  function log(line: string) {
    setLogs((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 40));
  }

  async function createPaymentIntentFromOrder() {
    if (!orderId.trim()) {
      Alert.alert("Missing order ID", "Enter an Afrofood order ID first.");
      return;
    }
    try {
      setBusy(true);
      const res = await fetch(`${API_BASE_URL}/api/stripe/terminal/payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderId.trim() }),
      });
      const data = (await res.json()) as CreatePiResponse;
      if (!res.ok || !data?.ok || !data.clientSecret) {
        throw new Error(data?.error || "Failed to create payment intent");
      }
      setPaymentIntentId(String(data.paymentIntentId || ""));
      setClientSecret(String(data.clientSecret || ""));
      log(`PI created: ${String(data.paymentIntentId || "")}`);
    } catch (e: any) {
      log(`PI create failed: ${e?.message || "unknown error"}`);
      Alert.alert("Error", e?.message || "Unable to create PI");
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

      const discovery = await terminal.discoverReaders({
        discoveryMethod: "localMobile",
        simulated: false,
      });
      if (discovery?.error) throw discovery.error;

      const discoveredReaders = discovery?.readers || terminal.discoveredReaders || [];
      if (!Array.isArray(discoveredReaders) || discoveredReaders.length === 0) {
        throw new Error("No Tap to Pay reader found on this phone");
      }

      const reader = discoveredReaders[0];
      const connection =
        terminal.connectLocalMobileReader?.({
          reader,
        }) || terminal.connectReader?.({ reader });

      const connectedResult = await connection;
      if (connectedResult?.error) throw connectedResult.error;
      log("Tap to Pay connected");
    } catch (e: any) {
      log(`Connect failed: ${e?.message || "unknown error"}`);
      Alert.alert("Connect error", e?.message || "Unable to connect Tap to Pay");
    } finally {
      setBusy(false);
    }
  }

  async function collectAndProcessPayment() {
    if (!clientSecret.trim()) {
      Alert.alert("Missing client secret", "Create PI from order first.");
      return;
    }

    try {
      setBusy(true);

      const retrieved = await terminal.retrievePaymentIntent(clientSecret.trim());
      if (retrieved?.error) throw retrieved.error;
      const intent = retrieved?.paymentIntent;
      if (!intent) throw new Error("No payment intent returned by Terminal SDK");

      const collected = await terminal.collectPaymentMethod({
        paymentIntent: intent,
      });
      if (collected?.error) throw collected.error;

      const toProcess = collected?.paymentIntent || intent;
      const processed =
        (await terminal.processPayment?.({ paymentIntent: toProcess })) ||
        (await terminal.processPaymentIntent?.({ paymentIntent: toProcess }));
      if (processed?.error) throw processed.error;

      log(`Payment succeeded for ${paymentIntentId || "payment intent"}`);
      Alert.alert("Success", "Payment processed. Webhook should update Afrofood order.");
    } catch (e: any) {
      log(`Collect/process failed: ${e?.message || "unknown error"}`);
      Alert.alert("Payment error", e?.message || "Could not complete payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>AfroFood Tap to Pay</Text>
      <Text style={styles.subtitle}>API: {API_BASE_URL}</Text>

      <TextInput
        style={styles.input}
        placeholder="Order ID (ex: 20260226-002)"
        value={orderId}
        onChangeText={setOrderId}
        autoCapitalize="none"
      />

      <Button label="1) Create PI from Afrofood order" onPress={createPaymentIntentFromOrder} disabled={busy} />
      <Button label={connected ? "2) Tap to Pay connected" : "2) Connect Tap to Pay"} onPress={connectTapToPay} disabled={busy} />
      <Button label="3) Collect + process payment" onPress={collectAndProcessPayment} disabled={busy || !connected} />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payment Intent</Text>
        <Text selectable style={styles.code}>{paymentIntentId || "-"}</Text>
        <Text selectable style={styles.code}>{clientSecret ? "client_secret ready" : "-"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Logs</Text>
        {logs.length === 0 ? <Text style={styles.log}>No logs yet.</Text> : null}
        {logs.map((line, idx) => (
          <Text key={`${line}-${idx}`} style={styles.log}>
            {line}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

export default function App() {
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
      <TerminalScreen />
    </StripeTerminalProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: "#f6efe7",
    minHeight: "100%",
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111",
  },
  subtitle: {
    color: "#334155",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "white",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "white",
    fontWeight: "800",
  },
  card: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "white",
    padding: 12,
    gap: 6,
  },
  cardTitle: {
    fontWeight: "900",
    color: "#0f172a",
  },
  code: {
    color: "#0f172a",
    fontFamily: "Courier",
  },
  log: {
    color: "#334155",
    fontSize: 12,
    fontFamily: "Courier",
  },
});

