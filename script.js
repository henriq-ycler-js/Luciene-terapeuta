// ===============================
// MENU HAMBURGER (MOBILE)
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const hamburger = document.querySelector(".hamburger");
  const sidebar = document.querySelector(".sidebar");
  const sidebarClose = document.querySelector(".sidebar .close");

  if (hamburger && sidebar) {
    hamburger.addEventListener("click", () => {
      sidebar.classList.add("open");
    });

    if (sidebarClose) {
      sidebarClose.addEventListener("click", () => {
        sidebar.classList.remove("open");
      });
    }

    // Fecha o menu ao clicar em um link
    document.querySelectorAll(".sidebar a").forEach(link => {
      link.addEventListener("click", () => {
        sidebar.classList.remove("open");
      });
    });
  }

  // ===============================
  // FORMULÁRIO DE AGENDAMENTO
  // ===============================
  const form = document.querySelector("#bookingForm");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const data = {
        plan: form.dataset.plan, // individual | mensal
        name: form.querySelector('input[name="name"]').value.trim(),
        whatsapp: form.querySelector('input[name="whatsapp"]').value.trim(),
        dateISO: form.querySelector('input[name="date"]').value,
        time: form.querySelector('input[name="time"]').value,
        coupon: form.querySelector('input[name="coupon"]')
          ? form.querySelector('input[name="coupon"]').value.trim()
          : ""
      };

      // Validação simples
      if (!data.name || !data.whatsapp || !data.dateISO || !data.time) {
        alert("Preencha nome, WhatsApp, data e horário.");
        return;
      }

      try {
        // 🔗 URL DO SEU BACKEND NO RENDER
        const response = await fetch(
          "https://luciene-backend.onrender.com/create_preference",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
          }
        );

        if (!response.ok) {
          throw new Error("Erro ao criar preferência de pagamento");
        }

        const result = await response.json();

        // Redireciona para o Mercado Pago
        if (result.init_point) {
          window.location.href = result.init_point;
        } else {
          alert("Não foi possível gerar o link de pagamento.");
        }

      } catch (error) {
        console.error("Erro:", error);
        alert("Erro ao gerar pagamento. Tente novamente.");
      }
    });
  }
});
