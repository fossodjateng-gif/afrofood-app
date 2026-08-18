import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
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

type NativeRole = "admin" | "cashier" | "kitchen";

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

const API_BASE_URL =
  process.env.EXPO_PUBLIC_AFROFOOD_API_BASE_URL || "https://afrofood-app.vercel.app";
const TERMINAL_LOCATION_ID =
  process.env.EXPO_PUBLIC_STRIPE_TERMINAL_LOCATION_ID || "tml_GZ01YQcRTm1DdP";

const NATIVE_DEMO_USERS: NativeUser[] = [
  { username: "admin", password: "0603", role: "admin" },
  { username: "existinguser", password: "0603", role: "cashier" },
  { username: "newuser", password: "0603", role: "kitchen" },
];

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

function LoginScreen({
  onLogin,
}: {
  onLogin: (session: NativeSession) => void;
}) {
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
      setError("Invalid mobile demo credentials.");
      return;
    }
    if (user.role !== "cashier" && user.role !== "admin") {
      setError("This native app is currently reserved for cashier or admin payment flows.");
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
      <View style={styles.hero}>
        <Text style={styles.title}>AfroFood Terminal</Text>
        <Text style={styles.subtitle}>Native iPhone cashier login for Tap to Pay</Text>
        <Text style={styles.meta}>API: {API_BASE_URL}</Text>
      </View>

      <Section title="Cashier sign in">
        <Text style={styles.fieldLabel}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          placeholder="existinguser"
        />
        <Text style={styles.fieldLabel}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          placeholder="0603"
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Button label="Open cashier terminal" onPress={submit} />
      </Section>

      <Section title="Demo accounts">
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
  onLogout,
}: {
  session: NativeSession;
  onOpenTerminal: () => void;
  onLogout: () => void;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.title}>Cashier Home</Text>
        <Text style={styles.subtitle}>
          Signed in as {session.username} ({roleLabel(session.role)})
        </Text>
        <Text style={styles.meta}>Logged in: {new Date(session.loggedAt).toLocaleString()}</Text>
      </View>

      <Section title="Tap to Pay on iPhone">
        <Text style={styles.helpText}>
          Open the live terminal flow, load pending card orders, connect Tap to Pay on iPhone,
          then collect and process payment from this device.
        </Text>
        <View style={styles.buttonColumn}>
          <Button label="Open Tap to Pay cashier" onPress={onOpenTerminal} />
          <Button label="Logout" onPress={onLogout} kind="secondary" />
        </View>
      </Section>

      <Section title="What this native app handles">
        <Text style={styles.orderItem}>Card orders waiting for cashier payment</Text>
        <Text style={styles.orderItem}>Stripe Terminal connection token + Tap to Pay reader</Text>
        <Text style={styles.orderItem}>PaymentIntent retrieval, collection, and processing</Text>
      </Section>
    </View>
  );
}

