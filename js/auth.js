(function(global){
"use strict";
const BASE=new URL("../",document.currentScript.src).href;
const PAGES={home:BASE+"index.html",account:BASE+"account/index.html",order:BASE+"order/index.html"};
async function getUser(){const {data}=await window.supabaseClient.auth.getUser();return data.user||null;}
const MalikAuth={
 pages:PAGES,
 isLoggedIn:async()=>!!(await getUser()),
 currentUser:async()=>await getUser(),
 register:async function(email,password,username=""){
  const {data,error}=await window.supabaseClient.auth.signUp({email:email.trim().toLowerCase(),password});
  if(error)return {ok:false,message:error.message};
  if(data.user){await window.supabaseClient.from("profiles").insert({id:data.user.id,username,email:email.toLowerCase(),role:"user"});}
  return {ok:true,message:"Register berhasil"};
 },
 login:async function(email,password){const {error}=await window.supabaseClient.auth.signInWithPassword({email:email.trim().toLowerCase(),password});return error?{ok:false,message:error.message}:{ok:true};},
 logout:async()=>await window.supabaseClient.auth.signOut(),
 orderUrl:function(o){return PAGES.order+(o&&o.product?"?product="+encodeURIComponent(o.product)+"&price="+encodeURIComponent(o.price):"")},
 setPending:o=>sessionStorage.setItem("malik_pending_order",JSON.stringify(o)),
 takePending:()=>{let x=sessionStorage.getItem("malik_pending_order");sessionStorage.removeItem("malik_pending_order");return x?JSON.parse(x):null}
};
global.MalikAuth=MalikAuth;
global.startOrder=async function(product,price){let o={product:product||"",price:Number(price)||0};if(await MalikAuth.isLoggedIn())location.href=MalikAuth.orderUrl(o);else{MalikAuth.setPending(o);location.href=PAGES.account;}return false;};
})(window);
