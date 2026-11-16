/* Mina AI single-admin authentication. Tokens stay in sessionStorage and expire server-side. */
(() => {
  "use strict";
  const API_BASE=(window.MINA_API_BASE||"https://mina-ai-platform.teknomail2025.workers.dev").replace(/\/$/,"");
  const TOKEN_KEY="mina-admin-session-v1";
  const nativeFetch=window.fetch.bind(window);
  const screen=document.getElementById("minaLogin");
  const form=document.getElementById("minaLoginForm");
  const username=document.getElementById("minaUsername");
  const password=document.getElementById("minaPassword");
  const errorBox=document.getElementById("minaLoginError");
  const submit=document.getElementById("minaLoginSubmit");
  const token=()=>{try{return sessionStorage.getItem(TOKEN_KEY)||"";}catch{return "";}};
  const setToken=value=>{try{if(value)sessionStorage.setItem(TOKEN_KEY,value);else sessionStorage.removeItem(TOKEN_KEY);}catch{}};
  function showLogin(message=""){
    document.body.classList.remove("mina-authenticated");
    screen.hidden=false;
    errorBox.textContent=message;
    password.value="";
    setTimeout(()=>username.focus(),0);
  }
  function enterApp(){
    screen.hidden=true;
    document.body.classList.add("mina-authenticated");
  }
  const isApiUrl=value=>{try{return new URL(value,location.href).origin===new URL(API_BASE).origin;}catch{return false;}};
  window.fetch=async(input,init={})=>{
    const rawUrl=typeof input==="string"?input:input.url;
    if(!isApiUrl(rawUrl)) return nativeFetch(input,init);
    const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));
    if(token()&&!rawUrl.includes("/api/auth/login")&&!rawUrl.includes("/api/health")) headers.set("Authorization","Bearer "+token());
    const response=await nativeFetch(input,{...init,headers});
    if(response.status===401&&!rawUrl.includes("/api/auth/login")){
      setToken("");
      showLogin("Oturumun sona erdi. Yeniden giriş yap.");
    }
    return response;
  };
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    errorBox.textContent="";
    submit.disabled=true;submit.textContent="Kontrol ediliyor…";
    try{
      const response=await nativeFetch(API_BASE+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:username.value.trim(),password:password.value})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.token) throw new Error(data.error||"Giriş başarısız. Bilgilerini kontrol et.");
      setToken(data.token);password.value="";enterApp();
      window.dispatchEvent(new CustomEvent("mina:authenticated"));
    }catch(error){errorBox.textContent=error.message||"Sunucuya bağlanılamadı.";}
    finally{submit.disabled=false;submit.textContent="Giriş yap";}
  });
  document.getElementById("minaLogoutBtn")?.addEventListener("click",()=>{
    setToken("");showLogin("Güvenli çıkış yapıldı.");
  });
  async function verifySession(){
    showLogin();
    const current=token();
    if(!current)return;
    try{
      const response=await nativeFetch(API_BASE+"/api/auth/me",{headers:{Authorization:"Bearer "+current}});
      if(response.ok){enterApp();return;}
    }catch{}
    setToken("");
    showLogin("Oturum doğrulanamadı. Lütfen yeniden giriş yap.");
  }
  verifySession();
})();
