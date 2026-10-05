# Client demo: walkthrough checklist

Time: lagbhag 30 minutes (core 25 min + optional money flow 5 min). Har step mein likha hai kya karna hai, kya dikhna chahiye, aur kya bolna hai.

Jo cheez abhi kaam nahi karti ya maine verify nahi ki, wo "⚠" se marked hai. Unhe demo se pehle ek baar khud try kar lo.

---

## 1. Demo se pehle (raat ko ya 30 min pehle)

### Setup

- [ ] Dev server chal raha hai (`npm run dev`, abhi port 3000 par). `.env.local` badla ho to server restart karo.
- [ ] ⚠ Behtar: `npm run build` chala kar `npm start` se demo karo. Production mode mein pages tez khulte hain aur dev ka "N" badge/overlay nahi dikhta. Maine build is session mein nahi chalayi, isliye ek baar raat ko chala ke dekh lo.
- [ ] **Warm-up:** dev mode mein har page pehli baar 5-15 second leta hai. Demo se pehle ye sab ek baar khol lo: `/`, `/products`, `/services`, `/projects`, `/blog`, `/about`, `/contact`, aur teeno logins ke dashboards.
- [ ] **Teen alag browser sessions** rakho, taaki logout/login na karna pade: normal window = Admin, Incognito window = Vendor, doosra browser (ya doosri incognito) = Customer.
- [ ] Internet chal raha ho (database Supabase cloud par hai, Singapore region).

### Data tayyar karo

- [ ] Admin se login karke **Admin → Settings** mein asli **contact email, phone, address, working hours** bharo. Abhi ye khali hain, isliye Contact page par sirf message form dikhega.
- [ ] Home page par stats strip dikhe: 5 approved vendors, 16 products, 8 services, 4 projects.
- [ ] Abhi database mein koi order nahi hai (test orders hata diye gaye). Demo mein **naya order live place karo** (section 4). Pehla order `ORD-000003` ke number se banega, kyunki numbering aage badhti rehti hai. Ye normal hai.

### Aaj ke liye mat dikhao (abhi kaam nahi karta)

| Cheez | Kyun |
|---|---|
| Naya signup (`/register`) poora karna | OTP/email provider (MSG91, Resend) configured nahi hai. OTP kahin deliver nahi hota. Sirf form dikhao. |
| Razorpay se payment | Razorpay keys placeholder hain. Order place hota hai, lekin pay step nahi chalega. "Place order" par ruk jao. |
| Mobile (OTP) login | Same wajah: SMS/WhatsApp provider nahi hai. |
| Maintenance mode on karna | Dikha sakte ho, lekin turant wapas off karna. Off karna na bhoolo. |

---

## 2. Accounts

| Panel | Email | Password kahan hai |
|---|---|---|
| Admin (Super Admin) | `admin@justreference.in` | `docs/DEMO_LOGINS.local.md` |
| Vendor | `vendor.demo@example.com` | `docs/DEMO_LOGINS.local.md` |
| Customer | `customer.demo@example.com` | `docs/DEMO_LOGINS.local.md` |

Passwords live ke liye badal diye gaye hain; scripts mein likhe purane passwords ab kaam nahi karte.

Demo data (inme se koi login nahi kar sakta, sirf dikhne ke liye): vendors Northwind Traders, Kaveri Industrial Supplies, BluePeak Services, Stonebridge Builders; members Aarav, Neha, Priya, Imran, aur Rohit (blocked).

Coupon: **WELCOME10** (10% off, minimum order ₹500).

---

## 3. Public website (≈ 4 min), bina login

- [ ] **Home (`/`)**: hero slides (client ke apne taglines, har slide par CTA), category rail, live stats (database se). Bolo: "Ye numbers live database se aate hain."
- [ ] Header ka **search**: box par click karo → popular categories dikhti hain. `toner` ya `chair` type karo → live suggestions (image, category, price, match bold). **Arrow keys + Enter** se kholo, **Esc** se band, `/` dabane se kahin se bhi search focus. Neeche "See all results" → grouped results page (`/search`). Dobara click karo → "Recent searches" yaad rehti hain. Scope (All/Products/Services/Projects) badal ke dikha sakte ho.
- [ ] **All categories** hover karo: mega-menu, real categories + listing counts.
- [ ] Ek category kholo → ek **product detail** (image, vendor, price, Add to cart).
- [ ] **Services** aur **Projects** pages. Services mein "Quote on request" wala type bhi dikhega.
- [ ] **News (`/blog`)** → ek post kholo.
- [ ] **About**, **Contact**, **Feedback**. Contact par "Send us a message" form bhi hai.
- [ ] Mobile view dikhao (browser ko chhota karo): hamburger menu, search.

Bolne ke points: sab vendors admin approve karta hai; approve hone tak listing public nahi dikhti.

