const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const money = (n) => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(n)||0);
const dateLabel = (d) => d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "";
const timeLabel = (t) => { if(!t)return ""; const [h,m]=t.split(":").map(Number); return new Date(2000,0,1,h,m).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"}); };
const esc = (s="") => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let currentUser = JSON.parse(sessionStorage.getItem("eventhubUser") || "null");
let activeCategory = "";
let selectedEvent = null;
let selectedSeats = new Set();
let authMode = "login";
let eventCache = [];
let editingEvent = null;
const authModal = new bootstrap.Modal($("#authModal"));
const seatModal = new bootstrap.Modal($("#seatModal"));

async function api(url, options={}) {
  const headers = {"Content-Type":"application/json",...(options.headers||{})};
  if(currentUser) headers["x-user-id"] = currentUser.id;
  const res = await fetch(url,{...options,headers});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function toast(message,type="success") {
  const el=document.createElement("div");el.className=`app-toast ${type}`;el.textContent=message;$("#toastArea").append(el);
  setTimeout(()=>el.remove(),3600);
}
function updateNav() {
  $("#authBtn").classList.toggle("d-none",!!currentUser);
  $("#logoutBtn").classList.toggle("d-none",!currentUser);
  $$(".admin-link").forEach(el=>el.classList.toggle("d-none",currentUser?.role!=="admin"));
}
function showPage(page) {
  if(page==="admin"&&currentUser?.role!=="admin"){toast("Sign in with the admin account to open the dashboard.","error");openAuth();return;}
  $("#homePage").classList.toggle("d-none",page!=="home");
  $("#ticketsPage").classList.toggle("d-none",page!=="tickets");
  $("#adminPage").classList.toggle("d-none",page!=="admin");
  $$(".nav-link").forEach(a=>a.classList.toggle("active",a.dataset.page===page));
  if(page==="home") loadEvents();
  if(page==="tickets") loadTickets();
  if(page==="admin") loadAdmin();
  window.scrollTo({top:0,behavior:"smooth"});
}
document.addEventListener("click",e=>{
  const link=e.target.closest("[data-page]");
  if(link){e.preventDefault();showPage(link.dataset.page);}
});
$("#authBtn").addEventListener("click",openAuth);
$("#logoutBtn").addEventListener("click",()=>{currentUser=null;sessionStorage.removeItem("eventhubUser");updateNav();toast("You have signed out.");showPage("home");});
function openAuth(){setAuthMode("login");authModal.show();}
function setAuthMode(mode){
  authMode=mode;$("#authTitle").textContent=mode==="login"?"Sign in":"Create your account";
  $("#authSubtitle").textContent=mode==="login"?"Pick up where your next experience begins.":"A few details and you're ready to explore.";
  $("#nameField").classList.toggle("d-none",mode!=="register");
  $("#roleField").classList.toggle("d-none",mode!=="login");
  $("#authName").required=mode==="register";
  $("#authSubmit").textContent=mode==="login"?"Sign in":"Create account";
  $("#authSwitchText").textContent=mode==="login"?"New to EventHub?":"Already have an account?";
  $("#authSwitch").textContent=mode==="login"?"Create an account":"Sign in";
}
$("#authSwitch").addEventListener("click",()=>setAuthMode(authMode==="login"?"register":"login"));
$("#authForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const body={email:$("#authEmail").value,password:$("#authPassword").value};
    if(authMode==="login")body.role=$("#authRole").value;
    if(authMode==="register")body.name=$("#authName").value;
    const result=await api(`/api/auth/${authMode==="login"?"login":"register"}`,{method:"POST",body:JSON.stringify(body)});
    currentUser=result.user;sessionStorage.setItem("eventhubUser",JSON.stringify(currentUser));updateNav();authModal.hide();$("#authForm").reset();toast(`Welcome${currentUser.name?`, ${currentUser.name}`:""}!`);
    if(currentUser.role==="admin")showPage("admin");
  }catch(err){toast(err.message,"error");}
});
$("#searchInput").addEventListener("input",()=>loadEvents());
$("#categoryRow").addEventListener("click",e=>{
  const btn=e.target.closest("[data-category]");if(!btn)return;
  activeCategory=btn.dataset.category;$$(".category-chip").forEach(b=>b.classList.toggle("selected",b===btn));loadEvents();
});
async function loadEvents(){
  const grid=$("#eventsGrid");grid.innerHTML='<div class="loading">Loading events…</div>';
  try{
    const query=new URLSearchParams({q:$("#searchInput").value.trim(),category:activeCategory});
    eventCache=await api(`/api/events?${query}`);
    $("#statEvents").textContent=eventCache.length;
    if(!eventCache.length){grid.innerHTML='<div class="empty-state">No events found. Try another search or category.</div>';return;}
    grid.innerHTML=eventCache.map(ev=>`
      <article class="event-card">
        <div class="event-image" style="background-image:url('${esc(ev.image||"")}')">
          <span class="event-category">${esc(ev.category)}</span><span class="event-price">${money(ev.price)}</span>
        </div>
        <div class="event-content"><div class="event-date">${dateLabel(ev.event_date)} · ${timeLabel(ev.event_time)}</div>
          <h3>${esc(ev.title)}</h3><p>${esc(ev.description)}</p>
          <div class="event-meta"><span>⌖ ${esc(ev.venue)}</span><span>${ev.seats_left} seats left</span></div>
          <button class="btn btn-primary" data-book-event="${ev.id}" ${ev.seats_left<=0?"disabled":""}>${ev.seats_left<=0?"Sold out":"Choose seats →"}</button>
        </div>
      </article>`).join("");
  }catch(err){grid.innerHTML=`<div class="empty-state">Could not load events. Make sure the server is running.<br>${esc(err.message)}</div>`;}
}
$("#eventsGrid").addEventListener("click",e=>{
  const btn=e.target.closest("[data-book-event]");if(!btn)return;
  if(!currentUser){toast("Sign in before booking your ticket.","error");openAuth();return;}
  openSeats(Number(btn.dataset.bookEvent));
});
async function openSeats(id){
  try{
    selectedEvent=await api(`/api/events/${id}`);selectedSeats=new Set();
    $("#seatEventInfo").innerHTML=`<div class="eyebrow">PICK YOUR SPOT</div><h2>${esc(selectedEvent.title)}</h2><p class="muted mb-0">${dateLabel(selectedEvent.event_date)} · ${timeLabel(selectedEvent.event_time)} · ${money(selectedEvent.price)} per seat</p>`;
    renderSeats();seatModal.show();
  }catch(err){toast(err.message,"error");}
}
function renderSeats(){
  const map=$("#seatMap");map.innerHTML="";
  for(let n=1;n<=selectedEvent.total_seats;n++){
    const booked=selectedEvent.booked_seats.includes(n),chosen=selectedSeats.has(n);
    const b=document.createElement("button");b.type="button";b.className=`seat ${booked?"booked":chosen?"selected":"available"}`;b.textContent=n;b.disabled=booked;b.title=booked?`Seat ${n} booked`:`Seat ${n}`;
    b.addEventListener("click",()=>{if(selectedSeats.has(n))selectedSeats.delete(n);else selectedSeats.add(n);renderSeats();});
    map.append(b);
  }
  $("#selectedSeatsLabel").textContent=selectedSeats.size?[...selectedSeats].sort((a,b)=>a-b).join(", "):"None";
  $("#selectedTotal").textContent=money(selectedSeats.size*selectedEvent.price);
  $("#confirmBookingBtn").disabled=!selectedSeats.size;
}
$("#confirmBookingBtn").addEventListener("click",async()=>{
  try{
    const booking=await api("/api/bookings",{method:"POST",body:JSON.stringify({event_id:selectedEvent.id,seats:[...selectedSeats],payment_method:document.querySelector("input[name=paymentMethod]:checked")?.value||"UPI"})});
    seatModal.hide();toast(`Booking confirmed! Code: ${booking.booking_code}`);loadEvents();showPage("tickets");
  }catch(err){toast(err.message,"error");if(err.message.includes("already booked"))openSeats(selectedEvent.id);}
});
async function loadTickets(){
  const list=$("#ticketsList");
  if(!currentUser){list.innerHTML='<div class="empty-state">Sign in to view your tickets.<br><button class="btn btn-primary mt-3" onclick="document.querySelector(\'#authBtn\').click()">Sign in</button></div>';return;}
  list.innerHTML='<div class="loading">Loading your tickets…</div>';
  try{
    const rows=await api("/api/bookings/mine");
    if(!rows.length){list.innerHTML='<div class="empty-state">No tickets yet. Explore events and book your first experience.</div>';return;}
    list.innerHTML=rows.map(b=>`<article class="ticket-card"><img src="${esc(b.image||"")}" alt=""><div><span class="ticket-code">${esc(b.booking_code)}</span><h3>${esc(b.event_title)}</h3><div class="ticket-detail">${dateLabel(b.event_date)} · ${timeLabel(b.event_time)} · ${esc(b.venue)}</div><div class="ticket-detail">Seats: ${esc(b.seats)} · ${b.quantity} ticket(s)</div><div class="ticket-detail">Payment: ${esc(b.payment_method||"Not specified")} · Demo only</div><strong>${money(b.total)}</strong></div><div class="ticket-actions"><button class="btn btn-primary btn-sm" data-print-ticket="${b.id}">Print ticket</button></div></article>`).join("");
  }catch(err){list.innerHTML=`<div class="empty-state">${esc(err.message)}</div>`;}
}
$("#ticketsList").addEventListener("click",async e=>{
  const btn=e.target.closest("[data-print-ticket]");if(!btn)return;
  try{
    const rows=await api("/api/bookings/mine");const b=rows.find(x=>x.id===Number(btn.dataset.printTicket));if(!b)return;
    const w=window.open("","_blank","width=700,height=700");if(!w){toast("Allow pop-ups to print your ticket.","error");return;}
    w.document.write(`<!doctype html><html><head><title>EventHub Ticket</title><style>body{font-family:Arial;padding:40px;color:#222}.ticket{border:2px dashed #7658ed;border-radius:18px;padding:30px;max-width:560px;margin:auto}h1{color:#7658ed}small{color:#666}</style></head><body><div class="ticket"><h1>EventHub</h1><h2>${esc(b.event_title)}</h2><p>${dateLabel(b.event_date)} · ${timeLabel(b.event_time)}</p><p>${esc(b.venue)}</p><hr><p><b>Booking code:</b> ${esc(b.booking_code)}</p><p><b>Seats:</b> ${esc(b.seats)}</p><p><b>Tickets:</b> ${b.quantity}</p><h3>Total: ${money(b.total)}</h3><small>Present this ticket at the event entrance. Project ticket; no payment gateway is connected.</small></div><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
  }catch(err){toast(err.message,"error");}
});
async function loadAdmin(){
  try{
    const [stats,events,bookings]=await Promise.all([api("/api/admin/summary"),api("/api/events"),api("/api/admin/bookings")]);
    $("#adminStats").innerHTML=[["Events",stats.events],["Bookings",stats.bookings],["Registered users",stats.users],["Booking value",money(stats.revenue)]].map(([label,value])=>`<div class="stat-card"><small>${label}</small><strong>${value}</strong></div>`).join("");
    $("#adminEvents").innerHTML=events.map(ev=>`<div class="admin-event-row"><div><strong>${esc(ev.title)}</strong><small>${dateLabel(ev.event_date)} · ${money(ev.price)} · ${ev.seats_left} left</small></div><div class="admin-event-actions"><button data-edit-event="${ev.id}">Edit</button><button class="delete" data-delete-event="${ev.id}">Delete</button></div></div>`).join("")||'<p class="muted">No events yet.</p>';
    $("#adminBookings").innerHTML=bookings.map(b=>`<tr><td>${esc(b.booking_code)}</td><td>${esc(b.user_name)}<br><small>${esc(b.email)}</small></td><td>${esc(b.event_title)}<br><small>${dateLabel(b.event_date)}</small></td><td>${esc(b.seats)}</td><td>${money(b.total)}</td><td>${esc(b.payment_method||"—")}<br><span class="status-pill">${esc(b.status)}</span></td></tr>`).join("")||'<tr><td colspan="6" class="text-center muted py-4">No bookings yet.</td></tr>';
  }catch(err){toast(err.message,"error");if(err.message.includes("Admin"))showPage("home");}
}
function resetEventForm(){
  editingEvent=null;$("#eventForm").reset();$("#editEventId").value="";$("#eventFormTitle").textContent="Create an event";$("#saveEventBtn").textContent="Save event";$("#cancelEditBtn").classList.add("d-none");$("#eventSeats").value=40;$("#eventTime").value="10:00";
}
$("#cancelEditBtn").addEventListener("click",resetEventForm);
$("#eventForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const body={title:$("#eventTitle").value,category:$("#eventCategory").value,description:$("#eventDescription").value,venue:$("#eventVenue").value,event_date:$("#eventDate").value,event_time:$("#eventTime").value,price:Number($("#eventPrice").value),total_seats:Number($("#eventSeats").value),image:$("#eventImage").value};
  try{
    if(editingEvent)await api(`/api/admin/events/${editingEvent}`,{method:"PUT",body:JSON.stringify(body)});
    else await api("/api/admin/events",{method:"POST",body:JSON.stringify(body)});
    toast(editingEvent?"Event updated.":"Event created.");resetEventForm();loadAdmin();
  }catch(err){toast(err.message,"error");}
});
$("#adminEvents").addEventListener("click",async e=>{
  const edit=e.target.closest("[data-edit-event]"),del=e.target.closest("[data-delete-event]");
  if(edit){
    const ev=eventCache.find(x=>x.id===Number(edit.dataset.editEvent)) || (await api("/api/events")).find(x=>x.id===Number(edit.dataset.editEvent));
    if(!ev)return;editingEvent=ev.id;$("#editEventId").value=ev.id;$("#eventTitle").value=ev.title;$("#eventCategory").value=ev.category;$("#eventDescription").value=ev.description;$("#eventVenue").value=ev.venue;$("#eventDate").value=ev.event_date;$("#eventTime").value=ev.event_time;$("#eventPrice").value=ev.price;$("#eventSeats").value=ev.total_seats;$("#eventImage").value=ev.image;$("#eventFormTitle").textContent="Edit event";$("#saveEventBtn").textContent="Update event";$("#cancelEditBtn").classList.remove("d-none");$("#eventForm").scrollIntoView({behavior:"smooth",block:"start"});
  }
  if(del&&confirm("Delete this event? Events with bookings cannot be deleted.")){
    try{await api(`/api/admin/events/${del.dataset.deleteEvent}`,{method:"DELETE"});toast("Event deleted.");loadAdmin();}catch(err){toast(err.message,"error");}
  }
});
updateNav();loadEvents();
