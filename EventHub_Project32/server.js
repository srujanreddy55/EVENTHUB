const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, "eventhub.db"));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  venue TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_time TEXT NOT NULL,
  price REAL NOT NULL CHECK(price >= 0),
  image TEXT NOT NULL DEFAULT '',
  total_seats INTEGER NOT NULL DEFAULT 40,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  seats TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  total REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'UPI',
  payment_status TEXT NOT NULL DEFAULT 'DEMO_ONLY',
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(event_id) REFERENCES events(id)
);
CREATE TABLE IF NOT EXISTS booked_seats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  seat_number INTEGER NOT NULL,
  booking_id INTEGER NOT NULL,
  UNIQUE(event_id, seat_number),
  FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(booking_id) REFERENCES bookings(id)
);
`);

// Backward-compatible migration for an existing local SQLite database.
const bookingColumns = db.prepare("PRAGMA table_info(bookings)").all().map(column => column.name);
if (!bookingColumns.includes("payment_method")) db.exec("ALTER TABLE bookings ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'UPI'");
if (!bookingColumns.includes("payment_status")) db.exec("ALTER TABLE bookings ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'DEMO_ONLY'");

const eventCount = db.prepare("SELECT COUNT(*) AS n FROM events").get().n;
if (!eventCount) {
  const seed = db.prepare(`INSERT INTO events
    (title,category,description,venue,event_date,event_time,price,image,total_seats)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  [
    ["Tech Summit 2026","Technology","A full day of technology talks, practical sessions, and networking with builders.","Hyderabad International Convention Centre","2026-11-08","10:00",499,"https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80",40],
    ["Live Music Night","Music","An energetic live music evening with local artists and a professional stage setup.","People's Plaza, Hyderabad","2026-11-15","18:30",699,"https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80",40],
    ["Startup & Innovation Expo","Business","Meet founders, discover new ideas, and explore student startup projects.","T-Hub, Hyderabad","2026-11-21","11:00",299,"https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80",40],
    ["Comedy Night","Comedy","A fun stand-up show featuring fresh comedy and audience interaction.","Shilpakala Vedika, Hyderabad","2026-11-28","19:00",399,"https://images.unsplash.com/photo-1585699324551-f6c309edad3f?auto=format&fit=crop&w=1200&q=80",40],
    ["Design & Creators Meetup","Workshop","A hands-on meetup for design, content, and creative technology enthusiasts.","Jubilee Hills, Hyderabad","2026-12-05","14:00",199,"https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80",40],
    ["Campus Gaming Tournament","Gaming","Compete with other players in a friendly campus gaming tournament.","SR University, Warangal","2026-12-12","09:00",149,"https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80",40]
  ].forEach(e => seed.run(...e));
}

function safeUser(user) {
  return user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null;
}
function requireUser(req, res, next) {
  const id = Number(req.header("x-user-id"));
  const user = id ? db.prepare("SELECT * FROM users WHERE id = ?").get(id) : null;
  if (!user) return res.status(401).json({ error: "Please sign in to continue." });
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  requireUser(req, res, () => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
    next();
  });
}

app.get("/api/health", (req,res) => res.json({ status:"ok", database:"SQLite", app:"EventHub" }));
app.get("/api/events", (req,res) => {
  const { q = "", category = "" } = req.query;
  const rows = db.prepare(`
    SELECT e.*,
      (e.total_seats - (SELECT COUNT(*) FROM booked_seats bs WHERE bs.event_id=e.id)) AS seats_left
    FROM events e
    WHERE (e.title LIKE ? OR e.venue LIKE ? OR e.description LIKE ?)
      AND (? = '' OR e.category = ?)
    ORDER BY e.event_date, e.event_time
  `).all(`%${q}%`,`%${q}%`,`%${q}%`,category,category);
  res.json(rows);
});
app.get("/api/events/:id", (req,res) => {
  const event = db.prepare(`SELECT e.*,
    (e.total_seats - (SELECT COUNT(*) FROM booked_seats bs WHERE bs.event_id=e.id)) AS seats_left
    FROM events e WHERE e.id=?`).get(Number(req.params.id));
  if (!event) return res.status(404).json({error:"Event not found."});
  const booked = db.prepare("SELECT seat_number FROM booked_seats WHERE event_id=? ORDER BY seat_number").all(event.id).map(x=>x.seat_number);
  res.json({...event, booked_seats:booked});
});

app.post("/api/auth/register", (req,res) => {
  const { name, email, password } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({error:"Name, email, and password are required."});
  if (password.length < 6) return res.status(400).json({error:"Password must be at least 6 characters."});
  try {
    const info = db.prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'user')").run(name.trim(),email.trim().toLowerCase(),password);
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
    res.status(201).json({user:safeUser(user)});
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({error:"That email is already registered."});
    res.status(500).json({error:"Could not create account."});
  }
});
app.post("/api/auth/login", (req,res) => {
  const { email, password, role = "user" } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE email=? AND password=?").get(String(email||"").trim().toLowerCase(),String(password||""));
  if (!user || !["user","admin"].includes(role) || user.role !== role) return res.status(401).json({error:"Invalid email, password, or account type. Choose the correct sign-in role."});
  res.json({user:safeUser(user)});
});

// A demo admin account is seeded for the review. Change its password before any real deployment.
let admin = db.prepare("SELECT * FROM users WHERE email='admin@eventhub.local'").get();
if (!admin) db.prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'admin')").run("EventHub Admin","admin@eventhub.local","Admin@123");

