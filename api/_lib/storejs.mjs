// Customer accounts on a Standard Store website (added to every Online Store page; it only shows itself when the
// store has accounts switched on). Buyers sign in with phone number + password (or Google, when set up), see their
// orders and receipts, order again, and keep up to 5 delivery addresses. A forgotten password is reset with a
// one-time code the store sends on WhatsApp: nothing is ever emailed to buyers.
// Plain ES5 for old phones. It talks to the cart script through window.__shopC (settings), the "shopcfg" event
// (the store's live settings) and window.SAcct (the signed-in buyer, used by the cart at checkout).
export const ACCOUNT_CSS = `.acct-link{cursor:pointer}.acct .tabs{display:flex;gap:8px;margin:10px 0}.acct .tabs button{flex:1;border:1px solid var(--cart-line,#D1D5DB);background:transparent;color:inherit;border-radius:10px;padding:10px;font:inherit;font-weight:700;cursor:pointer}
.acct .tabs button[aria-pressed=true]{background:var(--cart-acc,#0BA4DB);color:#fff;border-color:transparent}.acct .go{width:100%;border:0;border-radius:12px;padding:14px;font:inherit;font-weight:800;font-size:16px;cursor:pointer;background:var(--cart-acc,#0BA4DB);color:#fff;margin-top:14px}
.acct .lnk{background:none;border:0;color:inherit;text-decoration:underline;font:inherit;cursor:pointer;padding:6px 0;opacity:.85}.acct .ord{border-bottom:1px solid var(--cart-line,#E5E7EB);padding:12px 0}.acct .ord b{display:block}
.acct .st{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.8rem;font-weight:700;background:var(--cart-soft,#F3F4F6)}.acct .st.ok{background:#DCFCE7;color:#14532D}.acct .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.acct .row a,.acct .row button{border:1px solid var(--cart-line,#D1D5DB);border-radius:10px;padding:8px 12px;font:inherit;font-size:.9rem;font-weight:700;color:inherit;background:transparent;text-decoration:none;cursor:pointer}
.acct h3{margin:18px 0 6px;font-size:1.05rem}.acct .addr{display:flex;justify-content:space-between;gap:8px;align-items:center;border-bottom:1px solid var(--cart-line,#E5E7EB);padding:8px 0}
.acct .gbtn{margin:12px 0;min-height:44px}.acct .gsi{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;border:1px solid #DADCE0;background:#fff;color:#3C4043;border-radius:999px;padding:12px 16px;font:inherit;font-weight:600;font-size:15px;cursor:pointer}.acct .gsi:hover{background:#F8F9FA}.acct .or{text-align:center;opacity:.6;font-size:.85rem;margin:6px 0}`;

