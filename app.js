import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const $ = (id) => document.getElementById(id);
const state = { provider: localStorage.getItem("jarvis_provider") || "groq", apiKey: localStorage.getItem("jarvis_api_key") || "", model: (() => { const m = (localStorage.getItem("jarvis_model") || "").replace(/^models\//, ""); return m === "gemini-2.5-flash" ? "gemini-3.8-flash" : m; })(), webSearch: localStorage.getItem("jarvis_web_search") === "true", remember: localStorage.getItem("jarvis_remember_key") === "true", image: null, imageData: null, busy: false, user: null, history: JSON.parse(localStorage.getItem("jarvis_history") || "[]"), activeHistory: null, auth: null };
const defaults = { groq: "llama-3.3-70b-versatile", gemini: "gemini-3.8-flash" };
const icons = {
  assistant: '<svg viewBox="0 0 48 48"><path d="M24 5 42 15.5v17L24 43 6 32.5v-17L24 5Z"/><path d="M15 29V19l9-5 9 5v10l-9 5-9-5Z"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>'
};
function toast(message, error=false){ const node=document.createElement("div"); node.className="toast"+(error?" error":""); node.textContent=message; $("toastRegion").append(node); setTimeout(()=>node.remove(),4800); }
function setConnection(kind,text){ $("statusDot").className="status-dot"+(kind==="online"?" online":kind==="error"?" error":""); $("connectionText").textContent=text; }
function safeText(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function renderMarkdown(text){
  // Small safe renderer: escape HTML first, then format code, headings, lists, bold and line breaks.
  let s=safeText(text);
  const blocks=[];
  s=s.replace(/```([\w+-]*)\n?([\s\S]*?)```/g,(_,lang,code)=>{blocks.push(`<pre><code>${code.trim()}</code></pre>`);return `@@BLOCK${blocks.length-1}@@`;});
  s=s.replace(/`([^`]+)`/g,"<code>$1</code>");
  s=s.replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h2>$1</h2>");
  s=s.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>");
  s=s.replace(/^\s*[-*] (.+)$/gm,"<li>$1</li>").replace(/(<li>.*<\/li>\n?)+/g,m=>`<ul>${m}</ul>`);
  s=s.split(/\n{2,}/).map(p=>/^@@BLOCK\d+@@$/.test(p.trim())?p.trim():p.startsWith("<h")||p.startsWith("<ul>")?p:`<p>${p.replace(/\n/g,"<br>")}</p>`).join("");
  return s.replace(/@@BLOCK(\d+)@@/g,(_,i)=>blocks[Number(i)]);
}
function renderHistory(){
  const box=$("historyList"); box.replaceChildren();
  state.history.slice(0,12).forEach((item,i)=>{const b=document.createElement("button");b.className="history-entry";b.innerHTML='<svg viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-1 2v-6.5A7.5 7.5 0 1 1 20 11.5Z"/></svg><span></span>';b.querySelector("span").textContent=item.title||"گفت‌وگوی جدید";b.addEventListener("click",()=>loadHistory(i));box.append(b);});
}
function saveHistory(){
  if(!state.activeHistory) state.activeHistory={title:"گفت‌وگوی جدید",messages:[],updated:Date.now()};
  if(!state.activeHistory.title||state.activeHistory.title==="گفت‌وگوی جدید"){const first=state.activeHistory.messages.find(m=>m.role==="user");if(first)state.activeHistory.title=first.text.slice(0,32)+(first.text.length>32?"…":"");}
  state.activeHistory.updated=Date.now();
  const found=state.history.findIndex(h=>h.id===state.activeHistory.id);
  if(found>=0)state.history[found]=state.activeHistory;else{state.activeHistory.id=Date.now().toString(36);state.history.unshift(state.activeHistory);}
  state.history=state.history.slice(0,30);localStorage.setItem("jarvis_history",JSON.stringify(state.history));renderHistory();
}
function loadHistory(i){
  const item=state.history[i];if(!item)return;state.activeHistory=item;$("messages").replaceChildren();$("welcome").hidden=true;
  item.messages.forEach(m=>appendMessage(m.role,m.text,false));document.querySelectorAll(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.view==="history"));$("sidebar").classList.remove("open");
}
function appendMessage(role,text,save=true){
  $("welcome").hidden=true;const row=document.createElement("article");row.className="message "+(role==="user"?"user":"assistant");
  const avatar=document.createElement("div");avatar.className="message-avatar";avatar.innerHTML=role==="user"?icons.user:icons.assistant;
  const wrap=document.createElement("div");wrap.className="message-content";wrap.innerHTML=renderMarkdown(text);
  row.append(avatar,wrap);
  if(role==="assistant"){const tools=document.createElement("div");tools.className="message-tools";const copy=document.createElement("button");copy.innerHTML=icons.copy+" کپی پاسخ";copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(text);toast("پاسخ کپی شد.");}catch{toast("کپی در این مرورگر در دسترس نیست.",true);}});tools.append(copy);wrap.append(tools);}
  $("messages").append(row);$("chatStage").scrollTop=$("chatStage").scrollHeight;
  if(save&&state.activeHistory){state.activeHistory.messages.push({role,text});saveHistory();}
  return row;
}
function showTyping(){const row=document.createElement("article");row.className="message assistant";row.innerHTML=`<div class="message-avatar">${icons.assistant}</div><div class="message-content"><div class="typing"><span></span><span></span><span></span></div></div>`;$("messages").append(row);$("chatStage").scrollTop=$("chatStage").scrollHeight;return row;}
function updateModelLabel(){const provider=state.provider==="groq"?"Groq":"Gemini";$("activeModelLabel").textContent=state.apiKey?`${provider} · ${(state.model||defaults[state.provider])}`:"مدل تنظیم نشده";}
function openSettings(){ $("settingsOverlay").hidden=false;$("providerSelect").value=state.provider;$("apiKeyInput").value=state.apiKey;$("modelInput").value=state.model;$("webSearchToggle").checked=state.webSearch;$("rememberKeyToggle").checked=state.remember; }
function closeSettings(){ $("settingsOverlay").hidden=true; }
function updateAccountUI(){
 const user=state.user;$("accountName").textContent=user?(user.displayName||user.email||"کاربر جارویس"):"حساب مهمان";$("accountHint").textContent=user?(user.email||"وارد شده"):"ورود برای همگام‌سازی";$("userAvatar").textContent=user?(user.displayName||user.email||"J").slice(0,1).toUpperCase():"J";$("settingsAccountName").textContent=user?(user.displayName||user.email):"حساب مهمان";$("settingsAccountHint").textContent=user?(user.email||"ورود با موفقیت انجام شد"):"هنوز وارد نشده‌ای";$("googleSignIn").textContent=user?"وارد شده‌اید":"ورود با Google";$("signOutButton").hidden=!user;
}
function saveSettings(){
 state.provider=$("providerSelect").value;state.model=$("modelInput").value.trim().replace(/^models\//, "");if(state.provider==="gemini"&&state.model==="gemini-2.5-flash")state.model="gemini-3.8-flash";$("modelInput").value=state.model;state.webSearch=$("webSearchToggle").checked;state.remember=$("rememberKeyToggle").checked;
 state.apiKey=$("apiKeyInput").value.trim();
 localStorage.setItem("jarvis_provider",state.provider);localStorage.setItem("jarvis_model",state.model);localStorage.setItem("jarvis_web_search",String(state.webSearch));localStorage.setItem("jarvis_remember_key",String(state.remember));
 if(state.remember&&state.apiKey)localStorage.setItem("jarvis_api_key",state.apiKey);else localStorage.removeItem("jarvis_api_key");
 updateModelLabel();
}
async function apiRequest(messages,imageData){
 const model=state.model||defaults[state.provider];
 if(!state.apiKey)throw new Error("کلید API وارد نشده. از تنظیمات جارویس یک کلید معتبر وارد کن.");
 if(state.provider==="groq"){
   if(imageData)throw new Error("در این نسخه، ارسال تصویر از مسیر Gemini پیاده‌سازی شده. در تنظیمات، Gemini رو انتخاب کن و کلید API مربوط به Google AI Studio رو وارد کن.");
   const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${state.apiKey}`},body:JSON.stringify({model, messages:messages.map(m=>({role:m.role==="assistant"?"assistant":m.role==="system"?"system":"user",content:m.content||m.text})),temperature:0.7,max_tokens:4096})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error?.message||`خطای Groq (${response.status}). کلید، نام مدل و محدودیت استفاده رو بررسی کن.`);
   const answer=data.choices?.[0]?.message?.content;if(!answer)throw new Error("Groq پاسخی برنگردوند.");return answer;
 }
 const contents=messages.filter(m=>m.role!=="system").map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content||m.text}]}));
 if(contents.length&&messages[0]?.role==="system")contents[0].parts.unshift({text:`دستورهای رفتاری: ${messages[0].content}\n\n`});
 if(imageData&&contents.length){contents[contents.length-1].parts.push({inlineData:{mimeType:imageData.mimeType,data:imageData.base64}});}
 const payload={contents,generationConfig:{temperature:0.7,maxOutputTokens:4096}};
 if(state.webSearch)payload.tools=[{google_search:{}}];
 const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(state.apiKey)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error?.message||`خطای Gemini (${response.status}). کلید و نام مدل رو بررسی کن.`);
 const answer=data.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();if(!answer)throw new Error("Gemini پاسخی برنگردوند؛ ممکنه درخواست توسط مدل رد شده باشه.");return answer;
}
async function sendMessage(prefill){
 if(state.busy)return;const input=$("promptInput");const text=(prefill??input.value).trim();if(!text&&!state.imageData)return;
 if(!state.apiKey){openSettings();toast("اول کلید API رو در تنظیمات وارد کن.",true);return;}
 const imageData=state.imageData;
 const userText=text||(imageData?"این تصویر رو بررسی و توصیف کن.":"");
 if(!state.activeHistory)state.activeHistory={title:"گفت‌وگوی جدید",messages:[],updated:Date.now()};
 appendMessage("user",userText+(imageData?"\n\n[تصویر پیوست شد]":""),true);
 input.value="";resizeInput();state.busy=true;$("sendButton").disabled=true;setConnection("online","در حال دریافت پاسخ");const typing=showTyping();
 try{
   const messages=[{role:"system",content:"تو جارویس هستی؛ یک دستیار دقیق، صمیمی و مسئولیت‌پذیر. به فارسی روان پاسخ بده مگر کاربر زبان دیگری بخواهد. اگر مطمئن نیستی شفاف بگو. کد را در بلوک کد ارائه کن. ادعای انجام کار یا جست‌وجویی که واقعاً انجام نداده‌ای نکن."},...state.activeHistory.messages.filter(m=>m.role==="user"||m.role==="assistant").slice(-20)];
   const answer=await apiRequest(messages,imageData);typing.remove();appendMessage("assistant",answer,true);setConnection("online","اتصال آماده است");
 }catch(err){typing.remove();appendMessage("assistant",`**خطا در اتصال به هوش مصنوعی**\n\n${err.message||"خطای ناشناخته"}\n\nتنظیمات API رو بررسی کن و دوباره تلاش کن.`,false);setConnection("error","خطا در اتصال");toast(err.message||"اتصال ناموفق بود.",true);}
 finally{state.busy=false;$("sendButton").disabled=false;clearImage();}
}
function resizeInput(){const el=$("promptInput");el.style.height="auto";el.style.height=Math.min(el.scrollHeight,180)+"px";}
function clearImage(){state.image=null;state.imageData=null;$("attachmentPreview").hidden=true;$("attachmentPreview").replaceChildren();}
async function addImage(file){
 if(!file)return;if(!file.type.startsWith("image/")){toast("لطفاً یک فایل تصویر انتخاب کن.",true);return;}if(file.size>8*1024*1024){toast("حجم تصویر باید کمتر از ۸ مگابایت باشه.",true);return;}
 const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=reject;reader.readAsDataURL(file);});
 state.image=file;state.imageData={mimeType:file.type,base64};const preview=$("attachmentPreview");preview.replaceChildren();const img=document.createElement("img");img.src=URL.createObjectURL(file);img.alt="پیش‌نمایش تصویر";const name=document.createElement("span");name.textContent=file.name;const remove=document.createElement("button");remove.textContent="حذف تصویر";remove.addEventListener("click",clearImage);preview.append(img,name,remove);preview.hidden=false;
}
async function testConnection(){
 saveSettings();$("apiTestResult").className="test-result";$("apiTestResult").textContent="در حال آزمایش اتصال…";
 try{const answer=await apiRequest([{role:"user",content:"فقط بنویس: اتصال موفق است."}],null);$("apiTestResult").textContent="اتصال موفق است: "+answer.slice(0,90);setConnection("online","اتصال آماده است");toast("اتصال API با موفقیت آزمایش شد.");}
 catch(e){$("apiTestResult").className="test-result error";$("apiTestResult").textContent=e.message||"آزمایش اتصال ناموفق بود.";setConnection("error","خطا در اتصال");}
}
function startNewChat(){state.activeHistory=null;$("messages").replaceChildren();$("welcome").hidden=false;$("promptInput").value="";clearImage();$("sidebar").classList.remove("open");document.querySelectorAll(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.view==="chat"));}
async function signInGoogle(){
 if(!state.auth){toast("اتصال Firebase آماده نشد؛ تنظیمات Firebase رو بررسی کن.",true);return;}
 try{await signInWithPopup(state.auth,new GoogleAuthProvider());toast("ورود با Google موفق بود.");}
 catch(e){const msg=e.code==="auth/unauthorized-domain"?"این دامنه هنوز در Firebase → Authentication → Settings → Authorized domains مجاز نیست.":e.code==="auth/popup-blocked"?"مرورگر پنجره ورود رو مسدود کرده؛ اجازه Popup رو فعال کن.":e.message||"ورود ناموفق بود.";toast(msg,true);}
}
function setupVoice(){
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SpeechRecognition){$("micButton").addEventListener("click",()=>toast("ورودی صوتی در این مرورگر پشتیبانی نمی‌شه. از Chrome به‌روز استفاده کن.",true));return;}
 let rec=null;
 $("micButton").addEventListener("click",()=>{
  if(rec){try{rec.stop()}catch{}return;}
  rec=new SpeechRecognition();rec.lang="fa-IR";rec.interimResults=true;rec.continuous=false;$("micButton").classList.add("recording");$("micButton").setAttribute("aria-label","توقف ورودی صوتی");
  rec.onresult=e=>{let s="";for(let i=e.resultIndex;i<e.results.length;i++)s+=e.results[i][0].transcript;$("promptInput").value=s;resizeInput();};
  rec.onerror=e=>toast(e.error==="not-allowed"?"اجازه میکروفون داده نشده. از تنظیمات سایت اجازه بده.":"تشخیص صدا با خطا روبه‌رو شد.",true);
  rec.onend=()=>{$("micButton").classList.remove("recording");$("micButton").setAttribute("aria-label","شروع ورودی صوتی");rec=null;};try{rec.start()}catch{rec=null;$("micButton").classList.remove("recording");}
 });
}
function initFirebase(){
 try{
  if(!firebaseConfig.apiKey||firebaseConfig.apiKey.startsWith("YOUR_"))throw new Error("Firebase config ناقصه");
  const app=initializeApp(firebaseConfig);state.auth=getAuth(app);
  onAuthStateChanged(state.auth,user=>{state.user=user;updateAccountUI();});
 }catch(e){console.warn("Firebase init:",e.message);updateAccountUI();}
}
$("sendButton").addEventListener("click",()=>sendMessage());
$("promptInput").addEventListener("input",resizeInput);
$("promptInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}});
$("newChat").addEventListener("click",startNewChat);
$("topSettings").addEventListener("click",openSettings);$("navSettings")?.addEventListener("click",openSettings);
$("closeSettings").addEventListener("click",closeSettings);$("doneSettings").addEventListener("click",closeSettings);
$("settingsOverlay").addEventListener("click",e=>{if(e.target===$("settingsOverlay"))closeSettings();});
$("providerSelect").addEventListener("change",()=>{if(!$("modelInput").value.trim()||Object.values(defaults).includes($("modelInput").value.trim()))$("modelInput").value=defaults[$("providerSelect").value];});
$("toggleKey").addEventListener("click",()=>{$("apiKeyInput").type=$("apiKeyInput").type==="password"?"text":"password";});
$("saveSettings").addEventListener("click",testConnection);
$("attachButton").addEventListener("click",()=>$("imageInput").click());
$("imageInput").addEventListener("change",e=>addImage(e.target.files?.[0]));
$("clearHistory").addEventListener("click",()=>{if(confirm("همه تاریخچه‌های ذخیره‌شده روی این دستگاه پاک بشن؟")){state.history=[];localStorage.removeItem("jarvis_history");renderHistory();toast("تاریخچه پاک شد.");}});
$("googleSignIn").addEventListener("click",signInGoogle);
$("accountButton").addEventListener("click",()=>state.user?openSettings():openSettings());
$("signOutButton").addEventListener("click",async()=>{try{await signOut(state.auth);toast("از حساب خارج شدی.");}catch(e){toast(e.message,true);}});
$("menuToggle").addEventListener("click",()=>$("sidebar").classList.add("open"));$("closeSidebar").addEventListener("click",()=>$("sidebar").classList.remove("open"));
document.querySelectorAll(".suggestion-card").forEach(b=>b.addEventListener("click",()=>sendMessage(b.dataset.prompt)));
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>{if(b.dataset.view==="settings"){openSettings();return;}if(b.dataset.view==="history"&&state.history.length){loadHistory(0);return;}document.querySelectorAll(".nav-item").forEach(n=>n.classList.toggle("active",n===b));$("sidebar").classList.remove("open");}));
document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();startNewChat();}if(e.key==="Escape"){closeSettings();$("sidebar").classList.remove("open");}});
initFirebase();setupVoice();renderHistory();updateModelLabel();updateAccountUI();if(state.apiKey)setConnection("online","کلید API ذخیره شده");if(!state.model)$("modelInput").value=defaults[state.provider];