app.get("/api/bookings/mine", requireUser, (req,res) => {
  const rows = db.prepare(`SELECT b.*, e.title AS event_title, e.venue, e.event_date, e.event_time, e.image
    FROM bookings b JOIN events e ON e.id=b.event_id WHERE b.user_id=? ORDER BY b.id DESC`).all(req.user.id);
  res.json(rows);
});
app.post("/api/bookings", requireUser, (req,res) => {
  const eventId = Number(req.body?.event_id);
  const paymentMethod = String(req.body?.payment_method || "UPI");
  const allowedPaymentMethods = ["UPI", "Card", "Net banking", "Pay at venue"];
  if (!allowedPaymentMethods.includes(paymentMethod)) return res.status(400).json({error:"Choose a valid payment method."});
  const seats = [...new Set((req.body?.seats || []).map(Number))].sort((a,b)=>a-b);
  if (!eventId || !seats.length || seats.some(n=>!Number.isInteger(n)||n<1)) return res.status(400).json({error:"Choose at least one valid seat."});
  const event = db.prepare("SELECT * FROM events WHERE id=?").get(eventId);
  if (!event) return res.status(404).json({error:"Event not found."});
  if (seats.some(n=>n>event.total_seats)) return res.status(400).json({error:"One or more seats are invalid."});
  const createBooking = db.transaction(() => {
    const existing = db.prepare(`SELECT seat_number FROM booked_seats WHERE event_id=? AND seat_number IN (${seats.map(()=>"?").join(",")})`).all(eventId,...seats);
    if (existing.length) throw new Error(`These seats are already booked: ${existing.map(s=>s.seat_number).join(", ")}. Refresh and choose other seats.`);
    const code = "EH" + Date.now().toString().slice(-8) + Math.random().toString(36).slice(2,5).toUpperCase();
    const total = Number((event.price * seats.length).toFixed(2));
    const result = db.prepare("INSERT INTO bookings(booking_code,user_id,event_id,seats,quantity,total,payment_method,payment_status) VALUES(?,?,?,?,?,?,?,?)")
      .run(code,req.user.id,eventId,seats.join(","),seats.length,total,paymentMethod,"DEMO_ONLY");
    const bookingId = Number(result.lastInsertRowid);
    const addSeat = db.prepare("INSERT INTO booked_seats(event_id,seat_number,booking_id) VALUES(?,?,?)");
    seats.forEach(seat=>addSeat.run(eventId,seat,bookingId));
    return db.prepare(`SELECT b.*,e.title AS event_title,e.venue,e.event_date,e.event_time,e.image
      FROM bookings b JOIN events e ON e.id=b.event_id WHERE b.id=?`).get(bookingId);
  });
  try { res.status(201).json(createBooking()); }
  catch(e) { res.status(409).json({error:e.message || "Booking failed."}); }
});

app.get("/api/admin/summary", requireAdmin, (req,res) => {
  res.json({
    events: db.prepare("SELECT COUNT(*) n FROM events").get().n,
    bookings: db.prepare("SELECT COUNT(*) n FROM bookings").get().n,
    users: db.prepare("SELECT COUNT(*) n FROM users WHERE role='user'").get().n,
    revenue: db.prepare("SELECT COALESCE(SUM(total),0) n FROM bookings WHERE status='CONFIRMED'").get().n
  });
});
app.get("/api/admin/bookings", requireAdmin, (req,res) => {
  res.json(db.prepare(`SELECT b.*,u.name AS user_name,u.email,e.title AS event_title,e.event_date
    FROM bookings b JOIN users u ON u.id=b.user_id JOIN events e ON e.id=b.event_id ORDER BY b.id DESC`).all());
});
app.post("/api/admin/events", requireAdmin, (req,res) => {
  const {title,category,description,venue,event_date,event_time,price,image,total_seats} = req.body || {};
  if (![title,category,description,venue,event_date,event_time].every(v=>String(v||"").trim()) || !Number.isFinite(Number(price)) || Number(price)<0)
    return res.status(400).json({error:"Complete all required event fields with a valid price."});
  const seats = Math.max(1,Math.min(500,Number(total_seats)||40));
  const result = db.prepare(`INSERT INTO events(title,category,description,venue,event_date,event_time,price,image,total_seats)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(title.trim(),category,description.trim(),venue.trim(),event_date,event_time,Number(price),String(image||""),seats);
  res.status(201).json({id:Number(result.lastInsertRowid),message:"Event created."});
});
app.put("/api/admin/events/:id", requireAdmin, (req,res) => {
  const {title,category,description,venue,event_date,event_time,price,image,total_seats} = req.body || {};
  const id = Number(req.params.id);
  const exists = db.prepare("SELECT id FROM events WHERE id=?").get(id);
  if (!exists) return res.status(404).json({error:"Event not found."});
  if (![title,category,description,venue,event_date,event_time].every(v=>String(v||"").trim()) || !Number.isFinite(Number(price)) || Number(price)<0)
    return res.status(400).json({error:"Complete all required fields with a valid price."});
  db.prepare(`UPDATE events SET title=?,category=?,description=?,venue=?,event_date=?,event_time=?,price=?,image=?,total_seats=? WHERE id=?`)
    .run(title.trim(),category,description.trim(),venue.trim(),event_date,event_time,Number(price),String(image||""),Math.max(1,Math.min(500,Number(total_seats)||40)),id);
  res.json({message:"Event updated."});
});
app.delete("/api/admin/events/:id", requireAdmin, (req,res) => {
  const id = Number(req.params.id);
  if (db.prepare("SELECT COUNT(*) n FROM bookings WHERE event_id=?").get(id).n) return res.status(409).json({error:"Cannot delete an event that already has bookings."});
  db.prepare("DELETE FROM events WHERE id=?").run(id);
  res.json({message:"Event deleted."});
});

app.get("*", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT, '0.0.0.0', () => {
    console.log(`EventHub is running on port ${PORT}`);
});

