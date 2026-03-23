'use strict';

/* ─── PAGE DATA ─────────────────────────────── */
const PAGES = [
  {
    id:'pain-night', nav:'Tooth Pain Tonight', icon:'🌙',
    cardSub:'Throbbing pain keeping you awake',
    keywords:['tooth pain can\'t sleep seattle','toothache at night seattle','severe tooth pain tonight'],
    badge:'🌙 Nighttime Pain',
    h1:['Tooth pain keeping','you <em>awake tonight?</em>'],
    sub:'Nighttime tooth pain is one of the most urgent dental emergencies. The throbbing worsens when you lie down. You don\'t have to wait until morning.',
    chips:['⚡ Dentists available now','📍 Matched by zip','💬 Confirmed in minutes'],
    warnTitle:'Why nighttime tooth pain feels worse',
    warnBody:'When you lie flat, blood pressure in your head increases, amplifying throbbing pain around an inflamed nerve or abscess. This signals the situation needs attention now — not tomorrow morning.',
    list:['Pain is throbbing or pulsing and won\'t let you sleep','Pain increases when you lie down or bend forward','Painkillers stopped working or barely help','Tooth feels sensitive to hot, cold, or pressure','You notice swelling in your gum or jaw'],
    ctaH:'Stop suffering through the night.',ctaP:'We\'ll find you a dentist right now.',
    body:`<p class="content-p">Most dental offices are closed right now — but that doesn't mean you're out of options. Moxident connects you directly to dentists who have confirmed they can see emergency patients today.</p><p class="content-p">Fill out the form below. We text the nearest available dentist. First to respond claims your case. You get their name, address, and phone number immediately.</p>`,
    faqs:[
      {q:'Can a dentist actually see me tonight or early morning?',a:'Yes. Dentists in our network flag availability specifically for emergency cases. If one isn\'t available right now, the next one gets alerted automatically.'},
      {q:'Is it a real dental emergency if I can\'t sleep from the pain?',a:'Absolutely. Pain severe enough to interrupt sleep usually means the nerve is involved — either through deep decay, a cracked tooth, or infection. These worsen over time and are best treated urgently.'},
      {q:'What should I do right now while I wait?',a:'Take ibuprofen if you\'re able — it reduces inflammation better than acetaminophen for dental pain. Apply a cold pack outside the jaw. Avoid hot, cold, or sweet foods. Keep your head elevated.'},
      {q:'Do I need insurance?',a:'No. All participating dentists accept patients without insurance. You\'ll discuss payment directly with the office when you arrive.'},
    ],
  },
  {
    id:'broken-tooth', nav:'Broken Tooth', icon:'🦷',
    cardSub:'Chipped, cracked, or sharp edge',
    keywords:['broken tooth same day seattle','chipped tooth dentist today seattle','cracked tooth emergency'],
    badge:'🦷 Broken / Chipped',
    h1:['Broken tooth?','<em>Get seen today.</em>'],
    sub:'A broken or chipped tooth can cut your tongue, expose the nerve, and worsen within hours. Same-day treatment protects what\'s left.',
    chips:['⚡ Same-day appointments','🛡 Saves the tooth','📞 Dentist contacts you'],
    warnTitle:'A broken tooth can get much worse fast',
    warnBody:'Once enamel cracks, the inner dentin and nerve are exposed to bacteria, food, and temperature changes. A chip can become an infected tooth requiring root canal or extraction — often within days.',
    list:['You can feel a sharp or jagged edge with your tongue','Part of the tooth or a filling has fallen out','Tooth is sensitive to air, temperature, or biting','You can see the tooth has cracked toward the gum','Pain when you bite or chew'],
    ctaH:'The sooner you act, the better the outcome.',ctaP:'Let us find a dentist who can see you today.',
    body:`<p class="content-p">A broken tooth is a dental emergency even without severe pain. Cracks can extend deeper over hours, especially if you continue eating or the tooth gets cold or hot. The goal of same-day treatment is to seal and stabilize the tooth before damage progresses.</p><p class="content-p">Bring any tooth fragments with you — a dentist may be able to bond them back. Keep fragments moist in milk or water. Don\'t use super glue or over-the-counter cement without seeing a dentist first.</p>`,
    faqs:[
      {q:'I broke my tooth but I\'m not in pain. Is it still an emergency?',a:'Yes. Many broken teeth don\'t cause immediate pain because the nerve is protected by dentin, but they become painful as exposure continues. The crack can extend and cause a much bigger problem.'},
      {q:'Can a broken tooth be saved?',a:'Often yes, depending on how far the break extends. Minor chips can be bonded. More significant breaks may need a crown. If the crack reaches the root, extraction may be necessary — but early treatment gives you the best odds.'},
      {q:'I broke my tooth eating. Should I save the pieces?',a:'Yes. Keep the fragment in milk, saliva, or water. Don\'t let it dry out. Bring it to the dentist — bonding the original piece back is sometimes possible.'},
      {q:'What is the sharp edge cutting my tongue?',a:'That\'s exposed enamel or dentin. You can temporarily apply dental wax from a pharmacy to cushion it. This is temporary — see a dentist as soon as possible.'},
    ],
  },
  {
    id:'abscess', nav:'Abscess / Infection', icon:'🔴',
    cardSub:'Swollen jaw, fever, or throbbing pain',
    keywords:['dental abscess treatment seattle','tooth infection swollen jaw','abscess dentist today seattle'],
    badge:'🔴 Abscess / Infection',
    h1:['Swollen jaw or','<em>tooth infection?</em>'],
    sub:'A dental abscess is a serious bacterial infection. Facial swelling, fever, and throbbing pain are warning signs that need same-day attention — infections can spread rapidly.',
    chips:['🚨 Serious — act fast','💊 Antibiotics same day','📍 Nearest dentist now'],
    warnTitle:'Dental infections can become life-threatening',
    warnBody:'This is one of the few dental conditions that can become a medical emergency. An untreated abscess can spread to the jaw, neck, or airway. If you have difficulty swallowing, breathing, or swelling spreading to your neck — go to the ER immediately.',
    list:['Visible swelling in your gum, jaw, cheek, or neck','Severe throbbing pain that doesn\'t respond to painkillers','Fever or general feeling of illness','A pimple-like bump on the gum that may be draining','Pain that has been building for several days'],
    ctaH:'Infections don\'t wait. Neither should you.',ctaP:'Connect with a dentist in your area right now.',
    body:`<p class="content-p">A dental abscess is a pocket of pus caused by a bacterial infection inside the tooth, in the gum, or in surrounding bone. It can come from deep decay, a cracked tooth, or gum disease. It will not resolve on its own — it requires treatment.</p><p class="content-p">Treatment typically involves draining the abscess, prescribing antibiotics, and addressing the source — either root canal therapy or extraction. The sooner you're seen, the more options you have.</p>`,
    faqs:[
      {q:'Can I treat a dental abscess at home?',a:'No. You can manage pain with ibuprofen and use warm salt water rinses, but these do not treat the infection. Antibiotics from a dentist are required, and the source of infection must be addressed dentally.'},
      {q:'When should I go to the ER instead of a dentist?',a:'Go to the ER immediately if you have difficulty breathing or swallowing, swelling spreading to your neck or floor of mouth, high fever (above 101°F), confusion or extreme fatigue, or eye swelling.'},
      {q:'My abscess burst on its own. Am I okay?',a:'The pain may reduce, but the infection is not resolved. Spontaneous rupture means you still need antibiotics and dental treatment to remove the source of infection.'},
      {q:'Will I need a root canal?',a:'Often yes, if the infection originated inside the tooth. However the dentist will assess whether the tooth is salvageable. Sometimes extraction followed by an implant is recommended.'},
    ],
  },
  {
    id:'knocked-out', nav:'Tooth Knocked Out', icon:'⚠️',
    cardSub:'Act within 30 minutes to save it',
    keywords:['tooth knocked out emergency seattle','avulsed tooth dentist','tooth fell out adult'],
    badge:'⚠️ Knocked Out',
    h1:['Tooth knocked out?','<em>You have 30 minutes.</em>'],
    sub:'A knocked-out permanent tooth can be reimplanted — but only if you act within 30 to 60 minutes. Time is the most critical factor. Get to a dentist now.',
    chips:['🕐 30-min window','🏃 Move fast','🦷 Can be saved'],
    warnTitle:'Act within 30 minutes for best chance of saving the tooth',
    warnBody:'The cells on the root surface die quickly once the tooth dries. Reimplantation within 30 minutes has the highest success rate. After 60 minutes, chances drop significantly. Keep the tooth moist in milk, saliva, or saline — never tap water.',
    list:['The entire tooth — root and crown — came out of the socket','The socket is bleeding','You still have the tooth and it is intact','The tooth is a permanent (adult) tooth, not a baby tooth'],
    ctaH:'Every minute matters. Find a dentist now.',ctaP:'We\'ll alert the nearest available dentist immediately.',
    body:`<p class="content-p"><strong>What to do right now:</strong> Handle the tooth by the crown (white part), never the root. If dirty, gently rinse with milk or water — do not scrub. Try to place it back in the socket and bite down gently on a cloth. If not, store it in milk or hold it between your cheek and gum.</p><p class="content-p"><strong>Baby teeth vs adult teeth:</strong> Do not reimplant a knocked-out baby tooth — this can damage the developing adult tooth underneath. For adult teeth, every minute getting to a dentist matters.</p>`,
    faqs:[
      {q:'Should I try to put the tooth back in myself?',a:'If it\'s a permanent tooth and it\'s clean, yes — gently. Place it in the socket and bite down softly on a cloth. This is the best way to preserve the root cells. If you can\'t, store it in milk.'},
      {q:'What if I can\'t find a dentist fast enough?',a:'Go to an urgent care clinic or hospital ER. They can store the tooth in a solution and consult with an on-call dentist. The ER is the right choice if no dentist is reachable within 30 minutes.'},
      {q:'The tooth is a baby tooth. What should I do?',a:'Do not reimplant a baby tooth — this risks damage to the adult tooth beneath. Control bleeding with gentle pressure, then see a dentist to assess the socket and surrounding area.'},
      {q:'Can an implant replace a tooth that can\'t be saved?',a:'Yes. If the tooth cannot be reimplanted successfully, a dental implant is the standard-of-care replacement. This takes several months but results in a permanent, natural-feeling tooth.'},
    ],
  },
  {
    id:'lost-filling', nav:'Lost Filling / Crown', icon:'🔧',
    cardSub:'Filling fell out or crown came off',
    keywords:['lost filling dentist today seattle','crown fell off same day','filling fell out what to do'],
    badge:'🔧 Lost Filling / Crown',
    h1:['Filling or crown','<em>fell out?</em>'],
    sub:'A missing filling or crown exposes your tooth to bacteria, pressure, and pain. Same-day repair prevents infection and avoids a much more expensive fix later.',
    chips:['🦷 Protect the tooth','💊 Prevent infection','⚡ Same-day repair'],
    warnTitle:'Don\'t leave a tooth exposed for long',
    warnBody:'When a filling or crown is missing, the exposed tooth structure is soft and vulnerable, collecting bacteria with every meal. Decay progresses rapidly in exposed dentin. A simple re-cement today could prevent a root canal or extraction tomorrow.',
    list:['You felt something come out while eating','You can feel a hole or rough edge where the filling was','Your crown has come off and you can see the tooth stub','The exposed tooth is sensitive to temperature or sweets','You still have the crown and it appears intact'],
    ctaH:'Don\'t wait for the pain to get worse.',ctaP:'Get the tooth covered today.',
    body:`<p class="content-p">If your crown came off intact, keep it. A dentist can often re-cement it the same day — a quick and inexpensive fix. Do not try to glue it back yourself with super glue. This can trap bacteria and make removal difficult for the dentist.</p><p class="content-p">If a filling fell out, you can buy temporary dental cement at a pharmacy as a short-term measure. However this is a temporary fix only — you still need to see a dentist as soon as possible.</p>`,
    faqs:[
      {q:'I still have the crown. Can the dentist put it back?',a:'Often yes. If the crown is undamaged and the underlying tooth structure is intact, re-cementation is a straightforward procedure. Bring the crown with you in a small bag or container.'},
      {q:'Can I use super glue or dental cement from the pharmacy?',a:'Pharmacy temporary cement (like Dentemp) is acceptable for short-term protection of a lost filling. Do not use super glue — it bonds too permanently and makes the dentist\'s job much harder.'},
      {q:'Why did my filling or crown fall out?',a:'Common causes include decay forming underneath the restoration, biting on hard food, grinding, or the cement reaching the end of its lifespan. A new, well-fitting restoration will be placed after the dentist assesses the tooth.'},
      {q:'How much does it cost to replace a lost filling?',a:'A simple filling replacement can range from $100–$300 depending on size and material. If the underlying tooth has decayed significantly, a crown may be needed ($800–$2,000). Seeing the dentist early usually means a simpler, cheaper fix.'},
    ],
  },
  {
    id:'wisdom-tooth', nav:'Wisdom Tooth Pain', icon:'😣',
    cardSub:'Impacted or infected, spreading pain',
    keywords:['wisdom tooth pain relief seattle','impacted wisdom tooth dentist','wisdom tooth swollen gum'],
    badge:'😣 Wisdom Tooth',
    h1:['Wisdom tooth pain','<em>that won\'t stop?</em>'],
    sub:'Impacted or infected wisdom teeth cause some of the most intense dental pain. Swollen gum, pain spreading to your jaw or ear — you need to be seen today.',
    chips:['😮‍💨 Intense pain relief','🦷 Extraction or treatment','📍 Local dentist now'],
    warnTitle:'Infected wisdom teeth can spread to the throat',
    warnBody:'Pericoronitis — infection of the gum flap over an erupting wisdom tooth — can spread rapidly to the throat and neck. If you have difficulty opening your mouth, swallowing, or notice swelling below the jaw, seek emergency care immediately.',
    list:['Pain in the back of the jaw that has been worsening for days','Swollen, red, or tender gum tissue behind your last molar','Pain spreading to the ear, temple, or neck on the same side','Bad taste or smell in the back of your mouth','Difficulty fully opening your mouth'],
    ctaH:'Wisdom tooth pain doesn\'t resolve on its own.',ctaP:'Get relief — find a dentist available now.',
    body:`<p class="content-p">Wisdom tooth pain has two main causes: the tooth is impacted (blocked from fully erupting), or the gum tissue over the partially erupted tooth has become infected. Both require dental attention — pain management alone is not a solution.</p><p class="content-p">A dentist can take an X-ray, assess whether extraction is needed, prescribe antibiotics if there\'s infection, and manage your pain immediately. Many extractions can be done the same day; complex cases may need a referral to an oral surgeon.</p>`,
    faqs:[
      {q:'Can wisdom tooth pain go away on its own?',a:'Sometimes temporarily, but the underlying cause — impaction or infection — does not resolve without treatment. Recurring episodes of pain typically get worse each time.'},
      {q:'Do all wisdom teeth need to be removed?',a:'Not always. Fully erupted, properly aligned wisdom teeth that are easy to clean can stay. However, if they\'re impacted, causing recurrent pain or infection, or damaging adjacent teeth, removal is recommended.'},
      {q:'Can I get antibiotics without getting the tooth removed?',a:'A dentist can prescribe antibiotics for an active infection, but this is temporary relief. The antibiotics treat the infection, not the cause. Extraction or other definitive treatment is almost always eventually necessary.'},
      {q:'How long does wisdom tooth extraction recovery take?',a:'Most people recover in 3–5 days for simple extractions. Impacted extractions involving bone removal take 7–10 days. Swelling peaks around day 2–3. You\'ll be on soft foods for about a week.'},
    ],
  },
  {
    id:'bleeding', nav:'Dental Bleeding', icon:'🩸',
    cardSub:'Won\'t stop after extraction or injury',
    keywords:['tooth bleeding won\'t stop seattle','gum bleeding emergency','dental bleeding after extraction'],
    badge:'🩸 Bleeding Emergency',
    h1:['Dental bleeding','<em>that won\'t stop?</em>'],
    sub:'Bleeding after extraction or trauma that doesn\'t stop with pressure within 15–20 minutes is a dental emergency. Consistent pressure and prompt treatment are essential.',
    chips:['🩸 Act immediately','⏱ 15-min pressure test','🏥 Dentist on call'],
    warnTitle:'What to do right now while you find a dentist',
    warnBody:'Fold a clean gauze pad into a thick square. Place it directly over the bleeding site and bite down firmly — maintain continuous pressure for 15–20 minutes without checking. Do not rinse, spit, or use a straw. If bleeding continues after this, seek care immediately.',
    list:['You had a tooth extracted and bleeding hasn\'t stopped after an hour','You have a cut inside the mouth that won\'t clot','Blood is pooling faster than it clots','You can taste or see heavy, continuous blood flow','The extraction site is losing its blood clot'],
    ctaH:'Persistent dental bleeding needs professional attention.',ctaP:'Find a dentist available to help you right now.',
    body:`<p class="content-p">Some bleeding after dental work or oral injury is normal. Heavy, sustained bleeding that does not respond to 20 minutes of firm direct pressure is not. Common causes include a dislodged clot (dry socket risk), torn gum tissue, or a vessel requiring direct treatment.</p><p class="content-p">Avoid aspirin for pain management if you\'re bleeding — it thins the blood. Use ibuprofen or acetaminophen instead. Do not rinse vigorously, smoke, or use a straw — all disrupt clot formation.</p>`,
    faqs:[
      {q:'Is it normal to bleed a lot after a tooth extraction?',a:'Some bleeding is expected for the first hour. Bleeding that soaks through multiple gauze pads within 30–45 minutes, or continues beyond 2–3 hours with consistent pressure, is not normal and needs professional attention.'},
      {q:'What is a dry socket?',a:'Dry socket (alveolar osteitis) occurs when the blood clot in the extraction site is dislodged or dissolves before healing. It causes severe throbbing pain and an empty-looking socket. It is treated by the dentist placing a medicated dressing.'},
      {q:'Should I go to the ER for dental bleeding?',a:'If you cannot get to a dentist and bleeding is severe or won\'t stop with 20+ minutes of firm pressure, yes. The ER can pack the wound and contact an on-call dentist or oral surgeon.'},
      {q:'I\'m on blood thinners. Is my situation more serious?',a:'Yes. Blood thinners significantly complicate clotting after dental work. Alert the dentist immediately. Do not stop your blood thinner medication without consulting your physician.'},
    ],
  },
  {
    id:'swollen-gum', nav:'Swollen Gum', icon:'💢',
    cardSub:'Painful bump, redness, or swelling',
    keywords:['swollen gum dentist today seattle','gum swelling urgent seattle','gum abscess same day'],
    badge:'💢 Swollen Gum',
    h1:['Swollen gum or','<em>painful bump?</em>'],
    sub:'A swollen gum can mean infection, an abscess, or gum disease that\'s progressed to an acute stage. Painful, spreading, or has a visible bump — you need to be seen today.',
    chips:['💊 Antibiotics today','🔬 Identify the cause','📍 Local dentist now'],
    warnTitle:'Gum infections spread without treatment',
    warnBody:'A localized gum infection (periodontal abscess) can spread to surrounding teeth and bone. Left untreated, you risk losing otherwise healthy teeth near the infection site, and in rare cases the infection can become systemic.',
    list:['One area of gum is visibly swollen, red, and tender to touch','White or yellowish bump on the gum that may be draining','Pain when you bite or press on the gum','The swelling has been growing over the past few days','Bad taste or smell from the area'],
    ctaH:'Swollen gums don\'t heal without treatment.',ctaP:'Get matched to a dentist who can see you today.',
    body:`<p class="content-p">Gum swelling can originate from two sources: a problem inside the tooth (abscess draining through the gum), or a problem within the gum and bone itself (periodontal abscess). Both require professional treatment — a dentist will take an X-ray to determine the source and recommend treatment.</p><p class="content-p">In the meantime, rinse gently with warm salt water (1/2 tsp salt in 8 oz warm water) to keep the area clean. Avoid poking or squeezing the bump. Take ibuprofen for pain and inflammation if you have no contraindications.</p>`,
    faqs:[
      {q:'The bump on my gum is draining. Is that good or bad?',a:'A draining abscess actually reduces acute pressure and pain, but it does NOT mean the infection is clearing. The body is creating a drainage pathway because the infection has nowhere else to go. Treatment is still required.'},
      {q:'Can gum swelling be caused by something other than infection?',a:'Yes. Hormonal changes, irritation from a new restoration, food impaction, or certain medications can cause gum swelling that isn\'t infection. A dentist will determine the cause and appropriate treatment.'},
      {q:'Will I need gum surgery?',a:'Probably not for a single-tooth abscess. Simple drainage and antibiotics handle most cases. If the infection involves significant bone loss, a deeper cleaning or periodontal procedure may be recommended after the acute phase resolves.'},
      {q:'Can swollen gums go away on their own?',a:'Minor irritation-related swelling may improve with improved oral hygiene. Infection-related swelling will not resolve without antibiotics and dental treatment. If swelling has been present for more than 2 days or is increasing, see a dentist.'},
    ],
  },
];

