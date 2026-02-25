function getStripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return key;
}

function toBody(data: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    params.set(k, String(v));
  }
  return params;
}

export async function stripePost<T = unknown>(
  path: string,
  data: Record<string, string | number | boolean | undefined>
) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: toBody(data),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as (T & {
    error?: { message?: string };
  }) | null;
  if (!res.ok || !json) {
    const message =
      typeof json?.error?.message === "string"
        ? json.error.message
        : `Stripe API error (${res.status})`;
    throw new Error(message);
  }

  return json;
}