---

## 4. Customer panel (≈ 6 min): `customer.demo@example.com`

- [ ] Login → **Dashboard** (customer ka alag dashboard).
- [ ] Menu dikhao: My orders, Invoices, My referrals, My wallet, My coupons, My subscription, Messages, Support. **Admin/Vendor ke options nahi hain.** Yahi "alag panel" hai.
- [ ] **My profile**: personal, address, PAN/GST, bank details, password change.
- [ ] Ek product (jaise "USB-C Docking Station") → **Add to cart** → **Cart** → **Checkout**.
- [ ] Checkout par coupon code `WELCOME10` daalo → discount dikhna chahiye (order ₹500+ ho).
- [ ] **Place order**. Order ban jata hai, phir pay page khulta hai. ⚠ **Yahan ruk jao**, Razorpay configured nahi hai.
- [ ] **My orders** → naya order kholo → status history, items, **Download invoice** (PDF, GST ke saath).
- [ ] **Invoices** page: billing history, GST totals.
- [ ] **My coupons**: WELCOME10 "Available".
- [ ] **My referrals**: referral link, referral tree (customer Aarav ke through aaya hai).
- [ ] **Support** → New ticket banao (agle section mein admin reply karega).

---

## 5. Vendor panel (≈ 5 min): `vendor.demo@example.com`

- [ ] Login → vendor ka **Dashboard**.
- [ ] Menu: My products / services / projects, Vendor orders, Invoices, My vendor profile. Admin menu nahi.
- [ ] **My products → New product**: title, category, description, **Price (₹) rupees mein** (jaise 1500), stock, image upload.
- [ ] Product **Pending** dikhta hai ("admin approve karega").
- [ ] **Vendor orders**: customer ka naya order yahin dikhta hai ← **connected** wala moment.
- [ ] **Invoices → Sales**: apne bechne ke invoices.
- [ ] **My vendor profile**: business name, GSTIN.

---

## 6. Admin panel (≈ 7 min): `admin@justreference.in`

- [ ] **Dashboard**: platform-wide numbers/charts.
- [ ] **Catalog → Products**: vendor ka naya product **Pending**. Kholo → **Approve**. Public site par product ab dikhta hai (customer window refresh karo).
- [ ] **Vendors**: vendor approvals/suspend. **Admins**: staff accounts. **Roles & permissions**: kaun kya kar sakta hai.
- [ ] **Members**: sab members, search, status/date filter. **Rohit Gupta** (blocked) kholo → **Allow member** (reason likhna zaroori), phir wapas **Block member**. Bolo: "Blocked account turant har action se bahar ho jata hai."
- [ ] **All orders**: order number / invoice number / buyer / vendor se search.
- [ ] **Support tickets**: customer ka ticket → reply bhejo, **Mark resolved**. Customer window mein reply "Justreference team" ke naam se aata hai, aur bell icon mein notification.
- [ ] **Messages** → **Team inbox**; kisi member ko message bhejo.
- [ ] **Blog → New post** → publish → `/blog` par dikhta hai. **Feedback**: public form ke submissions.
- [ ] **Coupons**: naya coupon banao, deactivate/reactivate. ⚠ Deactivate/reactivate flow browser mein dobara verify nahi hua, ek baar try kar lo.
- [ ] **Commission rules**, **Audit log** (har sensitive action ka record), **Settings** (maintenance + contact).

---

## 7. "Sab connected hai" moment (≈ 3 min)

Ek hi kahani, teen window side-by-side:

1. **Vendor** ne product banaya (Pending).
2. **Admin** ne approve kiya.
3. **Customer** ko public site par product dikha, cart → order.
4. **Vendor** ke Vendor orders mein wahi order aaya.
5. **Customer** ko invoice mila (PDF), **Admin** ne All orders mein dhundh liya.

Bolo: "Ek hi database, har role ko apna alag view, aur kaun kya dekh sakta hai wo server par enforce hota hai, sirf menu chhupa kar nahi."

---

## 7b. Bids aur Auctions (GeM jaisa), ≈ 5 min

Pehle: `npm run dev` **restart** karo (naye database tables ke baad), phir ek baar `npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/seed-demo-bids.ts` chalao (demo bids ke closing times fresh ho jate hain).

