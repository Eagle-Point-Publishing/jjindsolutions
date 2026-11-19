/* Sage: J&J Industrial Solutions site assistant.
   Chat runs on the EPP Paul product gateway with a per-site public key and
   origin allowlist; voice opens the same Sage receptionist phone line so a
   qualified caller can be transferred to an owner. */
(function () {
  'use strict';

  var API = 'https://api.eaglepointpublishing.com';
  var SITE = 'jjindsolutions';
  var CONVERSATION_ID = SITE + '-' + ((window.crypto && typeof window.crypto.randomUUID === 'function')
    ? window.crypto.randomUUID()
    : (Date.now() + '-' + Math.random().toString(36).slice(2)));
  var CONVERSATION_STARTED_AT = new Date().toISOString();
  var PUBLIC_KEY = '7Mt3TgoDFT0rWkPr-b4XfSsBJh6dqNBS';
  var PHONE_DISPLAY = '(208) 933-8564';
  var PHONE_TEL = '+12089338564';
  var CONTACT_SESSION_KEY = 'jj_industrial_solutions_sage_contact_v1';
  var ABANDONMENT_IDLE_MS = 15 * 60 * 1000;
  var ABANDONMENT_CHECK_MS = 30 * 1000;

  function qualifiesForAutomatedAbandonment(state) {
    return !state.hidden && !state.partial && !state.completed &&
      state.intakeStarted && Boolean(state.email || state.phone) &&
      state.inactiveMs >= ABANDONMENT_IDLE_MS;
  }

  window.SageAbandonment = Object.freeze({
    idleMs: ABANDONMENT_IDLE_MS,
    qualifies: qualifiesForAutomatedAbandonment,
  });

  var SUMMARY =
    'J&J Industrial Solutions is an industrial maintenance and shutdown support contractor headquartered in Twin Falls, Idaho, serving Idaho and Alaska with mobile, journeyman-led crews. The public site is https://jjindsolutions.com. ' +
    'SERVICES: Focused equipment inspection support, maintenance visits for repair backlogs, and supplemental mechanical help for plant teams. Scope and availability are confirmed before scheduling. Call or request a quote for any job. Shutdown and turnaround support (planned and emergency outage crews, conveyor, crusher, screen, feeder and process equipment work, production recovery). Industrial mechanical maintenance (preventive and corrective programs, equipment installation, alignment, commissioning, hydraulic and pneumatic troubleshooting, embedded on-site maintenance crews). Reliability and rotating equipment (pumps, compressors, gearboxes, mechanical maintenance and repair, ROTALIGN Ultra precision laser alignment). Conveyors and material handling (repair and full rebuilds, potato, grain, crop, packaging, mill and process equipment). Field welding and fabrication (mobile welding rigs and service trucks, structural repairs, custom fabrication, HDPE fusion and piping to ASTM F2620). Specialty services (NDT including magnetic particle and penetrant testing, pipe thickness and tank mapping, HYTORC precision torque, capital project bidding and installs). ' +
    'SECTORS: surface and underground mining in Idaho and Alaska; food and agricultural processing (dairy, nutritional, potato, grain) in southern Idaho; lumber and heavy industrial across the region. ' +
    'CREDENTIALS: ISNetworld member contractor (ISN-400-817607); crews carry MSHA and industrial facility experience. ' +
    'QUOTES: Do not state dollar amounts, hourly charges, daily equipment charges, overtime multipliers, markups, or travel allowances. Do not state a required number of hours. Nothing like that is published. Invite the visitor to call or request a quote. A quote comes from an owner callback after the visitor shares the location, equipment, issue, and preferred work window. ' +
    'CONTACT: phone ' + PHONE_DISPLAY + ', email levi@jjindsolutions.com. Never invent availability, project history or certifications beyond the above. An owner follows up on every request.';

  function loadContactState() {
    try {
      var saved = JSON.parse(window.sessionStorage.getItem(CONTACT_SESSION_KEY) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch (_) { return {}; }
  }

  function persistContactState() {
    try {
      window.sessionStorage.setItem(CONTACT_SESSION_KEY, JSON.stringify({
        dismissed: contactGateDismissed,
        contact: visitorContact,
      }));
    } catch (_) {}
  }

  var restoredContactState = loadContactState();
  var history = [];
  var transcript = [];
  var leadSubmissionState = { partial: false, completed: false };
  var leadSubmissionInFlight = { partial: null, completed: null };
  var lastActivity = Date.now();
  var callback = null; // {step, name, company, phone}
  var chatStarted = false;
  var visitorContact = restoredContactState.contact || { name: '', email: '', phone: '' };
  var contactGateComplete = Boolean(visitorContact.name && (visitorContact.email || visitorContact.phone));
  var contactGateDismissed = Boolean(restoredContactState.dismissed && !contactGateComplete);
  var pendingCallbackRequest = '';

  function isSpecificRequest(text) {
    var value = String(text || '').toLowerCase();
    if (/\b(call me|contact me|have (?:someone|an owner) call|speak (?:to|with)|talk (?:to|with)|request (?:a )?(?:call|quote|estimate)|need (?:a )?quote|send (?:someone|a crew))\b/.test(value)) return true;
    return /\b(?:i|we|our (?:company|facility|plant|mine|mill))\b.{0,55}\b(?:need|want|are looking for|would like|have)\b.{0,80}\b(?:repair|maintenance|shutdown|outage|breakdown|millwright|welding|fabrication|alignment|conveyor|equipment|crew|contractor|project|hdpe|fusion)\b/.test(value);
  }

  function track(eventName, parameters) {
    if (typeof window.eppTrack === 'function') window.eppTrack(eventName, parameters);
  }

  function injectCss() {
    var style = document.createElement('style');
    style.textContent = '' +
      '#sage-launch{position:fixed;right:24px;top:50%;bottom:auto;z-index:200;display:flex;align-items:center;gap:11px;background:#f0731f;color:#fff;font:700 17px Inter,system-ui,sans-serif;border:0;border-radius:999px;padding:18px 26px;box-shadow:0 16px 40px -14px rgba(240,115,31,.9);cursor:pointer;transform:translateY(-50%);transition:transform .18s ease,box-shadow .18s ease}' +
      '#sage-launch:hover{transform:translateY(-50%) scale(1.04);box-shadow:0 18px 44px -12px rgba(240,115,31,.95)}' +
      '#sage-launch .dot{width:9px;height:9px;border-radius:50%;background:#fff}' +
      '#sage-panel{position:fixed;right:22px;bottom:22px;z-index:201;width:min(392px,calc(100vw - 30px));height:min(600px,calc(100vh - 44px));display:none;flex-direction:column;overflow:hidden;background:#14161a;border:1px solid rgba(240,115,31,.4);border-radius:12px;box-shadow:0 40px 90px -34px rgba(0,0,0,.85);font-family:Inter,system-ui,sans-serif}' +
      '#sage-panel.open{display:flex}#sage-panel .hd{display:flex;align-items:center;gap:10px;padding:14px 17px;background:#0e0f12;border-bottom:2px solid #f0731f;color:#fff}' +
      '#sage-panel .av{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#f0731f;font-weight:800}#sage-panel .hd b{font-size:15px}#sage-panel .hd small{display:block;color:#f5a266;font-size:11px}#sage-panel .x{margin-left:auto;background:none;border:0;color:#aeb4be;font-size:23px;cursor:pointer}' +
      '#sage-panel .body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}#sage-panel .msg{max-width:88%;padding:11px 14px;border-radius:9px;font-size:14px;line-height:1.5}#sage-panel .msg.bot{align-self:flex-start;background:#242830;color:#e6e9ee}#sage-panel .msg.me{align-self:flex-end;background:#f0731f;color:#fff}' +
      '#sage-panel .contact-notice{padding:10px 16px;background:#241d18;border-bottom:1px solid rgba(240,115,31,.3);color:#f4c39f;font-size:12px;line-height:1.42}' +
      '#sage-panel.contact-pending .foot,#sage-panel.contact-pending .chips{display:none}#sage-panel .contact-gate{display:grid;gap:11px;padding:2px 0 8px}#sage-panel .contact-gate h3{margin:0;color:#fff;font-size:17px}#sage-panel .contact-gate p{margin:0;color:#c8ced7;font-size:13px;line-height:1.45}#sage-panel .contact-gate label{display:grid;gap:5px;color:#eef1f5;font-size:12px;font-weight:700}#sage-panel .contact-gate input{width:100%;box-sizing:border-box;border:1px solid #3a3f49;background:#242830;color:#fff;border-radius:6px;padding:11px 12px;font:14px Inter,system-ui,sans-serif}#sage-panel .contact-gate button{border:0;border-radius:6px;background:#f0731f;color:#fff;padding:11px 14px;font:800 14px Inter,system-ui,sans-serif;cursor:pointer}#sage-panel .contact-gate .contact-skip{border:1px solid #f0731f;background:transparent;color:#f5a266}#sage-panel .contact-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}#sage-panel .contact-error{min-height:17px;color:#ffad9c;font-size:12px}' +
      '#sage-panel .chips{display:flex;flex-wrap:wrap;gap:7px;padding:0 16px 10px}#sage-panel .chip{border:1px solid rgba(240,115,31,.6);background:transparent;color:#c9ced7;border-radius:6px;padding:7px 11px;font:600 12px Inter,system-ui,sans-serif;cursor:pointer}#sage-panel .chip:hover{border-color:#f0731f;color:#fff}' +
      '#sage-panel .typing{color:#8a919d;font-size:12px;padding:0 16px 8px}' +
      '#sage-panel .foot{display:flex;gap:8px;padding:12px;background:#0e0f12;border-top:1px solid rgba(255,255,255,.08)}#sage-panel .foot input{flex:1;min-width:0;border:1px solid #3a3f49;background:#242830;color:#fff;border-radius:6px;padding:11px 12px;font:14px Inter,system-ui,sans-serif}#sage-panel .foot button{width:44px;border:0;border-radius:6px;background:#f0731f;color:#fff;cursor:pointer;font-weight:800}' +
      '@media(max-width:600px){#sage-launch{right:12px;gap:9px;padding:14px 18px;font-size:15px}#sage-panel{right:12px;bottom:12px;width:calc(100vw - 24px);height:min(620px,calc(100vh - 24px))}}';
    document.head.appendChild(style);
  }

  function headers() {
    return { 'Content-Type': 'application/json', 'x-paul-site': SITE, 'x-paul-public-key': PUBLIC_KEY };
  }

  function info() {
    return {
      site_id: SITE,
      conversation_id: CONVERSATION_ID,
      conversation_started_at: CONVERSATION_STARTED_AT,
      assistant_name: 'Sage',
      business_name: 'J&J Industrial Solutions',
      business_summary: SUMMARY,
      page_url: location.href,
      page_title: document.title,
      contact: visitorContact,
      transcript: transcript.slice(-100),
    };
  }

  function addMessage(text, who) {
    var el = document.createElement('div');
    el.className = 'msg ' + who;
    el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    transcript.push({ who: who === 'bot' ? 'Sage' : 'Visitor', text: text });
  }

  function addChip(label, action) {
    var button = document.createElement('button');
    button.className = 'chip';
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', action);
    chips.appendChild(button);
  }

  function busy(on) {
    send.disabled = on;
    input.disabled = on;
    typing.hidden = !on;
  }

  async function askSage(text) {
    history.push({ role: 'user', content: text });
    var response = await fetch(API + '/v1/chat', {
      method: 'POST', headers: headers(),
      body: JSON.stringify(Object.assign(info(), { messages: history.slice(-8) })),
    });
    if (!response.ok) throw new Error('chat_' + response.status);
    var data = await response.json();
    if (!data.reply) throw new Error('empty_chat');
    history.push({ role: 'assistant', content: data.reply });
    return data.reply;
  }

  function sendLead(status) {
    var submissionStatus = status === 'partial' ? 'partial' : 'completed';
    if (leadSubmissionState[submissionStatus]) return Promise.resolve({ duplicate: true });
    if (leadSubmissionInFlight[submissionStatus]) return leadSubmissionInFlight[submissionStatus];
    var leadContact = callback || visitorContact;
    if (!leadContact || (!leadContact.phone && !leadContact.email) || (submissionStatus === 'completed' && !leadContact.name)) {
      return Promise.resolve({ skipped: true });
    }
    var request = fetch(API + '/v1/lead', {
      method: 'POST', headers: headers(), keepalive: true,
      body: JSON.stringify(Object.assign(info(), {
        status: submissionStatus,
        lead: { name: leadContact.name || '', company_name: leadContact.company || '', email: leadContact.email || '', phone: leadContact.phone || '', notes: 'Specific request from the J&J Industrial Solutions website chat for owner follow-up.' },
        transcript: transcript.slice(-60),
      })),
    }).then(function (response) {
      if (!response.ok) throw new Error('lead_' + response.status);
      leadSubmissionState[submissionStatus] = true;
      if (submissionStatus === 'completed') track('sage_callback_complete');
      return { captured: true };
    }).catch(function () {
      return { captured: false };
    }).finally(function () {
      leadSubmissionInFlight[submissionStatus] = null;
    });
    leadSubmissionInFlight[submissionStatus] = request;
    return request;
  }

  function beginCallback(initialRequest) {
    if (callback) return;
    if (!contactGateComplete) {
      pendingCallbackRequest = String(initialRequest || pendingCallbackRequest || '').trim();
      showContactGate(true);
      return;
    }
    callback = {
      step: 'done',
      name: visitorContact.name || '',
      email: visitorContact.email || '',
      phone: visitorContact.phone || '',
    };
    lastActivity = Date.now();
    track('sage_callback_start');
    chips.innerHTML = '';
    sendLead('completed').then(function (result) {
      if (result.captured || result.duplicate) {
        addMessage('Thank you. I sent your request and contact information to J&J Industrial Solutions. The team can follow up using the information you provided.', 'bot');
      } else {
        addMessage('I could not send that request just now. Please call ' + PHONE_DISPLAY + ' so J&J Industrial Solutions can help you directly.', 'bot');
      }
    });
  }

  function stepCallback(text) {
    if (callback.step === 'name') {
      callback.name = text;
      callback.step = 'company';
      addMessage('Thanks, ' + text.split(' ')[0] + '. What company or facility are you with?', 'bot');
    } else if (callback.step === 'company') {
      callback.company = text;
      if (callback.phone && callback.email) {
        callback.step = 'done';
        sendLead('completed');
        addMessage('All set. I sent your request to the owners. They can follow up using the contact information you provided. Anything else I can answer while you are here?', 'bot');
      } else {
        callback.step = 'phone';
        addMessage('And the best callback number?', 'bot');
      }
    } else if (callback.step === 'phone') {
      var digits = text.replace(/[^0-9]/g, '');
      if (digits.length < 10) {
        addMessage('That number looks short. Can you give me the full 10-digit number?', 'bot');
        return;
      }
      callback.phone = text;
      callback.step = 'done';
      sendLead('completed');
      addMessage('All set. I sent your request to the owners, and one of them will call you back at ' + text + '. Anything else I can answer while you are here?', 'bot');
    } else {
      routeToChat(text);
    }
  }

  function startVoice() {
    track('sage_voice_start');
    addMessage('Opening your phone to call Sage at ' + PHONE_DISPLAY + '. Calls on this line can be transferred to an owner when appropriate.', 'bot');
    window.location.href = 'tel:' + PHONE_TEL;
  }

  function routeToChat(text) {
    if (!chatStarted) {
      chatStarted = true;
      track('sage_chat_start');
    }
    busy(true);
    askSage(text).then(function (reply) {
      busy(false);
      addMessage(reply, 'bot');
      if (!callback && isSpecificRequest(text)) beginCallback(text);
    }).catch(function () {
      busy(false);
      addMessage('I lost the connection for a second. Try again, or call ' + PHONE_DISPLAY + '.', 'bot');
    });
  }

  function sendText(text) {
    text = String(text || '').trim();
    if (!text) return;
    lastActivity = Date.now();
    addMessage(text, 'me');
    input.value = '';
    if (callback && callback.step !== 'done') { stepCallback(text); return; }
    routeToChat(text);
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function validPhone(value) {
    return (String(value || '').match(/\d/g) || []).length >= 10;
  }

  function initializeConversation() {
    if (history.length || panel.dataset.initialized === 'true') return;
    panel.dataset.initialized = 'true';
    addMessage('Hi, I am Sage. I can answer questions about J&J Industrial Solutions, our crews and services, or send a request to the owners.', 'bot');
    addChip('What do your crews do?', function () { sendText('What kind of work do your crews handle?'); });
    addChip('Request a quote', function () { sendText('How do I request a quote?'); });
    addChip('Send a request to the owners', beginCallback);
    addChip('Call Sage', startVoice);
  }

  function showContactGate(callbackRequired) {
    if (contactGateComplete) return;
    var existing = body.querySelector('.contact-gate');
    if (existing) {
      if (!callbackRequired || existing.getAttribute('data-callback-required') === 'true') return;
      existing.remove();
    }
    panel.classList.add('contact-pending');
    var form = document.createElement('form');
    form.className = 'contact-gate';
    form.setAttribute('data-callback-required', callbackRequired ? 'true' : 'false');
    form.innerHTML = '<h3>Let J&J Industrial Solutions know how to reach you</h3><p>' + (callbackRequired
      ? 'A service request, estimate, or owner follow-up requires your contact information first.'
      : 'You can share your contact information now, or continue with Sage without it to ask general questions.') + '</p><label>Name<input name="name" autocomplete="name" required></label><label>Email<input name="email" type="email" autocomplete="email"></label><label>Phone<input name="phone" type="tel" autocomplete="tel"></label><div class="contact-error" role="alert"></div><div class="contact-actions"><button type="submit">Share contact and continue</button>' + (callbackRequired ? '' : '<button type="button" class="contact-skip">Continue with Sage</button>') + '</div>';
    body.appendChild(form);
    var form = body.querySelector('.contact-gate');
    var error = form.querySelector('.contact-error');
    form.querySelector('[name="name"]').value = visitorContact.name || '';
    form.querySelector('[name="email"]').value = visitorContact.email || '';
    form.querySelector('[name="phone"]').value = visitorContact.phone || '';
    var skip = form.querySelector('.contact-skip');
    if (skip) skip.addEventListener('click', function () {
      contactGateDismissed = true;
      panel.classList.remove('contact-pending');
      form.remove();
      persistContactState();
      addMessage('Of course. Ask me anything. If you decide you need an estimate, service request, or owner follow-up, I will ask how the team can reach you first.', 'bot');
      input.focus();
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var name = String(data.get('name') || '').trim();
      var email = String(data.get('email') || '').trim();
      var phone = String(data.get('phone') || '').trim();
      if (name.length < 2) { error.textContent = 'Please enter your name.'; return; }
      if (!email && !phone) { error.textContent = 'Please enter an email address or phone number.'; return; }
      if (email && !validEmail(email)) { error.textContent = 'Please enter a valid email address.'; return; }
      if (phone && !validPhone(phone)) { error.textContent = 'Please enter a phone number with at least 10 digits.'; return; }
      visitorContact = { name: name, email: email, phone: phone };
      contactGateComplete = true;
      contactGateDismissed = false;
      panel.classList.remove('contact-pending');
      form.remove();
      persistContactState();
      initializeConversation();
      if (callbackRequired || pendingCallbackRequest) {
        pendingCallbackRequest = '';
        beginCallback();
        return;
      }
      addMessage('Thanks, ' + name.split(/\s+/)[0] + '. You can ask a question or send a request to the owners.', 'bot');
      input.focus();
    });
    form.querySelector('input').focus();
  }

  injectCss();
  var launch = document.createElement('button');
  launch.id = 'sage-launch';
  launch.type = 'button';
  launch.innerHTML = '<span class="dot"></span>Ask Sage';
  var panel = document.createElement('div');
  panel.id = 'sage-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Sage, J&J Industrial Solutions assistant');
  panel.innerHTML = '<div class="hd"><div class="av">S</div><div><b>Sage</b><small>J&J Industrial Solutions assistant</small></div><button class="x" type="button" aria-label="Close">&times;</button></div><div class="contact-notice">Ask general questions without sharing contact details. Estimates, service requests, or owner follow-up require your name and either an email address or phone number.</div><div class="body"></div><div class="chips"></div><div class="typing" hidden>Sage is thinking...</div><div class="foot"><input type="text" aria-label="Message Sage" placeholder="Ask about crews, services, or a quote"><button type="button" aria-label="Send">&#8594;</button></div>';
  document.body.appendChild(launch);
  document.body.appendChild(panel);
  var body = panel.querySelector('.body');
  var chips = panel.querySelector('.chips');
  var input = panel.querySelector('input');
  var send = panel.querySelector('.foot button');
  var typing = panel.querySelector('.typing');
  launch.addEventListener('click', function () {
    track('sage_open');
    panel.classList.add('open');
    launch.hidden = true;
    initializeConversation();
    if (!contactGateComplete && !contactGateDismissed) showContactGate(false);
    else input.focus();
  });
  panel.querySelector('.x').addEventListener('click', function () { panel.classList.remove('open'); launch.hidden = false; });
  send.addEventListener('click', function () { sendText(input.value); });
  input.addEventListener('keydown', function (event) { if (event.key === 'Enter') sendText(input.value); });
  setInterval(function () {
    if (qualifiesForAutomatedAbandonment({
      hidden: document.hidden,
      partial: leadSubmissionState.partial,
      completed: leadSubmissionState.completed,
      intakeStarted: Boolean(callback),
      email: (callback && callback.email) || visitorContact.email,
      phone: (callback && callback.phone) || visitorContact.phone,
      inactiveMs: Date.now() - lastActivity,
    })) {
      sendLead('partial');
    }
  }, ABANDONMENT_CHECK_MS);
})();
