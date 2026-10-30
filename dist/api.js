import {config} from './config.js';
let session;try{session=JSON.parse(localStorage.getItem('payroll-session')||'null')}catch{session=null}
let refreshPromise;
function save(data){session=data?.access_token?{...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in}:null;if(session)localStorage.setItem('payroll-session',JSON.stringify(session));else localStorage.removeItem('payroll-session');return session;}
async function request(path,{method='GET',body,token=true,headers={}}={}){
 if(token&&session&&session.expires_at<Date.now()/1000+60){refreshPromise??=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token},token:false}).then(save).catch(e=>{save(null);throw e}).finally(()=>refreshPromise=null);await refreshPromise;}
 const response=await fetch(config.url+path,{method,headers:{apikey:config.key,...(token&&session?{Authorization:'Bearer '+session.access_token}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
 const text=await response.text();let data;try{data=text?JSON.parse(text):null}catch{throw new Error('The database returned an unreadable response. Please try again.');}
 if(!response.ok)throw new Error(data?.msg||data?.message||data?.error_description||data?.error||'Unable to connect. Please try again.');return data;
}
export const api={
 get user(){return session?.user},
 async login(email,password){save(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password},token:false}));},
 async signup(email,password){const data=await request('/auth/v1/signup',{method:'POST',body:{email,password},token:false});if(data.access_token)save(data);return data;},
 async verify(email,input,type='signup'){let body={email,token:input,type};if(/^https:\/\//i.test(input)){const u=new URL(input);if(u.origin!==config.url)throw new Error('Use the verification link from your Payroll email.');const token_hash=u.searchParams.get('token_hash')||u.searchParams.get('token');if(!token_hash)throw new Error('The verification link is missing its token.');body={token_hash,type};}save(await request('/auth/v1/verify',{method:'POST',body,token:false}));},
 async logout(){try{await request('/auth/v1/logout',{method:'POST'})}catch{/* Local sign-out must complete even when the network is unavailable. */}finally{save(null)}},
 async recover(email){return request('/auth/v1/recover',{method:'POST',body:{email},token:false})},
 async changePassword(password){return request('/auth/v1/user',{method:'PUT',body:{password}})},
 async acceptHash(){const p=new URLSearchParams(location.hash.slice(1));if(p.get('access_token')){const token=p.get('access_token');const user=await request('/auth/v1/user',{token:false,headers:{Authorization:'Bearer '+token}});save({access_token:token,refresh_token:p.get('refresh_token'),expires_in:Number(p.get('expires_in')||3600),user});history.replaceState(null,'',location.pathname);return p.get('type');}},
 async list(table,query=''){let result=[],offset=0;while(true){const data=await request(`/rest/v1/${table}?select=*&${query}&limit=1000&offset=${offset}`);result.push(...data);if(data.length<1000)return result;offset+=1000;}},
 async insert(table,body){return request('/rest/v1/'+table,{method:'POST',body,headers:{Prefer:'return=representation'}})},
 async update(table,id,body,expected){const rows=await request('/rest/v1/'+table+'?id=eq.'+encodeURIComponent(id)+(expected?'&updated_at=eq.'+encodeURIComponent(expected):''),{method:'PATCH',body,headers:{Prefer:'return=representation'}});if(!rows?.length)throw new Error('This record changed or you no longer have access. Refresh and try again.');return rows;},
 async remove(table,id){return request('/rest/v1/'+table+'?id=eq.'+encodeURIComponent(id),{method:'DELETE'})},
 async rpc(name,body){return request('/rest/v1/rpc/'+name,{method:'POST',body})}
};
