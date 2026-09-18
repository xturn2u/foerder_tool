const PRICE_CENTS = 990;
const DEV_COUPON = {
  code: "ENTWICKLUNG10",
  label: "Entwicklungs-Gutschein",
  discount_cents: 990,
  active: true,
  development_only: true
};

function normalizeCode(value = "") {
  return String(value).trim().toUpperCase().replace(/\s+/g, "");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const code = normalizeCode(req.query.code || "");
  const redeem = String(req.query.redeem || "") === "1";
  const programUrl = String(req.query.program_url || "").trim();

  const validCoupon = DEV_COUPON.active && code === DEV_COUPON.code;
  const discount = validCoupon ? Math.min(PRICE_CENTS, DEV_COUPON.discount_cents) : 0;
  const total = Math.max(0, PRICE_CENTS - discount);

  const response = {
    ok: true,
    product: "Antragshilfe",
    currency: "EUR",
    regular_price_cents: PRICE_CENTS,
    discount_cents: discount,
    total_cents: total,
    program_url: programUrl || null,
    coupon: validCoupon ? {
      valid: true,
      code: DEV_COUPON.code,
      label: DEV_COUPON.label,
      development_only: true
    } : {
      valid: false,
      code: code || null
    },
    featured_coupon: {
      code: DEV_COUPON.code,
      label: DEV_COUPON.label,
      discount_cents: DEV_COUPON.discount_cents,
      final_price_cents: 0,
      development_only: true
    },
    development_mode: true,
    payment_required: total > 0,
    payment_integration: false
  };

  if (redeem) {
    if (!programUrl) {
      response.status = "invalid_request";
      response.message = "Kein Förderprogramm ausgewählt.";
    } else if (validCoupon && total === 0) {
      response.status = "granted";
      response.message = "Antragshilfe im Entwicklungsmodus kostenlos freigeschaltet.";
    } else {
      response.status = "payment_required";
      response.message = "Für diesen Betrag ist später eine Zahlungsabwicklung erforderlich.";
    }
  }

  return res.status(200).json(response);
}