function TerminalScreen({
  session,
  onBack,
  onLogout,
}: {
  session: NativeSession;
  onBack: () => void;
  onLogout: () => void;
}) {
  const terminal = useStripeTerminal() as any;

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState(t.ready);
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
      setOrders(cardOrders);

      if (cardOrders.length === 0) {
        setSelectedOrderId(null);
        setPaymentIntentId("");
        setClientSecret("");
        return;
      }

      setSelectedOrderId((prev) =>
        prev && cardOrders.some((order) => order.id === prev)
          ? prev
          : cardOrders[0].id
      );
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

  async function createPaymentIntentFromSelectedOrder() {
    if (!selectedOrder) {
      Alert.alert("No order selected", "Select a pending card order first.");
      return;
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
      log(`PI created for ${selectedOrder.id}: ${String(data.paymentIntentId || "")}`);
      await refreshOrders();
    } catch (e: any) {
      log(`PI create failed: ${e?.message || "unknown error"}`);
      Alert.alert("Error", e?.message || "Unable to create payment intent");
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
        }) || terminal.connectReader?.({ reader });

      const connectedResult = await connection;
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

  async function collectAndProcessPayment() {
    if (!selectedOrder) {
      Alert.alert("No order selected", "Select a pending card order first.");
      return;
    }

    if (!clientSecret.trim()) {
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

      log(`Payment processed for ${selectedOrder.id}`);
      Alert.alert(
        "Success",
        "Payment processed. The Stripe webhook should now update the AfroFood order."
      );
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
          <Button label="Back" onPress={onBack} kind="secondary" disabled={busy} />
          <Button label="Logout" onPress={onLogout} kind="secondary" disabled={busy} />
        </View>
      </View>
      <Text style={styles.title}>AfroFood Tap to Pay</Text>
      <Text style={styles.subtitle}>Native cashier for iPhone Tap to Pay</Text>
      <Text style={styles.meta}>API: {API_BASE_URL}</Text>
      <Text style={styles.meta}>Location: {TERMINAL_LOCATION_ID}</Text>

      <Section title="Pending card orders">
        <View style={styles.buttonRow}>
          <Button
            label={refreshing ? "Refreshing..." : "Refresh orders"}
            onPress={() => void refreshOrders()}
            disabled={busy || refreshing}
            kind="secondary"
          />
        </View>
        {orders.length === 0 ? (
          <Text style={styles.emptyText}>No pending card orders.</Text>
        ) : (
          orders.map((order) => {
            const selected = order.id === selectedOrderId;
            return (
              <Pressable
                key={order.id}
                onPress={() => setSelectedOrderId(order.id)}
                style={[
                  styles.orderCard,
                  selected ? styles.orderCardSelected : null,
                ]}
              >
                <View style={styles.orderHeader}>
                  <Text style={styles.orderId}>{order.id}</Text>
                  <Text style={styles.orderAmount}>{formatEur(order.amount_cents)}</Text>
                </View>
                <Text style={styles.orderMeta}>
                  Payment: {order.payment} | Status: {order.status}
                </Text>
                {order.event_name ? (
                  <Text style={styles.orderMeta}>Event: {order.event_name}</Text>
                ) : null}
                {order.items.map((item, index) => (
                  <Text key={`${order.id}-${index}`} style={styles.orderItem}>
                    {item.qty}x {item.name}
                  </Text>
                ))}
              </Pressable>
            );
          })
        )}
      </Section>

      <Section title="Selected order">
        {!selectedOrder ? (
          <Text style={styles.emptyText}>Select a card order to continue.</Text>
        ) : (
          <>
            <Text style={styles.selectedLabel}>Order ID</Text>
            <Text selectable style={styles.code}>
              {selectedOrder.id}
            </Text>
            <Text style={styles.selectedLabel}>Amount</Text>
            <Text style={styles.code}>{formatEur(selectedOrder.amount_cents)}</Text>
            <Text style={styles.selectedLabel}>PaymentIntent</Text>
            <Text selectable style={styles.code}>
              {paymentIntentId || selectedOrder.stripe_payment_intent_id || "-"}
            </Text>
          </>
        )}
      </Section>

      <Section title="Tap to Pay workflow">
        <View style={styles.buttonColumn}>
          <Button
            label="1) Create PI from selected order"
            onPress={() => void createPaymentIntentFromSelectedOrder()}
            disabled={busy || !selectedOrder}
          />
          <Button
            label={connected ? "2) Tap to Pay connected" : "2) Connect Tap to Pay"}
            onPress={() => void connectTapToPay()}
            disabled={busy}
            kind={connected ? "success" : "primary"}
          />
          <Button
            label="3) Collect + process payment"
            onPress={() => void collectAndProcessPayment()}
            disabled={busy || !selectedOrder || !connected || !clientSecret}
            kind="success"
          />
        </View>
        <Text style={styles.helpText}>
          Use this iPhone to connect Tap to Pay, collect the customer payment, and let the
          AfroFood webhook update the order.
        </Text>
      </Section>

      <Section title="Logs">
        {logs.length === 0 ? <Text style={styles.emptyText}>No logs yet.</Text> : null}
        {logs.map((line, idx) => (
          <Text key={`${line}-${idx}`} style={styles.log}>
            {line}
          </Text>
        ))}
      </Section>
    </ScrollView>
  );
}

export default function App() {
  const [session, setSession] = useState<NativeSession | null>(null);
  const [screen, setScreen] = useState<"login" | "home" | "terminal">("login");

  function handleLogin(nextSession: NativeSession) {
    setSession(nextSession);
    setScreen("home");
  }

  function handleLogout() {
    setSession(null);
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
          onBack={() => setScreen("home")}
          onLogout={handleLogout}
        />
      ) : session ? (
        <HomeScreen
          session={session}
          onOpenTerminal={() => setScreen("terminal")}
          onLogout={handleLogout}
        />
      ) : (
        <LoginScreen onLogin={handleLogin} />
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
  log: {
    color: "#334155",
    fontSize: 12,
    fontFamily: "Courier",
  },
});
