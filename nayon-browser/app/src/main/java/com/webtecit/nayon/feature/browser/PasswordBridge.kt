package com.webtecit.nayon.feature.browser

import org.json.JSONObject

/**
 * Password save and fill, Chrome-style, without exposing any Java object to web pages.
 *
 * The page script (top frame only) reports through WebView's message channel:
 * - `form`   a sign-in form is on screen (also forms drawn later by the site's JavaScript),
 * - `focus`  the user tapped a username or password field,
 * - `user`   a username step was submitted (email first, password on the next page),
 * - `submit` a sign-in was submitted (username + password),
 * - `gone`   the password field disappeared after a submit (single-page sites).
 *
 * NAYON uses the sender origin WebView itself reports, never a value from the page, and only for
 * https pages in normal (non-private) tabs. Saved passwords are written into a page only when the
 * user taps "Sign in as …", and only while the tab is still on the same origin.
 */
object PasswordBridge {
    const val CHANNEL = "NayonPasswords"

    /** True when the page shows a password field (fallback for old WebView versions). */
    const val HAS_PASSWORD_FIELD_JS = "!!document.querySelector('input[type=password]')"

    /** One message from the page. */
    data class Event(val type: String, val username: String = "", val password: String = "", val field: String = "")

    /** Runs at document start in every page. */
    val CAPTURE_SCRIPT = """(function(){try{if(window.top!==window)return;var ch=window.$CHANNEL;if(!ch)return;
var last=0,captured=false;function send(o){try{ch.postMessage(JSON.stringify(o));}catch(e){}}
function vis(e){return !!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);}
function isUser(el){if(!el||el.tagName!=='INPUT')return false;var t=(el.type||'text').toLowerCase();
if(t!=='text'&&t!=='email'&&t!=='tel')return false;if(t==='email')return true;
var s=((el.name||'')+' '+(el.id||'')+' '+(el.autocomplete||'')+' '+(el.placeholder||'')+' '+(el.getAttribute('aria-label')||'')).toLowerCase();
return /user|email|e-mail|login|phone|mobile|account|identifier|username/.test(s);}
function userBefore(root,pw){var c=root.querySelectorAll('input[type=email],input[type=text],input[type=tel],input:not([type])'),u=null;
for(var i=0;i<c.length;i++){if(c[i].value&&(c[i].compareDocumentPosition(pw)&4))u=c[i];}return u;}
function grab(scope){try{var root=scope||document,pws=root.querySelectorAll('input[type=password]'),pw=null;
for(var i=0;i<pws.length;i++){if(pws[i].value){pw=pws[i];break;}}
if(!pw){var ins=root.querySelectorAll('input');for(var j=0;j<ins.length;j++){if(isUser(ins[j])&&ins[j].value&&vis(ins[j])){send({t:'user',u:ins[j].value});return;}}return;}
var u=userBefore(pw.form||document,pw),now=Date.now();if(now-last<400)return;last=now;captured=true;
send({t:'submit',u:u?u.value:'',p:pw.value});}catch(e){}}
document.addEventListener('submit',function(e){grab(e.target);},true);
document.addEventListener('click',function(e){var t=e.target&&e.target.closest&&e.target.closest('button,input[type=submit],input[type=button],[role=button],a');
if(t)setTimeout(function(){grab(t.form||null);},0);},true);
document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target&&e.target.tagName==='INPUT')grab(e.target.form||null);},true);
document.addEventListener('focusin',function(e){var el=e.target;if(!el||el.tagName!=='INPUT')return;
if(el.type==='password')send({t:'focus',f:'p'});else if(isUser(el))send({t:'focus',f:'u'});},true);
var shown=false,pending=false;function scan(){pending=false;var pw=document.querySelector('input[type=password]');
if(pw&&!shown){shown=true;send({t:'form'});}if(captured&&!pw){captured=false;send({t:'gone'});}if(!pw&&shown)shown=false;}
function later(){if(!pending){pending=true;setTimeout(scan,350);}}
if(document.readyState!=='loading')later();else document.addEventListener('DOMContentLoaded',later);
try{new MutationObserver(later).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
}catch(e){}})();"""

    /**
     * Fills a sign-in: the first visible password field and the username field before it; on a
     * username-only step (email first), just the username field.
     */
    fun fillScript(username: String, password: String): String =
        """(function(u,p){try{function vis(e){return !!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);}
function set(el,v){if(!el||v==null)return;el.focus();var d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');d.set.call(el,v);
el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
var pws=document.querySelectorAll('input[type=password]'),pw=null;for(var i=0;i<pws.length;i++){if(vis(pws[i])){pw=pws[i];break;}}
if(pw){var c=(pw.form||document).querySelectorAll('input[type=email],input[type=text],input[type=tel],input:not([type])'),user=null;
for(var j=0;j<c.length;j++){if(vis(c[j])&&(c[j].compareDocumentPosition(pw)&4))user=c[j];}
if(user&&u)set(user,u);set(pw,p);return true;}
var a=document.activeElement;var cand=(a&&a.tagName==='INPUT'&&a.type!=='password'&&a.type!=='hidden')?a:
document.querySelector('input[type=email],input[autocomplete=username],input[autocomplete=email],input[name*=user i],input[name*=email i],input[id*=email i],input[type=tel],input[type=text]');
if(cand&&u){set(cand,u);return true;}return false;}catch(e){return false;}})(${JSONObject.quote(username)},${JSONObject.quote(password)})"""

    fun parse(message: String?): Event? = runCatching {
        val o = JSONObject(message ?: return null)
        val type = o.optString("t")
        when (type) {
            "submit" -> {
                val p = o.optString("p")
                if (p.isEmpty() || p.length > 1_000) null else Event(type, o.optString("u").take(500), p)
            }
            "user" -> o.optString("u").take(500).takeIf { it.isNotBlank() }?.let { Event(type, username = it) }
            "focus", "form", "gone" -> Event(type, field = o.optString("f"))
            else -> null
        }
    }.getOrNull()
}