/* ─── TRACKING ──────────────────────────────── */
const TK = 'mx_track_v1';

function getTrack() {
  try { return JSON.parse(localStorage.getItem(TK)) || {}; } catch(e) { return {}; }
}

function saveTrack(d) {
  try { localStorage.setItem(TK, JSON.stringify(d)); } catch(e) {}
}

function trackView(id) {
  const d = getTrack();
  if (!d[id]) d[id] = {v: 0, s: 0};
  d[id].v++;
  saveTrack(d);
}

function trackSubmit(id) {
  const d = getTrack();
  if (!d[id]) d[id] = {v: 0, s: 0};
  d[id].s++;
  saveTrack(d);
}

function resetTracking() {
  if (confirm('Reset all tracking data?')) {
    localStorage.removeItem(TK);
    renderDash();
  }
}

/* ─── STATE ─────────────────────────────────── */
let currentView = 'home';
let currentPage = null;

/* ─── NAVIGATION ─────────────────────────────── */
const VIEWS = ['home', 'symptom', 'intake', 'early','fallback','dashboard'];

function show(id, pageId) {
  VIEWS.forEach(v => document.getElementById('view-' + v).classList.add('hidden'));
  document.getElementById('view-' + id).classList.remove('hidden');
  currentView = id;
  closeDrawer();
  window.scrollTo({top: 0, behavior: 'smooth'});
  updateNavState(pageId || null);
  if (id === 'symptom' && pageId) { renderSymptom(pageId); trackView(pageId); }
  if (id === 'dashboard') renderDash();
}

