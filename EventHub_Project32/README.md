# EventHub — Project 32: Event Ticket Booking System

A responsive full-stack event ticket booking application built with HTML, CSS, JavaScript, Bootstrap 5, Node.js, Express, and SQLite. It does **not** use Firebase.

## Features

- Browse events with search and category filters
- Event cards with date, venue, price, description, and seat availability
- User registration and role-based login (Customer / Administrator)
- Admin sign-in opens a protected admin dashboard automatically
- Interactive seat selection
- Server-side booking validation and duplicate-seat prevention
- Checkout payment choices: UPI, card, net banking, and pay at venue
- Selected payment method is saved with each booking and shown in tickets/admin bookings
- Unique booking reference, booking history, and printable digital ticket
- Admin dashboard with event/user/booking counts and booking value
- Admin can create, edit, and delete events
- SQLite database persists data across server restarts
- Responsive layout for laptop and mobile screens

## Requirements

- Node.js 18 or later (Node.js 20 LTS recommended)
- Internet connection for Bootstrap CDN, Google Fonts, and sample event images
- VS Code or another code editor

## Run on Windows / VS Code

1. Extract the ZIP.
2. Open the `EventHub_Project32` folder in VS Code.
3. Open **Terminal → New Terminal**.
4. Check Node.js is installed:
   ```bash
   node -v
   npm -v
   ```
5. Install packages:
   ```bash
   npm install
   ```
6. Start the application:
   ```bash
   npm start
   ```
7. Open this address in your browser: **http://localhost:3000**

Keep the terminal running while you demonstrate the project. Press `Ctrl + C` to stop the server.

## Sign-in accounts

- **Administrator:** choose **Administrator**** at sign-in and use the administrator credentials provided separately by the project owner. The credentials are intentionally not displayed in the public login screen or this README.
- **Customer:** create a customer account from the Sign in dialog.

Change the seeded admin password and implement password hashing before any public/production deployment. This review build stores passwords as plain text for simplicity and is not production-secure.

## Demo flow for project review

1. Start server and open `http://localhost:3000`.
2. Show the event list, category filters, and search.
3. Register a normal user account.
4. Choose an event and select two seats.
5. Choose a payment option (UPI, card, net banking, or pay at venue), then confirm the demo booking and show its generated booking code. The demo does not charge money.
6. Open **My tickets** and print the ticket.
7. Sign out, then sign in as admin using the credentials above.
8. Open **Admin dashboard**; add or edit an event and show all bookings.
9. Refresh the page and show that the data remains in SQLite.

## Architecture

- **Frontend:** HTML5, CSS3, JavaScript, Bootstrap 5
- **Backend:** Node.js + Express REST API
- **Database:** SQLite (`eventhub.db` is created automatically)
- **API:** `/api/events`, `/api/auth/register`, `/api/auth/login`, `/api/bookings`, `/api/admin/*`

## Important scope note

This is a functional academic project, but the payment choices are demonstration-only: no money is charged and no card/UPI details are collected. To accept real payments, integrate a provider such as Razorpay or Stripe using server-side credentials and verified payment webhooks. Ticket confirmation is a booking confirmation, not proof of a paid transaction. Authentication is simplified for an academic review and should be hardened before public deployment. External fonts, Bootstrap, and event images use CDNs.