export const ACCOUNT_JS = String.raw`(function(){var C=window.__shopC;if(!C||!C.s||C.preview)return;
var KEY='acct-'+C.s,tok='',me=null,cfg=null,view='in',fromCart=false;try{tok=localStorage.getItem(KEY)||''}catch(e){}
function $(q,r){return (r||document).querySelector(q)}
function e(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function money(n){return '₦'+Number(n||0).toLocaleString('en-NG')}
function post(body){body.s=C.s;if(tok)body.t=tok;return fetch(C.api+'/api/shop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){if(r.status===401&&tok){out();}if(!r.ok)throw new Error(j.error||'Something went wrong');return j})})}
function keep(j){tok=j.token||tok;me=j.buyer||me;try{localStorage.setItem(KEY,tok)}catch(x){}link();}
function out(){tok='';me=null;try{localStorage.removeItem(KEY)}catch(x){}link();}
window.SAcct={t:function(){return tok},b:function(){return me},saveAddress:function(a){if(!me||!a)return;var l=me.addresses||[];if(l.some(function(x){return x.text.toLowerCase()===a.toLowerCase()})||l.length>=5)return;l=l.concat([{label:'Address '+(l.length+1),text:a}]);post({action:'update',addresses:l}).then(function(j){me=j.buyer}).catch(function(){})}};
var box=document.createElement('div');box.className='cart acct';box.hidden=true;box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Your account');
box.innerHTML='<div class="panel"><h2><span class="ttl">Your account</span><button class="x" type="button" aria-label="Close">×</button></h2><div class="body"></div><p class="note msg" role="status"></p></div>';
document.body.appendChild(box);
var a=document.createElement('a');a.href='#account';a.className='acct-link';a.hidden=true;var nav=document.getElementById('mainnav');if(nav)nav.appendChild(a);
function link(){a.textContent=me?'My account':'Sign in';a.hidden=!(cfg&&cfg.accounts);var s=$('.cart .signin');if(s)s.hidden=!(cfg&&cfg.accounts)||!!me;}
function msg(t,bad){var m=$('.msg',box);m.innerHTML=t?(bad?'<span class="err">'+e(t)+'</span>':e(t)):''}
function open(v,cart){if(window.__paintCart)window.__paintCart();fromCart=!!cart;view=v||(me?'home':'in');box.hidden=false;document.body.style.overflow='hidden';msg('');draw()}
// Back to the cart (if it's open underneath): it fills in the signed-in buyer's details.
function close(){box.hidden=true;document.body.style.overflow='';if(window.__cartPrefill)window.__cartPrefill()}
a.addEventListener('click',function(ev){ev.preventDefault();if(window.__paintCart)window.__paintCart();open()});
box.addEventListener('click',function(ev){if(ev.target===box||ev.target.closest('.x'))close()});
document.addEventListener('click',function(ev){var s=ev.target.closest('.cart .signin a');if(s){ev.preventDefault();open('in',true)}});
function field(id,label,type,extra){return '<label for="'+id+'">'+label+'</label><input id="'+id+'" type="'+(type||'text')+'" '+(extra||'')+'>'}
function val(id){var x=document.getElementById(id);return x?x.value.trim():''}
function busy(b,on){if(b)b.disabled=on}
function draw(){var B=$('.body',box),t=$('.ttl',box);
if(!me&&(view==='home'))view='in';
if(view==='in'||view==='up'){t.textContent=view==='in'?'Sign in':'Create an account';
B.innerHTML='<div class="tabs"><button type="button" data-v="in" aria-pressed="'+(view==='in')+'">Sign in</button><button type="button" data-v="up" aria-pressed="'+(view==='up')+'">Create account</button></div>'+
(cfg&&cfg.google?'<div class="gbtn"></div><p class="or">or with your phone number</p>':'')+
(view==='up'?field('ac-name','Your name','text','autocomplete="name" maxlength="80"'):'')+field('ac-phone','Phone number','tel','autocomplete="tel"')+field('ac-pw','Password'+(view==='up'?' (at least 6 characters)':''),'password','autocomplete="'+(view==='up'?'new':'current')+'-password"')+
'<button class="go" type="button">'+(view==='in'?'Sign in':'Create my account')+'</button>'+(view==='in'?'<button class="lnk fp" type="button">Forgot password?</button>':'<p class="note">Your account keeps your orders, receipts and delivery addresses. You can still buy without one.</p>');
if(cfg&&cfg.google)google($('.gbtn',B));return}
if(view==='forgot'){t.textContent='Forgot password';var wa=C.wa?'https://wa.me/'+C.wa+'?text='+encodeURIComponent('Hello '+C.name+', I forgot my password for your website. Please send me a reset code. My phone number on the account is: '):'';
B.innerHTML='<p>Ask '+e(C.name)+' for a reset code on WhatsApp. Then enter it here with a new password.</p>'+(wa?'<div class="row"><a href="'+e(wa)+'" target="_blank" rel="noopener">Ask for a code on WhatsApp</a></div>':'')+
field('ac-phone','Phone number on your account','tel','autocomplete="tel"')+field('ac-code','6-digit code','text','inputmode="numeric" maxlength="6" autocomplete="one-time-code"')+field('ac-pw','New password (at least 6 characters)','password','autocomplete="new-password"')+'<button class="go" type="button">Save new password</button><button class="lnk back" type="button">Back to sign in</button>';return}
if(view==='phone'){t.textContent='One more step';B.innerHTML='<p>Add your phone number so '+e(C.name)+' can reach you about deliveries.</p>'+field('ac-phone','Phone number','tel','autocomplete="tel"')+'<button class="go" type="button">Continue</button>';return}
t.textContent='Hello, '+e(String(me.name).split(' ')[0]);
B.innerHTML='<div class="tabs"><button type="button" data-v="home" aria-pressed="'+(view==='home')+'">My orders</button><button type="button" data-v="addr" aria-pressed="'+(view==='addr')+'">Addresses</button><button type="button" data-v="me" aria-pressed="'+(view==='me')+'">Details</button></div><div class="sub"></div>';
var S=$('.sub',B);
if(view==='home'){S.innerHTML='<p class="note">Loading your orders…</p>';post({action:'orders'}).then(function(j){
var lab={paid:'Paid',awaiting:'Waiting for your transfer',cod:'Pay on delivery',cancelled:'Cancelled',failed:'Not paid',abandoned:'Not paid',reversed:'Reversed'};
S.innerHTML=j.orders.length?j.orders.map(function(o,k){return '<div class="ord"><b>'+money(o.total)+' · '+new Date(o.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+'</b><span class="st'+(o.status==='paid'?' ok':'')+'">'+(o.delivered?'Delivered':(lab[o.status]||o.status))+'</span> <span class="note">'+e(o.how)+'</span><div class="note">'+o.items.map(function(l){return e(l.name)+' ×'+l.qty}).join(', ')+'</div><div class="row"><a href="'+e(o.link)+'" target="_blank" rel="noopener">'+(o.status==='paid'?'Receipt':'Order details')+'</a><button type="button" class="again" data-k="'+k+'">Order again</button></div></div>'}).join(''):'<p class="note">No orders yet. Your orders appear here when you’re signed in at checkout.</p>';
S.__orders=j.orders}).catch(function(x){S.innerHTML='';msg(x.message,1)});}
if(view==='addr'){var L=me.addresses||[];S.innerHTML=(L.length?L.map(function(x,k){return '<div class="addr"><span><b>'+e(x.label)+'</b><br>'+e(x.text)+'</span><button type="button" class="lnk rmaddr" data-k="'+k+'">Remove</button></div>'}).join(''):'<p class="note">No saved addresses yet. The address you use at checkout is saved for next time.</p>')+
(L.length<5?'<h3>Add an address</h3>'+field('ac-al','Name it','text','maxlength="30" placeholder="e.g. Home, Office"')+'<label for="ac-at">Address</label><textarea id="ac-at" rows="2" maxlength="300"></textarea><button class="go addaddr" type="button">Save address</button>':'')}
if(view==='me'){S.innerHTML=field('ac-name','Your name','text','maxlength="80" value="'+e(me.name)+'"')+field('ac-email','Email (optional)','email','maxlength="200" value="'+e(me.email)+'"')+'<p class="note">Phone: '+e(me.phone)+'</p><button class="go savedet" type="button">Save details</button><h3>Change password</h3>'+
(me.google?'':field('ac-cur','Current password','password','autocomplete="current-password"'))+field('ac-pw','New password (at least 6 characters)','password','autocomplete="new-password"')+'<button class="go savepw" type="button">Change password</button><div class="row"><button type="button" class="signout">Sign out</button></div>'}}
box.addEventListener('click',function(ev){var t=ev.target;
var tb=t.closest('.tabs button');if(tb){view=tb.getAttribute('data-v');msg('');draw();return}
if(t.closest('.fp')){view='forgot';msg('');draw();return}if(t.closest('.back')){view='in';msg('');draw();return}
if(t.closest('.signout')){out();close();return}
var ag=t.closest('.again');if(ag){var o=$('.sub',box).__orders[+ag.getAttribute('data-k')];if(o&&window.__addToCart){o.items.forEach(function(l){window.__addToCart(l.i,l.qty)});close();}return}
var rm=t.closest('.rmaddr');if(rm){var L=(me.addresses||[]).slice();L.splice(+rm.getAttribute('data-k'),1);post({action:'update',addresses:L}).then(function(j){me=j.buyer;draw()}).catch(function(x){msg(x.message,1)});return}
if(t.closest('.addaddr')){var tx=val('ac-at');if(!tx){msg('Type the address',1);return}post({action:'update',addresses:(me.addresses||[]).concat([{label:val('ac-al')||'Address',text:tx}])}).then(function(j){me=j.buyer;msg('Saved');draw()}).catch(function(x){msg(x.message,1)});return}
if(t.closest('.savedet')){post({action:'update',name:val('ac-name'),email:val('ac-email')}).then(function(j){me=j.buyer;msg('Saved');draw()}).catch(function(x){msg(x.message,1)});return}
if(t.closest('.savepw')){post({action:'password',current:val('ac-cur'),password:val('ac-pw')}).then(function(j){keep(j);msg('Password changed');draw()}).catch(function(x){msg(x.message,1)});return}
var go=t.closest('.go');if(!go)return;busy(go,true);var done=function(j){busy(go,false);keep(j);if(fromCart){close();return}view='home';msg('');draw()},bad=function(x){busy(go,false);msg(x.message,1)};
if(view==='in')post({action:'login',phone:val('ac-phone'),password:val('ac-pw')}).then(done,bad);
else if(view==='up')post({action:'signup',name:val('ac-name'),phone:val('ac-phone'),password:val('ac-pw')}).then(done,bad);
else if(view==='forgot')post({action:'reset',phone:val('ac-phone'),code:val('ac-code'),password:val('ac-pw')}).then(function(j){done(j);msg('Password changed. You’re signed in.')},bad);
else if(view==='phone')post({action:'google',credential:box.__gcred,phone:val('ac-phone')}).then(done,bad);});
function gotG(cred){if(!cred)return;box.__gcred=cred;if(box.hidden)open('in');msg('Signing you in…');post({action:'google',credential:cred}).then(function(j){if(j.needPhone){view='phone';draw();return}keep(j);view='home';msg('');draw()}).catch(function(x){msg(x.message,1)})}
function google(slot){if(!slot||!cfg.google)return;slot.innerHTML='<button type="button" class="gsi"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg> Continue with Google</button>';
slot.querySelector('.gsi').addEventListener('click',function(){var u=C.api+'/signin?s='+encodeURIComponent(C.s)+'&o='+encodeURIComponent(location.origin)+'&r='+encodeURIComponent(location.pathname+location.search);var w=null;try{w=window.open(u,'sirraddo-google','width=480,height=640')}catch(x){}if(!w)location.href=u;else msg('Finish signing in in the Google window…')})}
window.addEventListener('message',function(ev){var hub='';try{hub=new URL(C.api).origin}catch(x){}if(!hub||ev.origin!==hub||!ev.data||typeof ev.data.sirraddoGoogle!=='string')return;gotG(ev.data.sirraddoGoogle)});
function takeHash(){var m=/^#sgc=([^&]+)/.exec(location.hash);if(!m)return false;var c='';try{c=decodeURIComponent(m[1])}catch(x){}try{history.replaceState(null,'',location.pathname+location.search)}catch(x){location.hash=''}if(cfg&&cfg.google&&c){gotG(c);return true}return false}
function start(j){cfg=j;link();if(takeHash())return;var h=location.hash==='#account'&&cfg.accounts;if(cfg.accounts&&tok)post({action:'me'}).then(function(k){me=k.buyer;link();if(h)open()}).catch(function(){if(h)open()});else if(h)open();}
if(window.__shopCfg)start(window.__shopCfg);else window.addEventListener('shopcfg',function(ev){start(ev.detail)});
})();`;
