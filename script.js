document.getElementById("year")?.textContent = new Date().getFullYear();

const hamburger = document.querySelector(".hamburger");
const sidebar = document.querySelector(".sidebar");
const closeBtn = document.querySelector(".close");

hamburger?.addEventListener("click",()=>sidebar.classList.add("open"));
closeBtn?.addEventListener("click",()=>sidebar.classList.remove("open"));

const form = document.querySelector("#bookingForm");
if(form){
  form.addEventListener("submit", async e=>{
    e.preventDefault();
    alert("Frontend pronto. Backend já pode ser conectado.");
  });
}
