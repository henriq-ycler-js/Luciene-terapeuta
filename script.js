
// MENU HAMBURGER
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.querySelector('.hamburger');
  const sidebar = document.querySelector('.sidebar');
  const sidebarClose = document.querySelector('.sidebar .close');

  if(hamburger && sidebar){
    hamburger.addEventListener('click', () => sidebar.classList.add('open'));
    if(sidebarClose) sidebarClose.addEventListener('click', () => sidebar.classList.remove('open'));
    // fechar ao clicar em link
    document.querySelectorAll('.sidebar a').forEach(a => a.addEventListener('click', () => sidebar.classList.remove('open')));
  }

  // Form submit: envia para backend /create_preference
  const form = document.querySelector('#bookingForm');
  if(form){
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        plan: form.dataset.plan,
        name: form.querySelector('input[name="name"]').value.trim(),
        whatsapp: form.querySelector('input[name="whatsapp"]').value.trim(),
        dateISO: form.querySelector('input[name="date"]').value,
        time: form.querySelector('input[name="time"]').value,
        coupon: form.querySelector('input[name="coupon"]') ? form.querySelector('input[name="coupon"]').value.trim() : ''
      };

      // validação simples
      if(!data.name || !data.whatsapp || !data.dateISO || !data.time){
        alert('Por favor preencha nome, WhatsApp, dia e horário.');
        return;
      }

      // Chame o endpoint do seu backend (mude a URL para o seu Repl/Railway)
      try {
        const res = await fetch('https://SEU_BACKEND_URL/create_preference', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify(data)
        });
        if(!res.ok) throw new Error('Erro ao criar preferência');
        const j = await res.json();
        // j.init_point (ou pagamento_url) -> redireciona para Mercado Pago
        const checkout = j.init_point || j.pagamento_url || j.payment_url;
        if(checkout) window.location.href = checkout;
        else alert('Não foi possível obter link de pagamento. Verifique o backend.');
      } catch(err){
        console.error(err);
        alert('Erro ao gerar pagamento. Tente novamente mais tarde.');
      }
    });
  }
});