function updateNavState(activePageId) {
  document.querySelectorAll('.nav-pill').forEach(el => {
    el.classList.toggle('active', el.dataset.id === activePageId);
  });
  document.querySelectorAll('.drawer-pill[data-id]').forEach(el => {
    el.classList.toggle('active', el.dataset.id === activePageId);
  });
}

/* ─── HAMBURGER ─────────────────────────────── */
function toggleDrawer() {
  const d = document.getElementById('nav-drawer');
  const h = document.getElementById('hamburger');
  const open = d.classList.toggle('open');
  h.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

function closeDrawer() {
  document.getElementById('nav-drawer').classList.remove('open');
  document.getElementById('hamburger').classList.remove('open');
  document.body.style.overflow = '';
}

/* ─── BUILD NAV ─────────────────────────────── */
function buildNav() {
  const pills  = document.getElementById('nav-pills');
  const drawer = document.getElementById('drawer-pills');
  pills.innerHTML = PAGES.map(p =>
    `<button class="nav-pill" data-id="${p.id}" onclick="show('symptom','${p.id}')">${p.nav}</button>`
  ).join('');
  drawer.innerHTML = PAGES.map(p =>
    `<button class="drawer-pill" data-id="${p.id}" onclick="show('symptom','${p.id}');closeDrawer()">${p.icon} ${p.nav}</button>`
  ).join('');
}

/* ─── LANDING SYMPTOM CARDS ─────────────────── */
function buildSymptomGrid() {
  document.getElementById('symptom-grid-home').innerHTML = PAGES.map(p => `
    <div class="symptom-card" onclick="show('symptom','${p.id}')">
      <div class="symptom-card-icon">${p.icon}</div>
      <div class="symptom-card-title">${p.nav}</div>
      <div class="symptom-card-sub">${p.cardSub}</div>
    </div>
  `).join('');
}

/* ─── RENDER SYMPTOM PAGE ────────────────────── */
function renderSymptom(id) {
  const p = PAGES.find(x => x.id === id);
  if (!p) return;
  currentPage = id;

  const html = `
    <div class="sym-hero">
      <div class="sym-badge a1"><div class="sym-badge-dot"></div>${p.badge}</div>
      <h1 class="sym-h1 a2">${p.h1.map(l => l + '<br>').join('')}</h1>
      <p class="sym-sub a3">${p.sub}</p>
      <div class="chips a4">${p.chips.map(c => `<div class="chip">${c}</div>`).join('')}</div>
    </div>

    <div class="warn-card">
      <div class="warn-title">⚠️ ${p.warnTitle}</div>
      <div class="warn-body">${p.warnBody}</div>
    </div>

    <div class="content-block">
      <div class="content-label">Signs this is your situation</div>
      <ul class="check-list">${p.list.map(i => `<li>${i}</li>`).join('')}</ul>
    </div>

    <div class="mid-cta">
      <div class="mid-cta-text">
        <h3>${p.ctaH}</h3>
        <p>${p.ctaP}</p>
      </div>
      <button class="mid-cta-btn" onclick="scrollToSymForm()">Find a Dentist Now →</button>
    </div>

    <div class="content-block">
      <div class="content-h2">What you need to know</div>
      ${p.body}
    </div>

    <div class="content-block">
      <div class="content-label">Common questions</div>
      <div class="content-h2">What patients ask us</div>
      ${p.faqs.map((f, i) => `
        <div class="faq-item" id="faq-${i}">
          <button class="faq-q" onclick="toggleFaq(${i})">
            ${f.q}<span class="faq-icon">+</span>
          </button>
          <div class="faq-a">${f.a}</div>
        </div>
      `).join('')}
    </div>

    <div class="sym-form-section" id="sym-form-anchor">
      <div class="sym-form-title">Get matched to a dentist now.</div>
      <div class="sym-form-sub">Fill this out. We text the nearest available dentist. First to confirm gets your case.</div>
      <form novalidate>
        <div class="f-row">
          <div class="fg" id="sfg-name-${id}">
            <label class="fl">Full Name <span class="fl-req">*</span></label>
            <input class="fi" id="sf-name-${id}" type="text" placeholder="Jane Smith" autocomplete="name"/>
            <span class="f-err">Please enter your name</span>
          </div>
          <div class="fg" id="sfg-phone-${id}">
            <label class="fl">Phone <span class="fl-req">*</span></label>
            <input class="fi" id="sf-phone-${id}" type="tel" placeholder="(555) 000-0000" autocomplete="tel"/>
            <span class="f-err">Enter a valid phone number</span>
          </div>
        </div>
        <div class="fg" id="sfg-zip-${id}">
          <label class="fl">Zip Code <span class="fl-req">*</span></label>
          <input class="fi" id="sf-zip-${id}" type="text" placeholder="e.g. 98101" inputmode="numeric" maxlength="5"/>
          <span class="f-err">Enter a valid 5-digit zip</span>
        </div>
        <input type="hidden" value="${p.nav}"/>
        <div class="fg" id="sfg-consent-${id}">
          <label class="consent-label">
            <input class="consent-checkbox" type="checkbox" id="sf-consent-${id}"/>
            <span>I agree to receive SMS messages from Moxident about my dental request. Message and data rates may apply. Reply STOP to opt out. See our <a class="consent-link" href="/privacy-policy">Privacy Policy</a>.</span>
          </label>
          <span class="f-err">You must agree to receive SMS to continue</span>
        </div>
        <button type="button" class="submit-btn" onclick="handleSymSubmit('${id}','${p.nav}')">Request Emergency Appointment →</button>
        <p class="form-disclaimer">Free to patients · No insurance required · One SMS confirmation only</p>
      </form>
    </div>
  `;

  document.getElementById('symptom-content').innerHTML = html;

  ['name', 'phone', 'zip'].forEach(f => {
    const el = document.getElementById(`sf-${f}-${id}`);
    if (el) el.addEventListener('input', () => document.getElementById(`sfg-${f}-${id}`)?.classList.remove('err'));
  });

  const consentEl = document.getElementById(`sf-consent-${id}`);
  if (consentEl) {
    consentEl.addEventListener('change', () => document.getElementById(`sfg-consent-${id}`)?.classList.remove('err'));
  }
}

/* ─── HELPERS ────────────────────────────────── */
function normalizePhone(val) {
  const digits = val.replace(/\D/g, '');
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

function scrollToSymForm() {
  document.getElementById('sym-form-anchor')?.scrollIntoView({behavior: 'smooth', block: 'start'});
}

function toggleFaq(i) {
  document.getElementById(`faq-${i}`)?.classList.toggle('open');
}

/* ─── FORM VALIDATION ─────────────────────── */
function validate(fields) {
  let ok = true;
  fields.forEach(({el, fg, test}) => {
    const fg_el = document.getElementById(fg);
    if (!fg_el) return;
    if (!test(el.value)) { fg_el.classList.add('err'); ok = false; }
    else fg_el.classList.remove('err');
  });
  return ok;
}

/* ─── SYMPTOM FORM SUBMIT ─────────────────── */
async function handleSymSubmit(pageId, symptomLabel) {
  const name    = document.getElementById(`sf-name-${pageId}`);
  const phone   = document.getElementById(`sf-phone-${pageId}`);
  const zip     = document.getElementById(`sf-zip-${pageId}`);
  const consent = document.getElementById(`sf-consent-${pageId}`);

  const fieldsOk = validate([
    {el: name,  fg: `sfg-name-${pageId}`,  test: v => v.trim().length >= 2},
    {el: phone, fg: `sfg-phone-${pageId}`, test: v => /[\d\s\-\(\)]{7,}/.test(v)},
    {el: zip,   fg: `sfg-zip-${pageId}`,   test: v => /^\d{5}$/.test(v.trim())},
  ]);

  const consentFg = document.getElementById(`sfg-consent-${pageId}`);
  const consentOk = consent && consent.checked;
  if (!consentOk) consentFg?.classList.add('err');
  else consentFg?.classList.remove('err');

  if (!fieldsOk || !consentOk) {
    document.querySelector('.fg.err')?.scrollIntoView({behavior: 'smooth', block: 'center'});
    return;
  }

  const btn = document.querySelector('#sym-form-anchor .submit-btn');
  btn.textContent = 'Finding a dentist…';
  btn.disabled = true;

  try {
    const res = await fetch('https://7i7j7c8rx7.execute-api.us-east-2.amazonaws.com/prod/submit', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        name:    name.value.trim(),
        phone:   normalizePhone(phone.value),
        zip:     zip.value.trim(),
        symptom: symptomLabel,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    trackSubmit(pageId);
    gtag('event', 'conversion', {'send_to': 'AW-17976922373', 'value': 50, 'currency': 'USD'});
    showConfirmed(zip.value.trim(), data.dentistFound);
  } catch (err) {
    btn.textContent = 'Request Emergency Appointment →';
    btn.disabled = false;
    alert('Something went wrong. Please try again.');
  }
}

/* ─── MAIN INTAKE FORM SUBMIT ─────────────── */
async function handleMainSubmit() {
  const name    = document.getElementById('mf-name');
  const phone   = document.getElementById('mf-phone');
  const zip     = document.getElementById('mf-zip');
  const symptom = document.getElementById('mf-symptom');
  const consent = document.getElementById('mf-consent');

  const fieldsOk = validate([
    {el: name,    fg: 'mfg-name',    test: v => v.trim().length >= 2},
    {el: phone,   fg: 'mfg-phone',   test: v => /[\d\s\-\(\)]{7,}/.test(v)},
    {el: zip,     fg: 'mfg-zip',     test: v => /^\d{5}$/.test(v.trim())},
    {el: symptom, fg: 'mfg-symptom', test: v => v !== ''},
  ]);

  const consentFg = document.getElementById('mfg-consent');
  const consentOk = consent && consent.checked;
  if (!consentOk) consentFg?.classList.add('err');
  else consentFg?.classList.remove('err');

  if (!fieldsOk || !consentOk) {
    document.querySelector('#view-intake .fg.err')?.scrollIntoView({behavior: 'smooth', block: 'center'});
    return;
  }

  const btn = document.querySelector('#view-intake .submit-btn');
  btn.textContent = 'Finding a dentist…';
  btn.disabled = true;

  try {
    const res = await fetch('https://7i7j7c8rx7.execute-api.us-east-2.amazonaws.com/prod/submit', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        name:    name.value.trim(),
        phone:   normalizePhone(phone.value),
        zip:     zip.value.trim(),
        symptom: symptom.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    trackSubmit('main');
    gtag('event', 'conversion', {'send_to': 'AW-17976922373', 'value': 50, 'currency': 'USD'});
    showConfirmed(document.getElementById('mf-zip').value.trim(), data.dentistFound);
  } catch (err) {
    btn.textContent = 'Request Emergency Appointment →';
    btn.disabled = false;
    alert('Something went wrong. Please try again.');
  }
}

/* ─── CONFIRMATION VIEW ──────────────────── */
function showConfirmed(zip, dentistFound) {
  if (dentistFound) {
    document.getElementById('early-zip-display').textContent = zip || '—';
    const msg = document.getElementById('early-msg');
    if (msg) {
      msg.innerHTML = `We're finding the fastest available dentist near (<span class="early-zip">${zip}</span>). <strong>You'll receive an SMS confirmation shortly.</strong>`;
    }
    show('early');
  } else {
    document.getElementById('fallback-zip-display').textContent = zip || '—';
    show('fallback');
  }
}
async function submitFallback() {
  const email = document.getElementById('fallback-email');
  const time  = document.getElementById('fallback-time');
  const fg    = document.getElementById('fg-fallback-email');

  if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    fg.classList.add('err');
    return;
  }
  fg.classList.remove('err');

  const btn = document.querySelector('#view-fallback .submit-btn');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  try {
    await fetch('https://7i7j7c8rx7.execute-api.us-east-2.amazonaws.com/prod/waitlist', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email:         email.value.trim(),
        preferredTime: time.value,
        zip:           document.getElementById('fallback-zip-display').textContent,
      }),
    });
  } catch(e) {}

  document.querySelector('#view-fallback .early-card').innerHTML = `
    <div class="early-icon">✓</div>
    <div class="early-title">Got it.</div>
    <div class="early-msg">We'll reach out to <strong>${email.value.trim()}</strong> within 24 hours.</div>
    <div class="early-divider"></div>
    <button class="early-restart" onclick="resetFlow()">← Submit another request</button>
  `;
}
/* ─── RESET FLOW ─────────────────────────── */
function resetFlow() {
  document.getElementById('main-intake-form')?.reset();
  show('home');
}