- [ ] **Public `/bids`** (header mein "Bids and auctions"): open requirements, filters (status, type, kind), countdown, bids count, max budget. Home page par "Bids closing soon" section bhi hai.
- [ ] Ek **Reverse auction** kholo (jaise "Annual IT support…"), bina login. Dikhta hai: live countdown, bids count. **Prices aur vendor names nahi dikhte.** Yahi privacy hai.
- [ ] **Vendor login** → wahi auction: "You are L2" aur current L1 total dikhta hai. Price **₹11,400** daalo (₹11,600 se kam) → turant "You are L1". Dobara bada ya same price daalo → saaf error. Min decrement (₹100) se kam drop → error.
- [ ] **Customer login → My requirements** → auction kholo: live ranking, bidders **anonymous** ("Bidder 1/2/3"), Award button nahi (bidding khuli hai). **Sealed tender** (chairs) kholo: sirf "3 bids received, offers are sealed".
- [ ] **Naya auction live banao**: Customer → My requirements → Post a requirement → "Reverse auction", closes **5-10 minute baad** → vendor se bid → doosre vendor/window se undercut. Last 5 minute mein bid karo → closing time **auto extend** hota hai (anti-sniping).
- [ ] Bidding band hone ke baad customer par **Award** aata hai (L1 sabse sasta, lekin kisi ko bhi award kar sakte ho). Vendor ko "Awarded to you" aur baaki ko "Not selected" + notification.
- [ ] **Admin → All bids**: har requirement ke saare offers vendor names ke saath (dispute/audit ke liye).

Bolne ke points: sealed tender mein offers deadline tak bandh; auction mein rank live; har bid ki price history append-only save hoti hai; do vendors ek saath bid karein to bhi rules nahi tootte.

---

## 8. Optional: Money flow (≈ 5 min)

- [ ] **Admin → E-pins → Generate e-pin** (plan: YEARLY-PRO) → pin ek hi baar dikhta hai.
- [ ] **Customer → My subscription → Redeem an e-pin** → subscription Active, expiry date ke saath.
- [ ] **Admin → Wallets** → customer ko search karo → **Credit wallet** (jaise ₹5,000, confirm dialog).
- [ ] **Customer → My wallet**: balance aur transaction history. Wallet PIN set karne ka option.
- [ ] **Payout request**: PAN + bank account chahiye, aur admin ko bank account verify karna padta hai (Admin → Wallets). Phir Admin → Payouts mein approve. ⚠ Poora payout flow is session mein end-to-end dobara nahi chalaya, pehle ek baar try kar lo.
- [ ] ⚠ **Commission** kisi order par credit hota dikhana: maine is session mein verify nahi kiya (abhi commissions 0 hain). Sirf **Commission rules** page dikhao, bina promise ke.

---

## 9. Security / quality (bolne ke liye, ≈ 2 min)

- Role-based access: vendor/customer seedha admin URL kholein to `/unauthorized` (test kiya hua hai).
- Har sensitive action audit log mein jata hai.
- Paise ka hisaab server par hota hai, rupees input se exact paise mein convert (float nahi), double-submit se bachav (idempotency).
- Security headers (CSP, HSTS, X-Frame-Options), rate limiting (production ke liye Upstash Redis chahiye).
- Maintenance mode, invoices private storage mein, signed URL se download.

---

## 10. Client ki doc ke hisaab se jo abhi nahi bana (poochne se pehle khud bolo)

TDS report, Rewards pay karna, Advertisement section, SMS inbox/outbox. (Bidding aur reverse auction ab bane hain: section 7b.) Baaki Week 1-12 ke zyadatar modules bane hue hain.

Client se ye cheezein chahiye (unki apni doc ki "Third-Party Requirements" list): MSG91/WhatsApp, Razorpay merchant account, Resend, Vercel Pro, Supabase Pro, domain connect. Inke bina OTP, email, aur payment live nahi ho sakte.

---

## 11. Demo ke baad

- Demo data hatana: `npx tsx scripts/seed-demo-catalog.ts --remove` (images bhi hatata hai) aur `npx tsx scripts/create-demo-logins.ts --remove`.
- Dobara lagana: `npx tsx scripts/seed-demo-catalog.ts`, `npx tsx scripts/seed-demo-images.ts`, `npx tsx scripts/create-demo-logins.ts`.
- Storage buckets (naye Supabase project par ek baar): `npx tsx scripts/setup-storage.ts`.

---

## Agar kuch tute

| Problem | Kya karo |
|---|---|
| Page bahut der load ho raha hai | Dev mode ka pehla compile hai. Warm-up karo, ya production build use karo. |
| Section mein "couldn't load" | Database connection timeout. Page refresh karo (data cache ho jata hai). |
| Login nahi ho raha | Email/password dobara dekho; dev server restart karo. |
| Product public site par nahi dikh raha | Admin ne approve nahi kiya, ya cache (5 min) hai. Home ke counts 5 min tak purane ho sakte hain. |
| Image nahi dikh rahi | `npx tsx scripts/seed-demo-images.ts` chalao. |
| Invoice download fail | `npx tsx scripts/setup-storage.ts` chalao, phir dobara click karo (PDF khud ban jata hai). |
| Site maintenance mein atak gayi | Super Admin login karo → Admin → Settings → maintenance off. |
