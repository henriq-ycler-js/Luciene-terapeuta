// server.js
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import { google } from "googleapis";
import twilio from "twilio";

const app = express();

/* ---------- Middlewares ---------- */
app.use(cors());
app.use(bodyParser.json());

/* ---------- ENV VARS ---------- */
const MERCADO_TOKEN = process.env.MERCADO_ACCESS_TOKEN;

const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT || null;
const CALENDAR_ID = process.env.CALENDAR_ID || "primary";

const TWILIO_SID = process.env.TWILIO_SID || null;
const TWILIO_AUTH = process.env.TWILIO_AUTH || null;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || null;
const OWNER_WHATSAPP = process.env.OWNER_WHATSAPP || null;

/* ---------- CUPONS ---------- */
let COUPONS = {};
if (process.env.COUPONS) {
  try {
    COUPONS = JSON.parse(process.env.COUPONS);
  } catch {
    console.warn("⚠️ COUPONS inválido");
  }
}

/* ---------- Twilio ---------- */
let twilioClient = null;
if (TWILIO_SID && TWILIO_AUTH) {
  twilioClient = twilio(TWILIO_SID, TWILIO_AUTH);
}

/* ---------- Google Calendar ---------- */
let calendar = null;
let googleJwtClient = null;

if (GOOGLE_SERVICE_ACCOUNT) {
  try {
    const gsa = JSON.parse(GOOGLE_SERVICE_ACCOUNT);
    googleJwtClient = new google.auth.JWT({
      email: gsa.client_email,
      key: gsa.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar"]
    });

    calendar = google.calendar({
      version: "v3",
      auth: googleJwtClient
    });
  } catch (e) {
    console.error("Erro Google Service Account:", e.message);
  }
}

/* ---------- Store temporário ---------- */
const prefStore = {};

/* ---------- Helpers ---------- */
function applyCoupon(amount, coupon) {
  if (!coupon) return amount;
  const code = coupon.toUpperCase();
  if (COUPONS[code]) {
    return Number((amount * (1 - COUPONS[code])).toFixed(2));
  }
  return amount;
}

/* ---------- Teste ---------- */
app.get("/", (req, res) => {
  res.send("Backend online 🚀");
});

/* ---------- Criar pagamento ---------- */
app.post("/create_preference", async (req, res) => {
  try {
    const { plan, name, whatsapp, dateISO, time, coupon } = req.body;

    if (!plan || !name || !whatsapp || !dateISO || !time) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    let amount = plan === "mensal" ? 360 : 120;
    amount = applyCoupon(amount, coupon);

    const external_reference = JSON.stringify({
      name,
      whatsapp,
      plan,
      dateISO,
      time,
      amount
    });

    const response = await axios.post(
      "https://api.mercadopago.com/checkout/preferences",
      {
        items: [
          {
            title:
              plan === "mensal"
                ? "Pacote Mensal (4 sessões)"
                : "Sessão Individual (55 min)",
            quantity: 1,
            unit_price: amount
          }
        ],
        external_reference
      },
      {
        headers: {
          Authorization: `Bearer ${MERCADO_TOKEN}`
        }
      }
    );

    prefStore[response.data.id] = JSON.parse(external_reference);

    res.json({
      init_point: response.data.init_point,
      preference_id: response.data.id
    });
  } catch (err) {
    console.error("Erro pagamento:", err.response?.data || err.message);
    res.status(500).json({ error: "Erro ao criar pagamento" });
  }
});

/* ---------- Webhook ---------- */
app.post("/webhook", async (req, res) => {
  try {
    const paymentId = req.body?.data?.id;
    if (!paymentId) return res.sendStatus(200);

    const pay = await axios.get(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${MERCADO_TOKEN}`
        }
      }
    );

    if (pay.data.status !== "approved") {
      return res.sendStatus(200);
    }

    const prefId = pay.data.preference_id;
    let booking = prefStore[prefId];

    if (!booking && pay.data.external_reference) {
      booking = JSON.parse(pay.data.external_reference);
    }

    /* ---------- Google Calendar ---------- */
    if (calendar && booking?.dateISO && booking?.time) {
      await googleJwtClient.authorize();

      const start = new Date(`${booking.dateISO}T${booking.time}:00`);
      const end = new Date(start.getTime() + 55 * 60000);

      await calendar.events.insert({
        calendarId: CALENDAR_ID,
        resource: {
          summary: `Sessão TRG - ${booking.name}`,
          start: {
            dateTime: start.toISOString(),
            timeZone: "America/Sao_Paulo"
          },
          end: {
            dateTime: end.toISOString(),
            timeZone: "America/Sao_Paulo"
          }
        }
      });
    }

    /* ---------- WhatsApp ---------- */
    if (twilioClient && booking?.whatsapp) {
      await twilioClient.messages.create({
        from: TWILIO_WHATSAPP_FROM,
        to: `whatsapp:${booking.whatsapp}`,
        body: `Olá ${booking.name}, seu pagamento foi confirmado. Sessão agendada com sucesso ✅`
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro webhook:", err.message);
    res.sendStatus(500);
  }
});

/* ---------- Start ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
