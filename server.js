// server.js
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import { google } from "googleapis";
import twilio from "twilio";

const app = express();
app.use(cors());
app.use(bodyParser.json());

/* ---------- CONFIG (via env vars no Railway) ---------- */
const MERCADO_TOKEN = process.env.MERCADO_ACCESS_TOKEN || ""; // Bearer token do Mercado Pago
// GOOGLE_SERVICE_ACCOUNT: coloque TODO o JSON aqui (string). Ex: paste do arquivo JSON
const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT || null;
// ID do calendário do proprietário (ex: email do calendário) ou 'primary'
const CALENDAR_ID = process.env.CALENDAR_ID || "primary";
// Opcional Twilio para enviar WhatsApp
const TWILIO_SID = process.env.TWILIO_SID || null;
const TWILIO_AUTH = process.env.TWILIO_AUTH || null;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || null; // ex: 'whatsapp:+1415...'
const OWNER_WHATSAPP = process.env.OWNER_WHATSAPP || null; // ex: '+5583987149132'

// Cupons opcionais: JSON string como '{"LUCY10":0.1, "TRG20":0.2}'
let COUPONS = {};
if (process.env.COUPONS) {
  try { COUPONS = JSON.parse(process.env.COUPONS); } catch(e){ console.warn("COUPONS inválido"); }
}

/* ---------- Inicializa Twilio (se configurado) ---------- */
let twilioClient = null;
if (TWILIO_SID && TWILIO_AUTH) {
  twilioClient = twilio(TWILIO_SID, TWILIO_AUTH);
  console.log("Twilio habilitado.");
}

/* ---------- Google Calendar: cria cliente com service account (se fornecido) ---------- */
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
    calendar = google.calendar({ version: "v3", auth: googleJwtClient });
    console.log("Google Calendar cliente preparado.");
  } catch (e) {
    console.error("Falha ao ler GOOGLE_SERVICE_ACCOUNT:", e.message);
  }
} else {
  console.warn("GOOGLE_SERVICE_ACCOUNT não definido.");
}

/* ---------- Armazenamento temporário (memory) preference_id -> booking */
const prefStore = {}; // Em produção troque por DB real (Supabase, Postgres, etc).

/* ---------- Helpers ---------- */
function applyCoupon(amount, couponCode) {
  if (!couponCode) return amount;
  const c = (couponCode || "").toUpperCase();
  if (COUPONS && COUPONS[c]) {
    const discount = COUPONS[c]; // ex: 0.1 para 10%
    return Math.round((amount * (1 - discount)) * 100) / 100;
  }
  return amount;
}

/* ---------- Route: cria preferência do Mercado Pago ---------- */
app.post("/create_preference", async (req, res) => {
  /*
    Body esperado:
    {
      plan: "individual" | "mensal",
      name: "Nome do cliente",
      whatsapp: "+5583....",
      dateISO: "YYYY-MM-DD",
      time: "HH:MM",
      coupon: "LUCY10" (opcional)
    }
  */
  try {
    const { plan, name, whatsapp, dateISO, time, coupon } = req.body;
    if (!plan || !name || !whatsapp || !dateISO || !time) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }

    // Valores base (ajuste se precisar)
    let amount = plan === "mensal" ? 360.00 : 120.00;
    amount = applyCoupon(amount, coupon);

    // Cria objeto external_reference com dados essenciais (string)
    const external_reference = JSON.stringify({
      name, whatsapp, plan, dateISO, time, amount
    });

    const body = {
      items: [
        {
          title: plan === "mensal" ? "Pacote Mensal (4 sessões)" : "Sessão Individual (55 min)",
          quantity: 1,
          unit_price: amount
        }
      ],
      external_reference,
      // Você pode adicionar "notification_url" aqui se quiser que cada preference tenha sua própria URL
    };

    // Chamada Mercado Pago - criar preferência
    const r = await axios.post(
      "https://api.mercadopago.com/checkout/preferences",
      body,
      { headers: { Authorization: `Bearer ${MERCADO_TOKEN}` } }
    );

    const pref = r.data;
    // Salva no store temporário
    prefStore[pref.id] = { name, whatsapp, plan, dateISO, time, amount };

    // Retorna init_point e id para o frontend
    return res.json({ init_point: pref.init_point, preference_id: pref.id, raw: pref });
  } catch (err) {
    console.error("create_preference error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Erro ao criar preferência" });
  }
});

