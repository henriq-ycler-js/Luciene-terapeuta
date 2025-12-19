// MENU HAMBURGER
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.querySelector('.hamburger');
  const sidebar = document.querySelector('.sidebar');
  const sidebarClose = document.querySelector('.sidebar .close');

  if (hamburger && sidebar) {
    hamburger.addEventListener('click', () => sidebar.classList.add('open'));
    if (sidebarClose) {
      sidebarClose.addEventListener('click', () => sidebar.classList.remove('open'));
    }
    document.querySelectorAll('.sidebar a').forEach(a =>
      a.addEventListener('click', () => sidebar.classList.remove('open'))
    );
  }

  // FORM DE AGENDAMENTO
  const form = document.querySelector('#bookingForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
      plan: form.dataset.plan || "individual", // default seguro
      name: form.querySelector('input[name="name"]').value.trim(),
      whatsapp: form.querySelector('input[name="whatsapp"]').value.trim(),
      dateISO: form.querySelector('input[name="date"]').value,
      time: form.querySelector('input[name="time"]').value,
      coupon: form.querySelector('input[name="coupon"]')
        ? form.querySelector('input[name="coupon"]').value.trim()
        : ""
    };

    // validação
    if (!data.name || !data.whatsapp || !data.dateISO || !data.time) {
      alert('Preencha nome, WhatsApp, data e horário.');
      return;
    }

    try {
      const res = await fetch(
        'https://luciene-backend.onrender.com/create_preference',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }
      );

      if (!res.ok) throw new Error('Erro ao criar preferência');

      const j = await res.json();

      if (j.init_point) {
        // REDIRECIONA PARA O MERCADO PAGO
        window.location.href = j.init_point;
      } else {
        alert('Não foi possível gerar o link de pagamento.');
        console.log(j);
      }

    } catch (err) {
      console.error(err);
      alert('Erro ao gerar pagamento. Tente novamente.');
    }
  });
});
