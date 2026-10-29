import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* Add your own Firebase web config in firebase-config.js. Never put AI provider keys here. */
import { firebaseConfig } from "./firebase-config.js";
const ADMIN_EMAIL = "mhdyk3613@gmail.com";
const $ = (id) => document.getElementById(id);
let auth, db, currentUser = null, activeChatId = null, currentMessages = [], pendingImage = null;
let localSettings = loadLocalSettings();

function loadLocalSettings(){try{return JSON.parse(localStorage.getItem("jarvis35_settings")||"{}")}catch{return {}}}
function saveLocalSettings(){localStorage.setItem("jarvis35_settings",JSON.stringify(localSettings))}
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.remove("hidden");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add("hidden"),3000)}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function safeUrl(s){try{const u=new URL(s);return ["https:","http:"].includes(u.protocol)?u.href:"#"}catch{return "#"}}
function markdownLite(text){
  let s=escapeHtml(text);
  s=s.replace(/```([\s\S]*?)```/g,(_,c)=>`<pre><code>${c.trim()}</code></pre>`);
  s=s.replace(/`([^`]+)`/g,"<code>$1</code>");
  s=s.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
  s=s.replace(/\[([^\]]+)\]\((https?:\/\/[^ )]+)\)/g,(_,t,u)=>`<a href="${safeUrl(u)}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  s=s.replace(/(^|\s)(https?:\/\/[^\s<]+)/g,(_,p,u)=>`${p}<a href="${safeUrl(u)}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  return s;
}
function setActivity(title,detail){$("activityTitle").textContent=title;$("activityDetail").textContent=detail;$("activity").classList.remove("hidden");$("topStatus").textContent=title}
function hideActivity(){$("activity").classList.add("hidden");$("topStatus").textContent="آماده به کار"}
function isAdmin(){return currentUser?.email?.toLowerCase()===ADMIN_EMAIL.toLowerCase()}
function newId(){return crypto.randomUUID?crypto.randomUUID():String(Date.now())+"_"+Math.random().toString(36).slice(2)}
function getKeys(provider){return Array.isArray(localSettings.keys?.[provider])?localSettings.keys[provider]:[]}
function setKeys(provider,keys){localSettings.keys ||= {};localSettings.keys[provider]=keys;saveLocalSettings();renderKeys()}
function renderKeys(){
  for(const [provider,id] of [["groq","groqKeys"],["gemini","geminiKeys"],["custom","customKeys"]]){
    const wrap=$(id);wrap.innerHTML="";
    getKeys(provider).forEach((item,i)=>{
      const row=document.createElement("div");row.className="key-row";
      const input=document.createElement("input");input.type="password";input.autocomplete="off";input.placeholder=`API ${i+1} · کلید`;input.value=item.key||"";input.addEventListener("change",()=>{const a=getKeys(provider);a[i].key=input.value;setKeys(provider,a)});
      const model=document.createElement("input");model.className="key-model";model.placeholder="Model";model.value=item.model||"";model.addEventListener("change",()=>{const a=getKeys(provider);a[i].model=model.value;setKeys(provider,a)});
      const del=document.createElement("button");del.textContent="×";del.title="حذف";del.onclick=()=>setKeys(provider,getKeys(provider).filter((_,j)=>j!==i));
      row.append(input,model,del);wrap.append(row);
    });
  }
}
function addKey(provider){setKeys(provider,[...getKeys(provider),{key:"",model:""}]);const list={groq:"groqKeys",gemini:"geminiKeys",custom:"customKeys"}[provider];$(list).lastElementChild?.querySelector("input")?.focus()}
function showPanel(name){$("settingsPanel").classList.toggle("hidden",name!=="settings");$("adminPanel").classList.toggle("hidden",name!=="admin");if(name==="settings")fillSettings();if(name==="admin")loadAdminPanel()}
function fillSettings(){
  $("displayName").value=localSettings.displayName||"";
  $("tone").value=localSettings.tone||"balanced";$("thinking").value=localSettings.thinking||"medium";
  $("memoryEnabled").checked=localSettings.memoryEnabled!==false;$("speechEnabled").checked=!!localSettings.speechEnabled;
  $("voiceEnabled").checked=localSettings.voiceEnabled!==false;$("provider").value=localSettings.provider||"groq";
  $("modelName").value=localSettings.modelName||"";$("customBase").value=localSettings.customBase||"";
  renderKeys();
}
function saveSettings(){
  localSettings={...localSettings,displayName:$("displayName").value.trim(),tone:$("tone").value,thinking:$("thinking").value,memoryEnabled:$("memoryEnabled").checked,speechEnabled:$("speechEnabled").checked,voiceEnabled:$("voiceEnabled").checked,provider:$("provider").value,modelName:$("modelName").value.trim(),customBase:$("customBase").value.trim()};
  saveLocalSettings();$("settingsStatus").textContent="تنظیمات ذخیره شد.";toast("تنظیمات ذخیره شد");
}
function addMessage(role,text,opts={}){
  $("welcome").classList.add("hidden");
  const wrap=document.createElement("article");wrap.className=`message ${role}`;
  const avatar=document.createElement("div");avatar.className="avatar";avatar.textContent=role==="user"?(localSettings.displayName?.slice(0,1)||"شما"):"J";
  const body=document.createElement("div");body.className="message-body";
  const label=document.createElement("div");label.className="message-label";label.textContent=role==="user"?(localSettings.displayName||"شما"):"JARVIS";
  const bubble=document.createElement("div");bubble.className="bubble";bubble.innerHTML=markdownLite(text);
  if(opts.image){const img=document.createElement("img");img.src=opts.image;img.alt="تصویر پیوست‌شده";bubble.append(document.createElement("br"),img)}
  body.append(label,bubble);wrap.append(avatar,body);$("messages").append(wrap);$("chatPanel").scrollTop=$("chatPanel").scrollHeight;return bubble;
}
function appendSearchCards(bubble,queryText){
  const box=document.createElement("div");box.className="search-results";
  const items=[
    {title:"جست‌وجوی وب",url:`https://www.google.com/search?q=${encodeURIComponent(queryText)}`,desc:"نتایج وب"},
    {title:"تصاویر",url:`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(queryText)}`,desc:"نمایش تصاویر"},
    {title:"ویکی‌پدیا",url:`https://fa.wikipedia.org/w/index.php?search=${encodeURIComponent(queryText)}`,desc:"دانشنامه"}
  ];
  for(const it of items){const card=document.createElement("div");card.className="search-card";card.innerHTML=`<b>${escapeHtml(it.title)}</b><span class="hint">${escapeHtml(it.desc)}</span><a href="${safeUrl(it.url)}" target="_blank" rel="noopener noreferrer">باز کردن ↗</a>`;box.append(card)}
  bubble.append(box);
}
function systemPrompt(){
  const name=localSettings.displayName||"دوست من";
  const tone={balanced:"friendly and clear",professional:"professional and precise",concise:"concise and direct",warm:"warm and supportive"}[localSettings.tone||"balanced"];
  const thinking=localSettings.thinking||"medium";
  return `You are JARVIS 3.5, a capable Persian-first personal assistant. User's preferred name is ${name}. Tone: ${tone}. Thinking mode: ${thinking}. Reply in the user's language, normally Persian. Be honest about tool limits and never claim to have performed an action unless the browser actually performed it. You cannot access arbitrary apps, messages, contacts, microphone in background, or phone internals from a website. Ask confirmation before consequential actions. When asked to search, summarize from your own knowledge if suitable and also provide search links when current verification is needed. Do not invent sources. The app can show search shortcuts separately.`;
}
function getProviderConfig(provider,keyObj){
  if(provider==="groq")return {url:"https://api.groq.com/openai/v1/chat/completions",key:keyObj.key,model:keyObj.model||localSettings.modelName||"llama-3.3-70b-versatile",kind:"openai"};
  if(provider==="custom")return {url:(localSettings.customBase||"").replace(/\/+$/,"")+"/chat/completions",key:keyObj.key,model:keyObj.model||localSettings.modelName,kind:"openai"};
  return {url:"https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(keyObj.model||localSettings.modelName||"gemini-2.0-flash")+":generateContent?key="+encodeURIComponent(keyObj.key),key:keyObj.key,model:keyObj.model||localSettings.modelName||"gemini-2.0-flash",kind:"gemini"};
}
async function callProvider(provider,keyObj,messages){
  const cfg=getProviderConfig(provider,keyObj);
  if(!cfg.key)throw new Error("API key is empty");
  const thinking=localSettings.thinking||"medium";
  if(cfg.kind==="gemini"){
    const contents=messages.filter(m=>m.role!=="system").map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]}));
    const body={systemInstruction:{parts:[{text:systemPrompt()}]},contents,generationConfig:{temperature:thinking==="low"?0.5:thinking==="high"?0.8:0.65,maxOutputTokens:thinking==="low"?700:thinking==="high"?3500:1800}};
    const res=await fetch(cfg.url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await res.json();if(!res.ok)throw new Error(data.error?.message||`HTTP ${res.status}`);
    const text=data.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"پاسخی دریافت نشد.";
    return text;
  }
  if(!cfg.url.startsWith("https://"))throw new Error("Custom API Base URL باید با https:// شروع شود");
  const body={model:cfg.model,messages:[{role:"system",content:systemPrompt()},...messages.filter(m=>m.role!=="system").map(m=>({role:m.role,content:m.content}))],temperature:thinking==="low"?0.4:thinking==="high"?0.8:0.65,max_tokens:thinking==="low"?700:thinking==="high"?3500:1800};
  const res=await fetch(cfg.url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+cfg.key},body:JSON.stringify(body)});
  const data=await res.json();if(!res.ok)throw new Error(data.error?.message||`HTTP ${res.status}`);
  return data.choices?.[0]?.message?.content||"پاسخی دریافت نشد.";
}
async function askAI(userText){
  const preferred=localSettings.provider||"groq";
  const order=[preferred,...["groq","gemini","custom"].filter(p=>p!==preferred)];
  const errors=[];
  for(const provider of order){
    const keys=getKeys(provider).filter(k=>k.key?.trim());
    for(let i=0;i<keys.length;i++){
      setActivity("Forwarder API",`بررسی ${provider.toUpperCase()} · API ${i+1} از ${keys.length}`);
      try{
        const text=await callProvider(provider,keys[i],currentMessages);
        localSettings.lastProvider=provider;localSettings.lastKeyIndex=i;saveLocalSettings();
        return {text,provider,index:i};
      }catch(err){errors.push(`${provider} API ${i+1}: ${err.message}`)}
    }
  }
  throw new Error(errors.length?("تمام مسیرهای API ناموفق بودند:\n"+errors.slice(0,5).join("\n")):"هیچ API Key ثبت نشده است. از تنظیمات، کلید Groq یا Gemini یا API آزاد اضافه کن.");
}
async function sendPrompt(text){
  text=text.trim();if(!text&&!pendingImage)return;
  if(!currentUser){toast("ابتدا با Google وارد شو");return}
  if(!text)text="لطفاً تصویر پیوست‌شده را بررسی کن.";
  const imageData=pendingImage;
  addMessage("user",text,{image:imageData});
  currentMessages.push({role:"user",content:text});
  const prompt=$("promptInput");prompt.value="";prompt.style.height="auto";
  pendingImage=null;$("imagePreview").classList.add("hidden");$("imagePreview").innerHTML="";
  const bubble=addMessage("assistant","").querySelector?.(".bubble");
  // addMessage returns bubble; handle it directly
  let answerBubble=$("messages").lastElementChild?.querySelector(".bubble");
  try{
    if(isSearchIntent(text)){
      setActivity("جست‌وجوی وب","ساخت لینک‌های جست‌وجو و تصاویر");
      answerBubble.innerHTML=markdownLite("برای اینکه نتیجه‌ی زنده و قابل بررسی ببینی، این مسیرهای جست‌وجو را آماده کردم:");
      appendSearchCards(answerBubble,text);
    }
    setActivity("پردازش درخواست","ارسال به مدل هوش مصنوعی");
    const result=await askAI(text);
    answerBubble.innerHTML=markdownLite(result.text);
    if(isSearchIntent(text))appendSearchCards(answerBubble,text);
    currentMessages.push({role:"assistant",content:result.text});
    if(localSettings.speechEnabled)speak(result.text);
    await persistChat(text,result.text);
  }catch(err){
    answerBubble.textContent="جارویس نتوانست درخواست را کامل کند.\n"+err.message+"\n\nتنظیمات API را بررسی کن.";
    toast("خطا در پردازش API");
  }finally{hideActivity();$("chatPanel").scrollTop=$("chatPanel").scrollHeight}
}
function isSearchIntent(t){return /(سرچ|جست.?وجو|پیدا کن|بگرد|عکس|تصویر|چیست|چیه|قیمت امروز|آخرین اخبار|what is|search|find|images?)/i.test(t)}
async function persistChat(userText,assistantText){
  if(!localSettings.memoryEnabled||!db||!currentUser)return;
  try{
    if(!activeChatId){activeChatId=newId();await setDoc(doc(db,"users",currentUser.uid,"chats",activeChatId),{title:userText.slice(0,55),createdAt:serverTimestamp(),updatedAt:serverTimestamp()})}
    await setDoc(doc(db,"users",currentUser.uid,"chats",activeChatId),{messages:currentMessages,updatedAt:serverTimestamp()},{merge:true});
    await loadHistory();
  }catch(e){console.warn("Memory persistence failed",e)}
}
async function loadHistory(){
  if(!db||!currentUser)return;
  try{
    const q=query(collection(db,"users",currentUser.uid,"chats"),orderBy("updatedAt","desc"),limit(30));const snap=await getDocs(q);
    const wrap=$("historyList");wrap.innerHTML="";
    if(snap.empty){wrap.innerHTML='<p class="empty-note">گفتگویی ندارید.</p>';return}
    snap.forEach(d=>{const data=d.data();const b=document.createElement("button");b.className="history-item";b.textContent=data.title||"گفتگوی جدید";b.onclick=()=>openChat(d.id,data);wrap.append(b)});
  }catch(e){console.warn("History unavailable",e)}
}
function openChat(id,data){activeChatId=id;currentMessages=Array.isArray(data.messages)?data.messages:[];$("messages").innerHTML="";$("welcome").classList.toggle("hidden",currentMessages.length>0);currentMessages.forEach(m=>addMessage(m.role==="assistant"?"assistant":"user",m.content));$("sidebar").classList.remove("open");}
async function loadAdminPanel(){
  const content=$("adminContent");content.innerHTML="";
  if(!isAdmin()){content.textContent="دسترسی مجاز نیست.";return}
  const cards=document.createElement("div");cards.className="suggestion-grid";
  cards.innerHTML='<div class="search-card"><small>ADMIN</small><h3>فعال</h3><span class="hint">حساب مدیر تأیید شد</span></div><div class="search-card"><small>USER</small><h3>۱</h3><span class="hint">کاربر فعلی</span></div>';
  content.append(cards);
  $("userTable").innerHTML='<p class="hint">برای نمایش امن همه کاربران، Cloud Function یا بک‌اند دارای دسترسی Admin SDK لازم است. از کلاینت عمومی نمی‌توان فهرست همه ایمیل‌ها را امن و کامل خواند.</p>';
}
function speak(text){if(!("speechSynthesis" in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text.slice(0,1800));u.lang="fa-IR";u.rate=1.02;window.speechSynthesis.speak(u)}
function startRecognition(){
  if(localSettings.voiceEnabled===false){toast("تشخیص گفتار خاموش است");return}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast("این مرورگر از تشخیص گفتار پشتیبانی نمی‌کند");return}
  const rec=new SR();rec.lang="fa-IR";rec.interimResults=false;rec.maxAlternatives=1;
  rec.onstart=()=>{toast("در حال گوش‌دادن…");$("voiceToggle").classList.add("listening")};
  rec.onend=()=>$("voiceToggle").classList.remove("listening");
  rec.onerror=()=>toast("تشخیص گفتار متوقف شد");
  rec.onresult=e=>{const text=e.results[0][0].transcript;$("promptInput").value=text;handleLocalCommand(text)};
  rec.start();
}
function handleLocalCommand(text){
  const t=text.toLowerCase().trim();
  if(/^(هی|hey|hi)\s*جارویس/.test(t)){speak(`بله ${localSettings.displayName||"دوست من"}؟`);return}
  const appMap=[[/اینستا|ایستا|instagram/,"instagram"],[/یوتیوب|youtube/,"youtube"],[/گوگل|google/,"google"],[/واتساپ|whatsapp/,"whatsapp"]];
  for(const [re,app] of appMap){if(re.test(t)&&/باز کن|برو|open/.test(t)){const urls={instagram:"https://www.instagram.com/",youtube:"https://www.youtube.com/",google:"https://www.google.com/",whatsapp:"https://web.whatsapp.com/"};toast("بازکردن "+app);window.open(urls[app],"_blank","noopener");$("promptInput").value="";return}}
}
async function initFirebase(){
  if(!firebaseConfig||!firebaseConfig.apiKey||firebaseConfig.apiKey==="YOUR_FIREBASE_API_KEY"){throw new Error("Firebase config تنظیم نشده؛ firebase-config.js را تکمیل کن.")}
  const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
  $("googleLogin").onclick=async()=>{
    $("authError").textContent="";
    try{const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:"select_account"});await signInWithPopup(auth,provider)}
    catch(e){if(["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(e.code)){try{await signInWithRedirect(auth,new GoogleAuthProvider())}catch(err){$("authError").textContent=err.message}}else $("authError").textContent=e.message}
  };
  await getRedirectResult(auth).catch(()=>{});
  onAuthStateChanged(auth,async user=>{
    currentUser=user;
    if(!user){$("authScreen").classList.remove("hidden");$("app").classList.add("hidden");return}
    $("authScreen").classList.add("hidden");$("app").classList.remove("hidden");
    $("userName").textContent=user.displayName||localSettings.displayName||"کاربر";$("userEmail").textContent=user.email||"";$("userAvatar").src=user.photoURL||"";
    $("adminNav").classList.toggle("hidden",!isAdmin());
    try{await setDoc(doc(db,"users",user.uid),{email:user.email||"",displayName:user.displayName||"",photoURL:user.photoURL||"",lastSeen:serverTimestamp()},{merge:true})}catch(e){console.warn("User profile not saved",e)}
    await loadHistory();
  });
}
function bindUI(){
  $("composer").addEventListener("submit",e=>{e.preventDefault();sendPrompt($("promptInput").value)});
  $("promptInput").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,160)+"px"});
  $("promptInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("composer").requestSubmit()}});
  $("newChat").onclick=()=>{activeChatId=null;currentMessages=[];$("messages").innerHTML="";$("welcome").classList.remove("hidden");$("sidebar").classList.remove("open")};
  document.querySelectorAll("[data-panel]").forEach(b=>b.addEventListener("click",()=>showPanel(b.dataset.panel)));
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>showPanel(""));
  document.querySelectorAll(".add-key").forEach(b=>b.onclick=()=>addKey(b.dataset.provider));
  $("saveSettings").onclick=saveSettings;
  $("logout").onclick=()=>signOut(auth);
  $("voiceToggle").onclick=startRecognition;$("micBtn").onclick=startRecognition;
  $("openSidebar").onclick=()=>$("sidebar").classList.add("open");$("closeSidebar").onclick=()=>$("sidebar").classList.remove("open");
  document.querySelectorAll(".suggestion").forEach(b=>b.onclick=()=>sendPrompt(b.dataset.prompt));
  $("attachBtn").onclick=()=>$("fileInput").click();
  $("fileInput").onchange=async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>5*1024*1024){toast("حداکثر اندازه تصویر ۵ مگابایت است");return}pendingImage=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(f)});$("imagePreview").innerHTML=`<img src="${pendingImage}" alt="پیش‌نمایش"><button class="icon-btn" type="button" id="removeImage">×</button>`;$("imagePreview").classList.remove("hidden");$("removeImage").onclick=()=>{pendingImage=null;$("imagePreview").classList.add("hidden")};toast("تصویر اضافه شد؛ توجه: این نسخه تصویر را به مدل ارسال نمی‌کند، فقط پیش‌نمایش می‌دهد.")};
  $("clearLocal").onclick=()=>{if(confirm("کلیدهای API ذخیره‌شده در این مرورگر پاک شوند؟")){localSettings.keys={};saveLocalSettings();renderKeys();toast("کلیدها پاک شدند")}};
  $("displayName").addEventListener("change",()=>{localSettings.displayName=$("displayName").value.trim();saveLocalSettings()});
}
bindUI();
initFirebase().catch(err=>{$("authScreen").classList.remove("hidden");$("authError").textContent=err.message;console.error(err)});
