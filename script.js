document.addEventListener("DOMContentLoaded",()=>{

const hamburger=document.querySelector(".hamburger");
const sidebar=document.querySelector(".sidebar");
const close=document.querySelector(".close");

hamburger?.addEventListener("click",()=>sidebar.classList.add("open"));
close?.addEventListener("click",()=>sidebar.classList.remove("open"));

document.querySelectorAll(".sidebar a").forEach(a=>{
a.addEventListener("click",()=>sidebar.classList.remove("open"));
});

const form=document.querySelector("#bookingForm");

if(form){
form.addEventListener("submit",async e=>{
e.preventDefault();

const data={
plan:form.dataset.plan,
name:form.name.value,
whatsapp:form.whatsapp.value,
dateISO:form.date.value,
time:form.time.value
};

const res=await fetch(
"https://luciene-backend.onrender.com/create_preference",
{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify(data)
}
);

const json=await res.json();
if(json.init_point) window.location.href=json.init_point;
else alert("Erro ao gerar pagamento");
});
}

});
