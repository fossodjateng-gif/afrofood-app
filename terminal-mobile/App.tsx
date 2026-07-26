import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Linking,
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

function AwarenessScreen({
  session,
  onSetupComplete,
  onLogout,
}: {
  session: NativeSession;
  onSetupComplete: () => void;
  onLogout: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [setupLog, setSetupLog] = useState("");
  const [termsAcceptedBySdk, setTermsAcceptedBySdk] = useState(false);
  const discoveredReadersRef = useRef<any[]>([]);
  const terminal = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers: any[]) => {
      discoveredReadersRef.current = readers;
    },
    onDidAcceptTermsOfService: () => {
      setTermsAcceptedBySdk(true);
      setSetupLog("Official Tap to Pay on iPhone Terms accepted in the native flow.");
    },
  } as any) as any;

  async function startOfficialTapToPaySetup() {
    try {
      setBusy(true);
      setSetupLog("Starting official Tap to Pay on iPhone setup...");

      const init = await terminal.initialize();
      if (init?.error) throw init.error;

      const discovery = await terminal.discoverReaders({
        discoveryMethod: "tapToPay",
        simulated: false,
      });
      if (discovery?.error) throw discovery.error;

      const discoveredReaders = discoveredReadersRef.current || terminal.discoveredReaders || [];
      const reader = Array.isArray(discoveredReaders) ? discoveredReaders[0] : null;
      if (!reader) throw new Error("No Tap to Pay on iPhone reader found on this device.");

      const connectedResult = await terminal.connectReader(
        {
          reader,
          locationId: TERMINAL_LOCATION_ID,
          merchantDisplayName: "AfroFood",
          tosAcceptancePermitted: true,
        },
        "tapToPay"
      );
      if (connectedResult?.error) throw connectedResult.error;

      setSetupLog(
        termsAcceptedBySdk
          ? "Tap to Pay on iPhone setup complete after Terms acceptance."
          : "Tap to Pay on iPhone setup complete. Terms may already have been accepted for this merchant."
      );
      onSetupComplete();
    } catch (e: any) {
      const message = e?.message || "Unable to start Tap to Pay on iPhone setup.";
      setSetupLog(message);
      Alert.alert("Tap to Pay setup", message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title}>Tap to Pay on iPhone</Text>
        <Text style={styles.subtitle}>
          Set up contactless card acceptance before opening the cashier.
        </Text>
        <Text style={styles.meta}>Signed in as {session.username} ({roleLabel(session.role)})</Text>
      </View>

      <Section title="Enable Tap to Pay on iPhone">
        <Text style={styles.helpText}>
          AfroFood Terminal can accept in-person contactless payments on this iPhone.
          Before checkout, the cashier must review and accept the Tap to Pay on iPhone
          Terms and Conditions, then complete setup.
        </Text>
        <View style={styles.buttonColumn}>
          <Button
            label={busy ? "Starting Tap to Pay on iPhone setup..." : "Set up Tap to Pay on iPhone and review Terms"}
            onPress={() => void startOfficialTapToPaySetup()}
            disabled={busy}
            kind="success"
          />
          <Button label="Logout" onPress={onLogout} kind="secondary" disabled={busy} />
        </View>
        <Text style={termsAcceptedBySdk ? styles.successText : styles.helpText}>
          {setupLog || "This button starts the native Stripe Terminal Tap to Pay setup. If required, iPhone displays the official Tap to Pay on iPhone Terms and Conditions for acceptance."}
        </Text>
      </Section>

      <Section title="Where setup is available">
        <Text style={styles.orderItem}>During new cashier onboarding</Text>
        <Text style={styles.orderItem}>For existing cashiers after sign in</Text>
        <Text style={styles.orderItem}>From Help / Settings before checkout</Text>
        <Text style={styles.orderItem}>From checkout when the Tap to Pay on iPhone button is selected</Text>
      </Section>
    </ScrollView>
  );
}