/* ─── DASHBOARD ─────────────────────────────── */
function renderDash() {
  const data = getTrack();
  let tv = 0, ts = 0;
  PAGES.forEach(p => { const d = data[p.id] || {v: 0, s: 0}; tv += d.v; ts += d.s; });
  const bcvr = tv > 0 ? ((ts / tv) * 100).toFixed(1) : '0.0';
  const bcpe = ts > 0 ? Math.round(50 / (parseFloat(bcvr) / 100)) : '—';

  document.getElementById('kpi-row').innerHTML = [
    {val: tv,                          lbl: 'Total Page Views', sub: 'All symptom pages'},
    {val: ts,                          lbl: 'Form Submits',     sub: 'Completed leads'},
    {val: bcvr + '%',                  lbl: 'Blended CVR',      sub: 'Target: 10%+'},
    {val: bcpe === '—' ? '—' : '$' + bcpe, lbl: 'Est. CPE',    sub: 'Target: < $50'},
  ].map(k => `
    <div class="kpi-card">
      <div class="kpi-val">${k.val}</div>
      <div class="kpi-lbl">${k.lbl}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>
  `).join('');

  document.getElementById('dash-tbody').innerHTML = PAGES.map(p => {
    const d = data[p.id] || {v: 0, s: 0};
    const cvr = d.v > 0 ? ((d.s / d.v) * 100).toFixed(1) : 0;
    const n = parseFloat(cvr);
    const fillColor = n >= 10 ? 'var(--grn)' : n >= 5 ? 'var(--amb)' : 'var(--red)';
    const bdg = n >= 10 ? 'bdg-grn' : n >= 5 ? 'bdg-amb' : 'bdg-red';
    const bdgLbl = n >= 10 ? '✓ Strong' : n >= 5 ? '~ Watch' : d.v === 0 ? '○ No data' : '↓ Low';
    const kws = p.keywords.map(k => `<span class="kw-tag">${k}</span>`).join('');
    return `<tr>
      <td>
        <div class="td-main" onclick="show('symptom','${p.id}')">${p.icon} ${p.nav}</div>
      </td>
      <td><div class="td-kws">${kws}</div></td>
      <td>${d.v}</td>
      <td>${d.s}</td>
      <td>
        <div class="bar-wrap">
          <div class="bar-bg"><div class="bar-fill" style="width:${Math.min(n * 5, 100)}%;background:${fillColor}"></div></div>
          <span class="bar-pct">${cvr}%</span>
        </div>
      </td>
      <td><span class="bdg ${bdg}">${bdgLbl}</span></td>
    </tr>`;
  }).join('');
}

/* ─── INIT ──────────────────────────────────── */
buildNav();
buildSymptomGrid();
show('home');