/* ---------- Route: webhook (Mercado Pago) ---------- */
app.post("/webhook", async (req, res) => {
  // O Mercado Pago envia vários formatos. A prática: pegar payment id em req.body.data.id
  try {
    console.log("Webhook recebido:", JSON.stringify(req.body).slice(0, 600));
    const paymentId = req.body?.data?.id || req.body?.id || null;
    if (!paymentId) {
      return res.status(200).send("no-payment-id");
    }

    // Obter informação do pagamento
    const payRes = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MERCADO_TOKEN}` }
    });
    const payment = payRes.data;
    console.log("Pagamento status:", payment.status, "id:", payment.id);

    // Só proceed se aprovado
    if (payment.status !== "approved") {
      console.log("Pagamento não aprovado:", payment.status);
      return res.status(200).send("not-approved");
    }

    // Tentar obter preference_id
    let prefId = payment.preference_id || payment.order?.preference_id || null;

    // Tentar extrair booking do prefStore
    let booking = prefId ? prefStore[prefId] : null;

    // Se não achou, buscar preference via API e ler external_reference
    if (!booking && prefId) {
      try {
        const prefRes = await axios.get(`https://api.mercadopago.com/checkout/preferences/${prefId}`, {
          headers: { Authorization: `Bearer ${MERCADO_TOKEN}` }
        });
        if (prefRes.data?.external_reference) {
          try {
            const parsed = JSON.parse(prefRes.data.external_reference);
            booking = parsed;
          } catch(e) { /* ignore */ }
        }
      } catch(e) { console.warn("Não foi possível buscar preferência", e.message); }
    }

    // fallback: se payment.additional_info ou payer for suficiente
    if (!booking) {
      booking = {
        name: payment.payer?.first_name || payment.payer?.name || "Cliente",
        whatsapp: "", // não disponível no payment
        plan: "Atendimento",
        dateISO: null,
        time: null,
        amount: payment.transaction_amount || 0
      };
    }

    // Cria evento no Google Calendar se possível e se tiver date/time
    if (calendar && booking.dateISO && booking.time) {
      try {
        // autoriza jwt explicitamente (pode ser necessário)
        await googleJwtAuthorize();

        const start = new Date(`${booking.dateISO}T${booking.time}:00`);
        const end = new Date(start.getTime() + 55 * 60000);

        const event = {
          summary: `${booking.plan} - ${booking.name}`,
          description: `Pagamento confirmado (Mercado Pago). Payment id: ${payment.id}`,
          start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
          end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
          // attendees: optional
        };

        await calendar.events.insert({ calendarId: CALENDAR_ID, resource: event });
        console.log("Evento criado no Google Calendar:", booking.name, booking.dateISO, booking.time);
      } catch (e) {
        console.error("Erro criando evento no Calendar:", e.message || e);
      }
    } else {
      console.log("Sem dados de data/hora ou calendar não configurado. booking:", booking);
    }

    // Envia WhatsApp via Twilio (opcional)
    if (twilioClient && booking.whatsapp) {
      try {
        const msg = `Olá ${booking.name}, seu pagamento de R$${booking.amount} foi confirmado. Seu agendamento: ${booking.dateISO || '—'} ${booking.time || ''}.`;
        await twilioClient.messages.create({
          from: TWILIO_WHATSAPP_FROM,
          to: booking.whatsapp.startsWith('+') ? `whatsapp:${booking.whatsapp}` : `whatsapp:+${booking.whatsapp}`,
          body: msg
        });
        console.log("WhatsApp enviado para cliente.");
      } catch (e) {
        console.error("Erro Twilio:", e.message || e);
      }
    } else {
      // fallback: notifica proprietário via Twilio (opcional)
      if (twilioClient && OWNER_WHATSAPP) {
        try {
          const body = `Pagamento confirmado: ${booking.name} — ${booking.plan} — R$${booking.amount}`;
          await twilioClient.messages.create({
            from: TWILIO_WHATSAPP_FROM,
            to: OWNER_WHATSAPP.startsWith('+') ? `whatsapp:${OWNER_WHATSAPP}` : `whatsapp:+${OWNER_WHATSAPP}`,
            body
          });
        } catch (_) { /* ignore */ }
      }
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error("Erro webhook:", err.response?.data || err.message);
    return res.status(500).send("error");
  }
});

/* ---------- função para autorizar jwt (Google) ---------- */
async function googleJwtAuthorize(){
  if (!googleJwtClient) return;
  try {
    await googleJwtClient.authorize();
  } catch(e) {
    // pode falhar se já autorizado ou se credenciais incorretas
    // apenas log
    console.warn("Google authorize warning:", e.message || e);
  }
}

/* ---------- Start server ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