function EducationScreen({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title}>Merchant Education</Text>
        <Text style={styles.subtitle}>Reference guide for Tap to Pay on iPhone.</Text>
      </View>

      <Section title="Accept contactless cards">
        <Text style={styles.helpText}>
          Ask the customer to hold their contactless card near the top of the iPhone
          when the Tap to Pay on iPhone payment screen is shown. Keep the card still
          until the payment is confirmed.
        </Text>
      </Section>

      <Section title="Accept Apple Pay and digital wallets">
        <Text style={styles.helpText}>
          Customers can pay with Apple Pay or other contactless digital wallets by
          holding their phone or watch near the top of the cashier iPhone when prompted.
        </Text>
      </Section>

      <Section title="PIN, accessibility, and fallback">
        <Text style={styles.helpText}>
          If a PIN, accessibility option, or additional instruction is required, follow
          the secure prompt shown by iPhone. If contactless payment is not possible,
          choose another available payment method in the cashier flow.
        </Text>
      </Section>

      <View style={styles.buttonColumn}>
        <Button label="Continue to cashier" onPress={onContinue} kind="success" />
        <Button label="Back" onPress={onBack} kind="secondary" />
      </View>
    </ScrollView>
  );
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
  onOpenEducation,
  tapSetupAccepted,
  merchantEducationSeen,
  onLogout,
}: {
  session: NativeSession;
  onOpenTerminal: () => void;
  onOpenEducation: () => void;
  tapSetupAccepted: boolean;
  merchantEducationSeen: boolean;
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
          <Button label="Help / Settings: merchant education" onPress={onOpenEducation} kind="secondary" />
          <Button label="Logout" onPress={onLogout} kind="secondary" />
        </View>
      </Section>

      <Section title="What this native app handles">
        <Text style={styles.orderItem}>Tap to Pay setup accepted: {tapSetupAccepted ? "yes" : "no"}</Text>
        <Text style={styles.orderItem}>Merchant education completed: {merchantEducationSeen ? "yes" : "no"}</Text>
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
  initialOrderId,
}: {
  session: NativeSession;
  onBack: () => void;
  onLogout: () => void;
  initialOrderId?: string | null;
}) {
  const discoveredReadersRef = useRef<any[]>([]);
  const autoPreparedOrderRef = useRef<string | null>(null);
  const terminal = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers: any[]) => {
      discoveredReadersRef.current = readers;
    },
    onDidAcceptTermsOfService: () => {
      setLogs((prev) => [
        `${new Date().toLocaleTimeString()} Official Tap to Pay on iPhone Terms accepted`,
        ...prev,
      ].slice(0, 40));
    },
  } as any) as any;

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState("Ready.");
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const cashierLaunch = Boolean(initialOrderId);

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
      const scopedOrders = initialOrderId
        ? cardOrders.filter((order) => order.id === initialOrderId)
        : cardOrders;
      setOrders(scopedOrders);

      if (scopedOrders.length === 0) {
        setSelectedOrderId(null);
        setPaymentIntentId("");
        setClientSecret("");
        return;
      }

      setSelectedOrderId((prev) => {
        if (initialOrderId && scopedOrders.some((order) => order.id === initialOrderId)) {
          return initialOrderId;
        }
        return prev && scopedOrders.some((order) => order.id === prev)
          ? prev
          : scopedOrders[0].id;
      });
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
    if (!initialOrderId) return;
    setSelectedOrderId(initialOrderId);
    log(`Opened from cashier for order ${initialOrderId}`);
    void refreshOrders();
  }, [initialOrderId]);

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

  useEffect(() => {
    if (!initialOrderId || !selectedOrder || selectedOrder.id !== initialOrderId) return;
    if (clientSecret.trim()) return;
    if (autoPreparedOrderRef.current === selectedOrder.id) return;
    autoPreparedOrderRef.current = selectedOrder.id;
    void loadOrCreatePaymentIntentFromSelectedOrder();
  }, [initialOrderId, selectedOrder, clientSecret]);

  async function loadOrCreatePaymentIntentFromSelectedOrder() {
    if (!selectedOrder) {
      Alert.alert("No order selected", "Select a pending card order first.");
      return null;
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
      log(
        `${data.reused ? "Existing PI loaded" : "PI created"} for ${selectedOrder.id}: ${String(
          data.paymentIntentId || ""
        )}${data.status ? ` (${data.status})` : ""}`
      );
      await refreshOrders();
      return String(data.clientSecret || "");
    } catch (e: any) {
      log(`PI create failed: ${e?.message || "unknown error"}`);
      Alert.alert("Error", e?.message || "Unable to create payment intent");
      return null;
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
          merchantDisplayName: "AfroFood",
          tosAcceptancePermitted: true,
        },
        "tapToPay"
      );
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

  async function startTapToPayCheckout() {
    if (!selectedOrder) {
      Alert.alert("No order selected", "Select a pending card order first.");
      return;
    }

    let checkoutClientSecret = clientSecret.trim();
    if (!checkoutClientSecret) {
      const loadedClientSecret = await loadOrCreatePaymentIntentFromSelectedOrder();
      log("Tap to Pay on iPhone selected: PaymentIntent requested for checkout.");
      if (!loadedClientSecret) return;
      checkoutClientSecret = loadedClientSecret;
    }

    if (!connected) {
      const didConnect = await connectTapToPay();
      log("Tap to Pay on iPhone selected: setup/connect flow requested.");
      if (!didConnect) return;
    }

    await collectAndProcessPayment(checkoutClientSecret);
  }

  async function collectAndProcessPayment(checkoutClientSecret = clientSecret.trim()) {
    if (!selectedOrder) {
      Alert.alert("No order selected", "Select a pending card order first.");
      return;
    }

    if (!checkoutClientSecret.trim()) {
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

      const processedIntent = processed?.paymentIntent || processed?.intent || toProcess;
      const confirmedPaymentIntentId = String(
        processedIntent?.id ||
          processedIntent?.stripeId ||
          paymentIntentId ||
          selectedOrder.stripe_payment_intent_id ||
          ""
      ).trim();

      const confirmRes = await fetch(`${API_BASE_URL}/api/orders/${selectedOrder.id}/stripe-confirm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          confirmedPaymentIntentId ? { paymentIntentId: confirmedPaymentIntentId } : {}
        ),
      });
      const confirmData = await confirmRes.json().catch(() => null);
      const alreadyConfirmed =
        !confirmRes.ok &&
        /not waiting for payment/i.test(String(confirmData?.error || ""));
      if ((!confirmRes.ok || !confirmData?.ok) && !alreadyConfirmed) {
        throw new Error(confirmData?.error || "Payment processed, but cashier confirmation failed");
      }

      log(`Payment confirmed for ${selectedOrder.id}`);
      setCompletedOrderId(selectedOrder.id);
      if (!cashierLaunch) {
        Alert.alert("Success", "Payment confirmed. The order was sent to the kitchen.");
      }
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

      {cashierLaunch ? (
        <Section title={completedOrderId ? "Paiement termine" : "Commande a encaisser"}>
          {completedOrderId && !selectedOrder ? (
            <>
              <Text style={styles.successText}>Commande {completedOrderId} payee.</Text>
              <Text style={styles.helpText}>
                Retournez a la caisse: le ticket s'affiche, la commande devient validee et elle part en cuisine.
              </Text>
            </>
          ) : !selectedOrder ? (
            <>
              <Text style={styles.emptyText}>
                Chargement de la commande {initialOrderId || ""}...
              </Text>
              <Button
                label={refreshing ? "Actualisation..." : "Actualiser"}
                onPress={() => void refreshOrders()}
                disabled={busy || refreshing}
                kind="secondary"
              />
            </>
          ) : (
            <>
              <View style={styles.orderHeader}>
                <Text style={styles.orderId}>{selectedOrder.id}</Text>
                <Text style={styles.orderAmount}>{formatEur(selectedOrder.amount_cents)}</Text>
              </View>
              {selectedOrder.customer_name ? (
                <Text style={styles.orderMeta}>Client: {selectedOrder.customer_name}</Text>
              ) : null}
              {selectedOrder.event_name ? (
                <Text style={styles.orderMeta}>Evenement: {selectedOrder.event_name}</Text>
              ) : null}
              {selectedOrder.items.map((item, index) => (
                <Text key={`${selectedOrder.id}-${index}`} style={styles.orderItem}>
                  {item.qty}x {item.name}
                </Text>
              ))}
              <View style={styles.buttonColumn}>
                <Button
                  label={busy ? "Paiement en cours..." : "Encaisser avec Tap to Pay"}
                  onPress={() => void startTapToPayCheckout()}
                  disabled={busy || !selectedOrder}
                  kind="success"
                />
              </View>
              <Text style={styles.helpText}>{statusMessage}</Text>
            </>
          )}
        </Section>
      ) : (
        <>
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

      <Section title="Checkout">
        <View style={styles.buttonColumn}>
          <Button
            label="Tap to Pay on iPhone"
            onPress={() => void startTapToPayCheckout()}
            disabled={busy || !selectedOrder}
            kind="success"
          />
          <Button
            label="Load/create PaymentIntent"
            onPress={() => void loadOrCreatePaymentIntentFromSelectedOrder()}
            disabled={busy || !selectedOrder}
            kind="secondary"
          />
          <Button
            label={connected ? "Tap to Pay connected" : "Connect Tap to Pay setup"}
            onPress={() => void connectTapToPay()}
            disabled={busy}
            kind={connected ? "success" : "secondary"}
          />
        </View>
        <Text style={styles.helpText}>
          The Tap to Pay on iPhone button stays visible at checkout. If setup is not complete,
          it starts the setup/connect flow before collecting payment.
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
        </>
      )}
    </ScrollView>
  );
}

export default function App() {
  const [session, setSession] = useState<NativeSession | null>(null);
  const [screen, setScreen] = useState<"login" | "awareness" | "education" | "home" | "terminal">("login");
  const [tapSetupAccepted, setTapSetupAccepted] = useState(false);
  const [merchantEducationSeen, setMerchantEducationSeen] = useState(false);
  const [pendingDeepLinkOrderId, setPendingDeepLinkOrderId] = useState<string | null>(null);

  function handleDeepLink(url: string | null) {
    if (!url) return;
    try {
      const parsed = new URL(url);
      const orderId = parsed.searchParams.get("orderId");
      if (parsed.protocol !== "afrofoodterminal:" || !orderId) return;
      setPendingDeepLinkOrderId(orderId);
      setScreen((current) => (session ? "terminal" : current));
    } catch {
      // Ignore links that are not valid AfroFood Terminal URLs.
    }
  }

  useEffect(() => {
    void Linking.getInitialURL().then(handleDeepLink);
    const subscription = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    return () => subscription.remove();
  }, [session]);

  function handleLogin(nextSession: NativeSession) {
    setSession(nextSession);
    setScreen(pendingDeepLinkOrderId ? "terminal" : "awareness");
  }

  function handleLogout() {
    setSession(null);
    setTapSetupAccepted(false);
    setMerchantEducationSeen(false);
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
          onBack={() => {
            setPendingDeepLinkOrderId(null);
            setScreen("home");
          }}
          onLogout={handleLogout}
          initialOrderId={pendingDeepLinkOrderId}
        />
      ) : session && screen === "education" ? (
        <EducationScreen
          onContinue={() => {
            setMerchantEducationSeen(true);
            setScreen("home");
          }}
          onBack={() => setScreen(tapSetupAccepted ? "home" : "awareness")}
        />
      ) : session && screen === "awareness" ? (
        <AwarenessScreen
          session={session}
          onSetupComplete={() => {
            setTapSetupAccepted(true);
            setScreen("education");
          }}
          onLogout={handleLogout}
        />
      ) : session ? (
        <HomeScreen
          session={session}
          onOpenTerminal={() => setScreen("terminal")}
          onOpenEducation={() => setScreen("education")}
          tapSetupAccepted={tapSetupAccepted}
          merchantEducationSeen={merchantEducationSeen}
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
  successText: {
    color: "#047857",
    fontWeight: "800",
  },
  log: {
    color: "#334155",
    fontSize: 12,
    fontFamily: "Courier",
  },
});
