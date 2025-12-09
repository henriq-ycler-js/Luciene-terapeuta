const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

app.post('/webhook', async (req, res) => {
  const data = req.body;

  const nomeCliente = data?.payer?.first_name || "Cliente";
  const valorPago = data?.transaction_amount || 0;
  const whatsapp = '5583987149132'; // Seu número para enviar WhatsApp

  const mensagem = encodeURIComponent(`Olá ${nomeCliente}, seu pagamento de R$${valorPago} foi confirmado! Seu agendamento foi realizado.`);

  try {
    await axios.get(`https://api.whatsapp.com/send?phone=${whatsapp}&text=${mensagem}`);
  } catch(err) {
    console.error("Erro ao enviar WhatsApp:", err.message);
  }

  res.status(200).send('Webhook recebido');
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
